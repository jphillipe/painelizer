/**
 * Sessão salva no navegador (M2): o projeto aberto no editor sobrevive a F5, fechar a aba e "Start over" por engano.
 * Uma leitura da IA custa ~10 min e ~US$ 1,50; antes disto, vivia só no estado do cliente. Puro sobre um
 * `StorageLike` (o `localStorage` na tela; um `Map` nos testes). Com projetos salvos (S22) é o buffer de queda.
 *
 * S23: uma sessão por projeto. Projeto salvo no servidor grava em `panelizer.session.v1:<id>`; projeto que vive só
 * no navegador (sem Supabase, sample ainda não editado, criação em curso) na chave antiga `panelizer.session.v1`.
 * Antes era uma chave só, e abrir um projeto sobrescrevia a sessão de outro. Sessões mais velhas que
 * `SESSION_MAX_AGE_MS` são apagadas ao abrir `/app`; se a quota estourar, as outras sessões saem da mais velha
 * para a mais nova antes de desistir da leitura.
 */

import { draftFromText, textFromDraft } from './draft';
import { normalizeReading, type Reading } from './project-file';
import type { DraftSource, EditorState } from './state';

/** O pedaço do `localStorage` que a sessão usa; `length`/`key` para achar as sessões de cada projeto. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

/** Sessão do projeto que ainda não tem id no servidor (e a chave única de antes da S23). */
export const SESSION_KEY = 'panelizer.session.v1';
const SESSION_PREFIX = `${SESSION_KEY}:`;
export const JOB_KEY = 'panelizer.job.v1';
/** Depois disto um job de extração salvo é lixo (a chamada real passa de 10–15 min). */
export const JOB_MAX_AGE_MS = 60 * 60 * 1000;
/** Sessão sem uso há mais que isto é apagada (o projeto salvo continua no servidor). */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

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
  /** Projeto já salvo no servidor (S22.1): a retomada abre a URL dele em vez de criar outro. */
  project?: { id: string; revision: number };
}

/** Leitura em voo (M7): o `jobId` é o que deixa a tela de espera voltar depois de um F5 e recolher o resultado. */
export interface SavedJob {
  /** Ausente num job gravado antes da S23: não dá para retomar, só avisar que se perdeu. */
  jobId?: string;
  startedAt: number;
  files: { name: string; size: number }[];
}

const SOURCES: readonly DraftSource[] = ['extraction', 'sample', 'file'];

/** Chave da sessão de um projeto (`undefined` = projeto só no navegador). */
export function sessionKey(projectId?: string): string {
  return projectId === undefined ? SESSION_KEY : `${SESSION_PREFIX}${projectId}`;
}

function isSessionKey(key: string): boolean {
  return key === SESSION_KEY || key.startsWith(SESSION_PREFIX);
}

export function sessionFromState(state: EditorState, reading: Reading | undefined, now: number, project?: { id: string; revision: number }): SavedSession | undefined {
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
  if (project !== undefined) session.project = { id: project.id, revision: project.revision };
  return session;
}

/**
 * Grava na chave do projeto. Se não couber (quota): tira as outras sessões, da mais velha para a mais nova, e
 * tenta de novo; se ainda não couber, grava sem a leitura — o projeto vale mais que a proveniência.
 */
export function saveSession(storage: StorageLike, session: SavedSession): 'full' | 'without-reading' | 'failed' {
  const key = sessionKey(session.project?.id);
  const text = JSON.stringify(session);
  if (trySet(storage, key, text)) return 'full';
  for (const other of storedSessions(storage).filter((s) => s.key !== key)) {
    clearSession(storage, other.key);
    if (trySet(storage, key, text)) return 'full';
  }
  if (session.reading === undefined) return 'failed';
  const { reading: _r, ...slim } = session;
  return trySet(storage, key, JSON.stringify(slim)) ? 'without-reading' : 'failed';
}

function trySet(storage: StorageLike, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function parseSession(text: string | null): SavedSession | undefined {
  if (text === null) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (raw === null || typeof raw !== 'object') return undefined;
  const s = raw as Partial<SavedSession>;
  if (s.version !== 1 || typeof s.savedAt !== 'number' || typeof s.text !== 'string' || typeof s.name !== 'string') return undefined;
  if (s.source === undefined || !SOURCES.includes(s.source)) return undefined;
  const session: SavedSession = { version: 1, savedAt: s.savedAt, name: s.name, text: s.text, source: s.source, dirty: s.dirty === true };
  if (s.reading !== undefined && s.reading !== null && typeof s.reading === 'object' && s.reading.ok === true) session.reading = normalizeReading(s.reading);
  const p = s.project;
  if (p !== undefined && p !== null && typeof p === 'object' && typeof p.id === 'string' && Number.isInteger(p.revision) && p.revision >= 1) session.project = { id: p.id, revision: p.revision };
  return session;
}

/** Sessão de um projeto (por padrão, a do projeto só no navegador). */
export function loadSession(storage: StorageLike, key: string = SESSION_KEY): SavedSession | undefined {
  try {
    return parseSession(storage.getItem(key));
  } catch {
    return undefined;
  }
}

/** Chaves de sessão no storage com o conteúdo lido (`undefined` = lixo), da mais velha para a mais nova. */
function storedSessions(storage: StorageLike): { key: string; session: SavedSession | undefined }[] {
  const out: { key: string; session: SavedSession | undefined }[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null && isSessionKey(key)) out.push({ key, session: loadSession(storage, key) });
    }
  } catch {
    return [];
  }
  return out.sort((a, b) => (a.session?.savedAt ?? -Infinity) - (b.session?.savedAt ?? -Infinity));
}

/** Limpeza por idade: apaga sessões ilegíveis ou sem uso há mais de `maxAge`. Devolve quantas apagou. */
export function pruneSessions(storage: StorageLike, now: number, maxAge: number = SESSION_MAX_AGE_MS): number {
  let removed = 0;
  for (const { key, session } of storedSessions(storage)) {
    if (session === undefined || now - session.savedAt > maxAge) {
      clearSession(storage, key);
      removed++;
    }
  }
  return removed;
}

/** A sessão mais recente de qualquer projeto (o banner "Resume" de `/app`), depois da limpeza por idade. */
export function latestSession(storage: StorageLike, now: number): SavedSession | undefined {
  pruneSessions(storage, now);
  return storedSessions(storage).at(-1)?.session;
}

/**
 * Edições deste navegador que o servidor não tem (S23): a sessão do projeto `id` sobre a MESMA revisão que o servidor
 * devolveu, com texto diferente — o auto-save não chegou a gravar (debounce, rede, editor quebrou). Revisão
 * diferente quer dizer que alguém gravou depois: vale a versão do servidor (é o "Reload" do conflito).
 */
export function unsavedEdits(storage: StorageLike, id: string, revision: number, serverProjectText: string): SavedSession | undefined {
  const session = loadSession(storage, sessionKey(id));
  if (session === undefined || session.project?.id !== id || session.project.revision !== revision) return undefined;
  const server = draftFromText(serverProjectText);
  if (!server.ok || textFromDraft(server.draft) === session.text) return undefined;
  return session;
}

export function clearSession(storage: StorageLike, key: string = SESSION_KEY): void {
  try {
    storage.removeItem(key);
  } catch {
    /* sem storage */
  }
}

export function saveJob(storage: StorageLike, job: SavedJob): void {
  try {
    const saved: SavedJob = { startedAt: job.startedAt, files: job.files };
    if (job.jobId !== undefined) saved.jobId = job.jobId;
    storage.setItem(JOB_KEY, JSON.stringify(saved));
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
    const job: SavedJob = { startedAt: raw.startedAt, files: raw.files };
    if (typeof raw.jobId === 'string' && raw.jobId !== '') job.jobId = raw.jobId;
    return job;
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
