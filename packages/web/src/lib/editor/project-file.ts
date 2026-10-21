/**
 * Arquivo de projeto do app (M2): o JSON do CLI **mais** a leitura da IA, num arquivo só (`<slug>.panelizer.json`).
 * A leitura vai numa chave `$panelizer` na raiz, que o parser do CLI ignora (como `$comment`): o mesmo arquivo
 * roda em `panelizer build` e, reaberto no app, traz a proveniência (confiança, notas, relatório) de volta.
 * Puro; sem DOM.
 */

import { textFromDraft, type ProjectDraft } from './draft';
import type { ExtractOutcome } from '@/types/extract';

export type Reading = Extract<ExtractOutcome, { ok: true }>;

export const PROJECT_FILE_KEY = '$panelizer';
export const PROJECT_FILE_VERSION = 1;
export const PROJECT_FILE_SUFFIX = '.panelizer.json';

/** O que vai no arquivo além do projeto: a leitura sem `projectText` (é o próprio projeto) e sem `problems` (recalculados). */
type StoredReading = Omit<Reading, 'ok' | 'projectText'>;

export interface ParsedProjectFile {
  /** JSON do CLI, sem a chave `$panelizer`, formatado. */
  projectText: string;
  /** Leitura da IA, quando o arquivo a trazia. */
  reading: Reading | undefined;
}

export function projectFileName(slug: string): string {
  return `${slug}${PROJECT_FILE_SUFFIX}`;
}

/** Texto do arquivo: o draft como o CLI o lê, com a leitura (se houver) em `$panelizer`. */
export function projectFileText(draft: ProjectDraft, reading: Reading | undefined): string {
  const project = JSON.parse(textFromDraft(draft)) as Record<string, unknown>;
  delete project[PROJECT_FILE_KEY];
  if (reading === undefined) return JSON.stringify(project, null, 2);
  const { ok: _ok, projectText: _text, ...rest } = reading;
  const stored: StoredReading = rest;
  return JSON.stringify({ ...project, [PROJECT_FILE_KEY]: { version: PROJECT_FILE_VERSION, reading: stored } }, null, 2);
}

/**
 * Lê um arquivo de projeto: o do app (com `$panelizer`) ou o do CLI puro. Texto que não é JSON volta como está
 * (o editor mostra o erro de carga). `$panelizer` de versão desconhecida ou malformado é descartado em silêncio:
 * o projeto abre sem leitura.
 */
export function parseProjectFile(text: string): ParsedProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { projectText: text, reading: undefined };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { projectText: text, reading: undefined };
  const obj = { ...(raw as Record<string, unknown>) };
  const meta = obj[PROJECT_FILE_KEY];
  if (meta === undefined) return { projectText: text, reading: undefined };
  delete obj[PROJECT_FILE_KEY];
  const projectText = JSON.stringify(obj, null, 2);
  const reading = readingFrom(meta, projectText);
  return { projectText, reading };
}

function readingFrom(meta: unknown, projectText: string): Reading | undefined {
  if (meta === null || typeof meta !== 'object') return undefined;
  const m = meta as { version?: unknown; reading?: unknown };
  if (m.version !== PROJECT_FILE_VERSION || m.reading === null || typeof m.reading !== 'object') return undefined;
  const r = m.reading as Partial<StoredReading>;
  if (!Array.isArray(r.walls) || typeof r.projectName !== 'string' || typeof r.model !== 'string') return undefined;
  return {
    ok: true,
    output: r.output,
    given: r.given ?? { wallHeight: '', headerHeight: '', sillHeight: '', floors: '', floorSpan: '', snow: '', width: '', wind: '', exposure: '' },
    projectName: r.projectName,
    level: typeof r.level === 'number' ? r.level : 1,
    origin: typeof r.origin === 'string' ? r.origin : '',
    projectText,
    walls: r.walls,
    openingTypes: Array.isArray(r.openingTypes) ? r.openingTypes : [],
    notes: Array.isArray(r.notes) ? r.notes : [],
    problems: Array.isArray(r.problems) ? r.problems : [],
    warnings: Array.isArray(r.warnings) ? r.warnings : [],
    report: typeof r.report === 'string' ? r.report : '',
    model: r.model,
    usage: r.usage ?? { inputTokens: 0, outputTokens: 0 },
    pagesSent: Array.isArray(r.pagesSent) ? r.pagesSent : [],
  };
}
