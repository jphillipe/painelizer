/**
 * Sessão salva no navegador (M2): o projeto aberto no editor sobrevive a F5, fechar a aba e "Start over" por engano.
 * Uma leitura da IA custa ~10 min e ~US$ 1,50; antes disto, vivia só no estado do cliente. Puro sobre um
 * `StorageLike` (o `localStorage` na tela; um `Map` nos testes). Até a S22 (projetos salvos) isto é a persistência.
 */

import { textFromDraft, type ProjectDraft } from './draft';
import type { Reading } from './project-file';
import type { DraftSource, EditorState } from './state';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SESSION_KEY = 'panelizer.session.v1';
export const JOB_KEY = 'panelizer.job.v1';
/** Depois disto um job de extração salvo é lixo (a chamada real passa de 10–15 min). */
export const JOB_MAX_AGE_MS = 60 * 60 * 1000;

export interface SavedSession {
  version: 1;
  savedAt: number;
  name: string;
  /** JSON do CLI (`textFromDraft`): a volta passa pelo mesmo `load` do editor. */
  text: string;
  source: DraftSource;
  dirty: boolean;
  /** Leitura da IA de onde o projeto veio, quando houver (proveniência). */
  reading?: Reading;
}

export interface SavedJob {
  startedAt: number;
  files: { name: string; size: number }[];
}

const SOURCES: readonly DraftSource[] = ['extraction', 'sample', 'file'];

export function sessionFromState(state: EditorState, reading: Reading | undefined, now: number): SavedSession | undefined {
  const { draft, source } = state;
  if (draft === undefined || source === undefined) return undefined;
  const session: SavedSession = {
    version: 1,
    savedAt: now,
    name: draft.name ?? reading?.projectName ?? 'Untitled project',
    text: textFromDraft(draft),
    source,
    dirty: state.dirty,
  };
  if (reading !== undefined) session.reading = reading;
  return session;
}

/** Grava; se não couber (quota), tenta sem a leitura — o projeto vale mais que a proveniência. Devolve o que gravou. */
export function saveSession(storage: StorageLike, session: SavedSession): 'full' | 'without-reading' | 'failed' {
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(session));
    return 'full';
  } catch {
    if (session.reading === undefined) return 'failed';
    try {
      const { reading: _r, ...slim } = session;
      storage.setItem(SESSION_KEY, JSON.stringify(slim));
      return 'without-reading';
    } catch {
      return 'failed';
    }
  }
}

export function loadSession(storage: StorageLike): SavedSession | undefined {
  let raw: unknown;
  try {
    const text = storage.getItem(SESSION_KEY);
    if (text === null) return undefined;
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (raw === null || typeof raw !== 'object') return undefined;
  const s = raw as Partial<SavedSession>;
  if (s.version !== 1 || typeof s.savedAt !== 'number' || typeof s.text !== 'string' || typeof s.name !== 'string') return undefined;
  if (s.source === undefined || !SOURCES.includes(s.source)) return undefined;
  const session: SavedSession = { version: 1, savedAt: s.savedAt, name: s.name, text: s.text, source: s.source, dirty: s.dirty === true };
  if (s.reading !== undefined && s.reading !== null && typeof s.reading === 'object' && s.reading.ok === true) session.reading = s.reading;
  return session;
}

export function clearSession(storage: StorageLike): void {
  try {
    storage.removeItem(SESSION_KEY);
  } catch {
    /* sem storage */
  }
}

export function saveJob(storage: StorageLike, job: SavedJob): void {
  try {
    storage.setItem(JOB_KEY, JSON.stringify(job));
  } catch {
    /* sem storage */
  }
}

/** Job de extração que estava em voo quando a página recarregou (mais novo que `JOB_MAX_AGE_MS`). */
export function loadJob(storage: StorageLike, now: number): SavedJob | undefined {
  try {
    const text = storage.getItem(JOB_KEY);
    if (text === null) return undefined;
    const raw = JSON.parse(text) as Partial<SavedJob>;
    if (typeof raw.startedAt !== 'number' || !Array.isArray(raw.files)) return undefined;
    if (now - raw.startedAt > JOB_MAX_AGE_MS) return undefined;
    return { startedAt: raw.startedAt, files: raw.files };
  } catch {
    return undefined;
  }
}

export function clearJob(storage: StorageLike): void {
  try {
    storage.removeItem(JOB_KEY);
  } catch {
    /* sem storage */
  }
}

/** "just now", "5 min ago", "3 h ago", "2 days ago" — para o banner de retomada. */
export function describeAge(savedAt: number, now: number): string {
  const s = Math.max(0, Math.round((now - savedAt) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
