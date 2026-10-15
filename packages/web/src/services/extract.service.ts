/**
 * Regra de negócio da extração (docs/10-design.md §7): arquivos do projeto (PDF, imagens) → IA → projeto
 * para revisão. Só servidor. Único lugar do app que importa `extract`. A chamada real fica em `deps`
 * para os testes injetarem uma falsa; a chave nunca sai do servidor.
 */

import 'server-only';
import {
  apiErrorInfo,
  ExtractError,
  extractWalls,
  finish,
  type ExtractHints,
  type ExtractResult,
  type ExtractSource,
  type ImageMediaType,
} from 'extract';
import { toConvertOptions } from '@/schemas/extract';
import { EMPTY_PROJECT_DATA, type ExtractOutcome, type ProjectData, type WallReview } from '@/types/extract';

export type { ExtractOutcome, OpeningReview, WallReview } from '@/types/extract';

export interface UploadedFile {
  name: string;
  /** MIME do navegador; pode vir vazio — a extensão decide. */
  type: string;
  bytes: Uint8Array;
}

export interface ExtractDeps {
  extract: typeof extractWalls;
  hasKey: () => boolean;
}

export function hasKey(): boolean {
  return (process.env['ANTHROPIC_API_KEY'] ?? '').trim() !== '';
}

export const defaultDeps: ExtractDeps = { extract: extractWalls, hasKey };

const IMAGE_TYPES: Record<string, ImageMediaType> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** PDF, PNG, JPG, WebP, GIF; qualquer outra coisa é entrada inválida. */
export function toSource(file: UploadedFile, pages: readonly number[] | undefined): ExtractSource | string {
  const ext = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  if (file.type === 'application/pdf' || ext === '.pdf') {
    return { kind: 'pdf', name: file.name, data: file.bytes, ...(pages === undefined ? {} : { pages }) };
  }
  const mediaType = IMAGE_TYPES[file.type] ?? IMAGE_TYPES[ext];
  if (mediaType === undefined) return `Unsupported file: ${file.name}. Use PDF, PNG, JPG, WebP or GIF.`;
  return { kind: 'image', name: file.name, data: file.bytes, mediaType };
}

export interface FromFilesOptions {
  /** Páginas (1-based) a enviar de cada PDF; ausente = carimbo (A-1xx, A-8xx) ou todas. */
  pages?: readonly number[];
  hints?: ExtractHints;
  /** O que o humano sabe e os desenhos não trazem (altura, estrutural); aplicado só onde o modelo deixou null. */
  given?: ProjectData;
}

export async function fromFiles(files: readonly UploadedFile[], opts: FromFilesOptions = {}, deps: ExtractDeps = defaultDeps): Promise<ExtractOutcome> {
  if (!deps.hasKey()) {
    return {
      ok: false,
      reason: 'no_key',
      message: 'AI extraction is off on this server: ANTHROPIC_API_KEY is not set. Try a sample, or import a project file under Advanced.',
    };
  }
  if (files.length === 0) return { ok: false, reason: 'input', message: 'Add at least one PDF or image.' };
  const given = opts.given ?? EMPTY_PROJECT_DATA;
  const sources: ExtractSource[] = [];
  for (const f of files) {
    const s = toSource(f, opts.pages);
    if (typeof s === 'string') return { ok: false, reason: 'input', message: s };
    sources.push(s);
  }
  try {
    const result = await deps.extract(
      {
        sources,
        ...(opts.hints === undefined ? {} : { hints: opts.hints }),
        convert: toConvertOptions(given),
      },
      {},
    );
    return toOutcome(result, given);
  } catch (e) {
    return failure(e);
  }
}

/** Resposta gravada do modelo (JSON) → mesmo pós-processamento, sem chave e sem rede. */
export function fromRecorded(raw: unknown, given: ProjectData = EMPTY_PROJECT_DATA): ExtractOutcome {
  try {
    return toOutcome(finish(raw, toConvertOptions(given), 'recorded', { inputTokens: 0, outputTokens: 0 }), given);
  } catch (e) {
    return failure(e);
  }
}

function failure(e: unknown): ExtractOutcome {
  if (e instanceof ExtractError) {
    return { ok: false, reason: 'extraction', message: e.message, ...(e.rawText === undefined ? {} : { rawText: e.rawText }) };
  }
  const api = apiErrorInfo(e);
  if (api?.authentication) {
    return { ok: false, reason: 'api', message: 'The API rejected the server credential. Check ANTHROPIC_API_KEY.' };
  }
  if (api) {
    return { ok: false, reason: 'api', message: `API error${api.status === undefined ? '' : ` ${api.status}`}: ${api.message}` };
  }
  if (e instanceof RangeError || e instanceof SyntaxError) return { ok: false, reason: 'input', message: e.message };
  throw e;
}

function point(p: { x: string; y: string }): string {
  return `(${p.x}, ${p.y})`;
}

/** Reaplica dados do projeto a uma leitura já feita (revisão), sem chamar a IA; mantém modelo e páginas. */
export function reconvert(raw: unknown, given: ProjectData, meta: { model: string; pagesSent: { name: string; pages: number[] }[] }): ExtractOutcome {
  try {
    const r = finish(raw, toConvertOptions(given), meta.model, { inputTokens: 0, outputTokens: 0 });
    return toOutcome({ ...r, pagesSent: meta.pagesSent }, given);
  } catch (e) {
    return failure(e);
  }
}

export function toOutcome(r: ExtractResult, given: ProjectData): ExtractOutcome {
  const walls: WallReview[] = r.output.walls.map((w) => ({
    id: w.id,
    geometry: w.start !== null && w.end !== null ? `${point(w.start)} → ${point(w.end)}` : (w.length ?? '—'),
    section: w.section,
    wallType: w.wallType,
    exterior: w.exterior,
    bearing: w.bearing,
    openings: w.openings.map((o) => ({
      id: o.id,
      kind: o.tag ?? o.type ?? '—',
      position: o.center ?? (o.offset === null ? '—' : `edge ${o.offset}`),
      confidence: o.confidence,
    })),
    confidence: w.confidence,
    evidence: w.evidence,
  }));
  return {
    ok: true,
    output: r.output,
    given,
    projectName: r.output.projectName,
    level: r.output.level,
    origin: r.output.origin,
    projectText: JSON.stringify(r.project, null, 2),
    walls,
    openingTypes: r.output.openingTypes.map((t) => ({ tag: t.tag, kind: t.kind, size: `${t.width} × ${t.height}`, confidence: t.confidence })),
    notes: r.output.notes,
    problems: r.problems,
    warnings: r.warnings,
    report: r.report,
    model: r.model,
    usage: r.usage,
    pagesSent: r.pagesSent,
  };
}
