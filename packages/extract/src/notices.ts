/**
 * Avisos e problemas da leitura (S26): código em inglês, ids e parâmetros, como os do motor. A frase em português
 * continua em `message` (CLI, `revisao.md`); o app monta a sua a partir do código. Módulo puro (sem pdfjs nem
 * SDK): o app importa no navegador por `extract/notices`.
 *
 * Arquivos gravados antes da S26 (`$panelizer.reading` de um `.panelizer.json`, sessão do navegador) trazem os
 * avisos como texto (`extração ABERTURA_SEM_POSICAO: parede W, abertura J (tag): …`): `legacyNotice` lê esse
 * formato uma vez, na abertura do arquivo, e troca o código antigo pelo novo (`LEGACY_EXTRACT_CODES`). É o único
 * lugar que lê o português — e só o de arquivos velhos.
 */

import type { EngineNotice, MessageParams } from 'core';

/** Avisos da própria leitura (conversão e seleção de folhas). */
export const EXTRACT_WARNING_CODES = [
  'OPENING_UNPLACED',
  'OPENING_UNSIZED',
  'DOOR_RO_HEIGHT_ASSUMED',
  'OPENING_ESTIMATED',
  'ROOM_WITHOUT_DOOR',
  'DEFAULT_HEADER_HEIGHT',
  'TILES_DROPPED',
  'SHEETS_DROPPED',
  'SHEET_DUPLICATE',
  'NO_TITLE_BLOCK',
] as const;
export type ExtractWarningCode = (typeof EXTRACT_WARNING_CODES)[number];

/** Problemas que só a conversão aponta (o resto vem do parser do CLI ou do motor, com o código de lá). */
export const EXTRACT_PROBLEM_CODES = ['WALL_HEIGHT_MISSING', 'PROJECT_INVALID', 'ENGINE_INTERNAL'] as const;
export type ExtractProblemCode = (typeof EXTRACT_PROBLEM_CODES)[number];

/** Erros da leitura (`ExtractError` e entrada inválida), para a tela dizer o que houve sem ler o português. */
export const EXTRACT_ERROR_CODES = [
  'NO_SOURCES',
  'NO_PAGES_REQUESTED',
  'NO_USEFUL_SHEETS',
  'REQUEST_TOO_LARGE',
  'PAGE_OUT_OF_RANGE',
  'RESPONSE_NOT_JSON',
  'MODEL_REFUSED',
  'OUTPUT_TRUNCATED',
  'CONTEXT_EXCEEDED',
  'PAUSE_TURN',
  'TOOL_USE',
  'NO_STOP_REASON',
  'UNKNOWN_STOP_REASON',
  'SCHEMA_MISMATCH',
] as const;
export type ExtractErrorCode = (typeof EXTRACT_ERROR_CODES)[number];

/** Código antigo (português, até a S25) → código novo. Aceito só na leitura de arquivos gravados. */
export const LEGACY_EXTRACT_CODES: Readonly<Record<string, ExtractWarningCode>> = {
  ABERTURA_SEM_POSICAO: 'OPENING_UNPLACED',
  ABERTURA_SEM_MEDIDA: 'OPENING_UNSIZED',
  ALTURA_RO_PORTA: 'DOOR_RO_HEIGHT_ASSUMED',
  ABERTURA_ESTIMADA: 'OPENING_ESTIMATED',
  COMODO_SEM_PORTA: 'ROOM_WITHOUT_DOOR',
  ALTURA_PADRAO: 'DEFAULT_HEADER_HEIGHT',
  RECORTES_FORA: 'TILES_DROPPED',
  FOLHAS_FORA: 'SHEETS_DROPPED',
  FOLHA_DUPLICADA: 'SHEET_DUPLICATE',
  SEM_CARIMBO: 'NO_TITLE_BLOCK',
};

/**
 * Aviso ou problema da leitura. `source`: `extraction` (a conversão ou a seleção), `engine` (aviso ou erro do
 * motor), `parser` (o parser do CLI recusou o projeto), `project` (falta um dado do projeto inteiro, como a altura).
 * `panelId` nos avisos do motor; `path` no erro do parser; `stage` no erro do motor (etapa do build).
 */
export interface ReadingNotice extends EngineNotice {
  source: 'extraction' | 'engine' | 'parser' | 'project';
  panelId?: string;
  path?: string;
  stage?: 'plan' | 'wall' | 'bom' | 'files';
}

/** Aviso da leitura com a frase em português. */
export function extractionNotice(
  code: ExtractWarningCode,
  message: string,
  where: { wallId?: string; openingId?: string } = {},
  params: MessageParams = {},
): ReadingNotice {
  return { source: 'extraction', code, message, ...where, params };
}

const STAGE_PREFIX: Record<NonNullable<ReadingNotice['stage']>, string> = { plan: 'planta: ', wall: '', bom: 'lista de material: ', files: '' };

/**
 * A linha de texto (CLI, `revisao.md`, `pedido.json`): `extração CODE: …`, `<painel> CODE: … (hipótese P30)`,
 * `parser: …`, `motor: …`, `altura: …`.
 */
export function noticeText(n: ReadingNotice): string {
  switch (n.source) {
    case 'extraction':
      return `extração ${n.code}: ${n.message}`;
    case 'engine':
      if (n.panelId !== undefined) return `${n.panelId} ${n.code}: ${n.message}${n.hypothesis === undefined ? '' : ` (hipótese ${n.hypothesis})`}`;
      return `motor: ${STAGE_PREFIX[n.stage ?? 'wall']}${n.message}`;
    case 'parser':
      return `parser: ${n.message}`;
    case 'project':
      return `altura: ${n.message}`;
  }
}

// ---- arquivos gravados antes da S26 -------------------------------------------------------------------------

const LEGACY_EXTRACTION = /^extração ([A-Z][A-Z0-9_]*): ([\s\S]*)$/;
const LEGACY_PANEL_WARNING = /^(\S+) ([A-Z][A-Z0-9_]+): ([\s\S]*)$/;
const LEGACY_PANEL_ID = /^\d+-(.+)-P\d+$/;
const LEGACY_PREFIX = /^(parser|motor|altura): ([\s\S]*)$/;
const LEGACY_WALL_OPENING = /^parede (\S+?), abertura (\S+?)(?: \(([^)]*)\))?: /;
const LEGACY_HYPOTHESIS = / \(hipótese (P\d+)\)$/;
const LEGACY_PATH = /^\S+?\.(walls\[\d+\](?:\.openings\[\d+\])?[\w.[\]]*):/;

/**
 * Aviso/problema gravado como texto (antes da S26) → `ReadingNotice`. O texto inteiro fica em `message` (vira o
 * "Details"); código antigo vira o novo; parede e abertura saem do prefixo `parede X, abertura Y` que a conversão
 * sempre escreveu; o painel dá a parede (`1-W01-P1`).
 */
export function legacyNotice(text: string): ReadingNotice {
  const ext = LEGACY_EXTRACTION.exec(text);
  if (ext) {
    const code = LEGACY_EXTRACT_CODES[ext[1]!] ?? ext[1]!;
    const body = ext[2]!;
    const n: ReadingNotice = { source: 'extraction', code, message: body };
    const wo = LEGACY_WALL_OPENING.exec(body);
    if (wo) {
      n.wallId = wo[1]!;
      n.openingId = wo[2]!;
      if (wo[3] !== undefined && wo[3] !== '?') n.params = { tag: wo[3] };
    }
    return n;
  }
  const pre = LEGACY_PREFIX.exec(text);
  if (pre) {
    const source = pre[1] === 'parser' ? 'parser' : pre[1] === 'altura' ? 'project' : 'engine';
    const code = source === 'project' ? 'WALL_HEIGHT_MISSING' : source === 'parser' ? 'PROJECT_INVALID' : 'ENGINE_INTERNAL';
    const n: ReadingNotice = { source, code, message: pre[2]! };
    if (source === 'parser') {
      const path = LEGACY_PATH.exec(pre[2]!);
      if (path) n.path = path[1]!;
    }
    return n;
  }
  const pw = LEGACY_PANEL_WARNING.exec(text);
  if (pw) {
    const n: ReadingNotice = { source: 'engine', code: pw[2]!, panelId: pw[1]!, message: pw[3]! };
    const wall = LEGACY_PANEL_ID.exec(pw[1]!);
    if (wall) n.wallId = wall[1]!;
    const hyp = LEGACY_HYPOTHESIS.exec(n.message);
    if (hyp) {
      n.hypothesis = hyp[1] as `P${number}`;
      n.message = n.message.slice(0, hyp.index);
    }
    const wo = LEGACY_WALL_OPENING.exec(n.message);
    if (wo && (n.wallId === undefined || n.wallId === wo[1])) n.openingId = wo[2]!;
    return n;
  }
  return { source: 'engine', code: 'ENGINE_INTERNAL', message: text };
}

/** Lista gravada (texto antigo ou objetos novos) → avisos; o que não é nem um nem outro sai. */
export function readingNotices(raw: unknown): ReadingNotice[] {
  if (!Array.isArray(raw)) return [];
  const out: ReadingNotice[] = [];
  for (const item of raw) {
    if (typeof item === 'string') out.push(legacyNotice(item));
    else if (isNotice(item)) out.push(item);
  }
  return out;
}

function isNotice(v: unknown): v is ReadingNotice {
  if (v === null || typeof v !== 'object') return false;
  const n = v as Partial<ReadingNotice>;
  return typeof n.code === 'string' && typeof n.message === 'string' && typeof n.source === 'string';
}

/**
 * Entrada que a leitura não aceita (nenhum arquivo, página fora do PDF, conjunto grande demais). `RangeError`
 * para quem já tratava assim; `code` e `params` para a tela.
 */
export class ExtractInputError extends RangeError {
  readonly code: ExtractErrorCode;
  readonly params: MessageParams;
  constructor(code: ExtractErrorCode, message: string, params: MessageParams = {}) {
    super(message);
    this.name = 'ExtractInputError';
    this.code = code;
    this.params = params;
  }
}
