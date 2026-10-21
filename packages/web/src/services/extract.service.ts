/**
 * Regra de negócio da extração (docs/10-design.md §7): arquivos do projeto (PDF, imagens) → IA → projeto
 * para revisão. Só servidor. Único lugar do app que importa `extract`. A chamada real fica em `deps`
 * para os testes injetarem uma falsa; a chave nunca sai do servidor. M7: prévia sem chamar a API, páginas por
 * arquivo, e a chamada registrada como job (progresso, cancelamento, resultado recolhível depois de um F5).
 */

import 'server-only';
import {
  apiErrorInfo,
  ExtractError,
  extractWalls,
  finish,
  previewExtraction,
  type ExtractHints,
  type ExtractResult,
  type ExtractSource,
  type ImageMediaType,
} from 'extract';
import { toConvertOptions } from '@/schemas/extract';
import { EMPTY_PROJECT_DATA, type ExtractOutcome, type ExtractPreview, type ProjectData, type WallReview } from '@/types/extract';
import { createJob, finishJob, reportProgress } from './extract-jobs';

export type { ExtractOutcome, OpeningReview, WallReview } from '@/types/extract';

export interface UploadedFile {
  name: string;
  /** MIME do navegador; pode vir vazio — a extensão decide. */
  type: string;
  bytes: Uint8Array;
}

export interface ExtractDeps {
  extract: typeof extractWalls;
  preview?: typeof previewExtraction;
  hasKey: () => boolean;
}

export function hasKey(): boolean {
  return (process.env['ANTHROPIC_API_KEY'] ?? '').trim() !== '';
}

export const defaultDeps: ExtractDeps = { extract: extractWalls, preview: previewExtraction, hasKey };

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
  /** Páginas por arquivo (M7); vence `pages` para o arquivo que estiver aqui. */
  pagesByFile?: Readonly<Record<string, readonly number[]>>;
  hints?: ExtractHints;
  /** O que o humano sabe e os desenhos não trazem (altura, estrutural); aplicado só onde o modelo deixou null. */
  given?: ProjectData;
  /** Id do job (M7): registra progresso e cancelamento e guarda o resultado para um cliente que recarregou. */
  jobId?: string;
}

function sourcesOf(files: readonly UploadedFile[], opts: Pick<FromFilesOptions, 'pages' | 'pagesByFile'>): ExtractSource[] | string {
  const sources: ExtractSource[] = [];
  for (const f of files) {
    const s = toSource(f, opts.pagesByFile?.[f.name] ?? opts.pages);
    if (typeof s === 'string') return s;
    sources.push(s);
  }
  return sources;
}

export async function fromFiles(files: readonly UploadedFile[], opts: FromFilesOptions = {}, deps: ExtractDeps = defaultDeps): Promise<ExtractOutcome> {
  if (!deps.hasKey()) {
    return {
      ok: false,
      reason: 'no_key',
      message: 'AI reading is off on this server: no API key is configured. Open a project file, or ask whoever runs this server to add the key.',
    };
  }
  if (files.length === 0) return { ok: false, reason: 'input', message: 'Add at least one PDF or image.' };
  const given = opts.given ?? EMPTY_PROJECT_DATA;
  const sources = sourcesOf(files, opts);
  if (typeof sources === 'string') return { ok: false, reason: 'input', message: sources };
  const job = opts.jobId === undefined ? undefined : createJob(opts.jobId);
  let outcome: ExtractOutcome;
  try {
    const result = await deps.extract(
      {
        sources,
        ...(opts.hints === undefined ? {} : { hints: opts.hints }),
        convert: toConvertOptions(given),
      },
      job === undefined ? {} : { signal: job.controller.signal, onProgress: (p) => reportProgress(job, p) },
    );
    outcome = toOutcome(result, given);
  } catch (e) {
    outcome = failure(e);
  }
  if (job !== undefined) finishJob(job, outcome);
  return outcome;
}

/**
 * Prévia (M7): o que iria para a API — páginas de cada PDF (com folha e título), as que ficam fora, imagens e
 * tamanho codificado — sem chamar a API e sem precisar da chave.
 */
export async function preview(files: readonly UploadedFile[], opts: Pick<FromFilesOptions, 'pages' | 'pagesByFile' | 'hints'> = {}, deps: ExtractDeps = defaultDeps): Promise<ExtractPreview> {
  if (files.length === 0) return { ok: false, message: 'Add at least one PDF or image.' };
  const sources = sourcesOf(files, opts);
  if (typeof sources === 'string') return { ok: false, message: sources };
  const run = deps.preview ?? previewExtraction;
  try {
    const info = await run({ sources, ...(opts.hints === undefined ? {} : { hints: opts.hints }) });
    const out: Extract<ExtractPreview, { ok: true }>['files'] = sources.map((s) => ({
      name: s.name,
      kind: s.kind,
      pages: info.sheets.filter((p) => p.name === s.name).map(({ page, sheet, title }) => ({ page, ...(sheet === undefined ? {} : { sheet }), ...(title === undefined ? {} : { title }) })),
      dropped: info.pagesDropped.filter((d) => d.name === s.name).map((d) => ({ page: d.page, ...(d.sheet === undefined ? {} : { sheet: d.sheet }), category: d.category })),
    }));
    return { ok: true, files: out, pagesTotal: info.pagesSent.reduce((n, p) => n + p.pages.length, 0), images: info.images, encodedBytes: info.encodedBytes };
  } catch (e) {
    if (e instanceof RangeError || e instanceof SyntaxError) return { ok: false, message: e.message };
    throw e;
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
  if (api?.aborted || (e instanceof Error && e.name === 'AbortError')) {
    return { ok: false, reason: 'cancelled', message: 'Read cancelled. Nothing was kept; the API charges for what was sent.' };
  }
  if (api?.authentication) {
    return { ok: false, reason: 'api', message: 'The API rejected the server credential. Check the key configured on the server.' };
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
