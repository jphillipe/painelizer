/**
 * Regra de negócio da extração (docs/10-design.md §7): arquivos do projeto (PDF, imagens) → IA → projeto
 * para revisão. Só servidor. Único lugar do app que importa `extract`. A chamada real fica em `deps`
 * para os testes injetarem uma falsa; a chave nunca sai do servidor. M7: prévia sem chamar a API, páginas por
 * arquivo, e a chamada registrada como job (progresso, cancelamento, resultado recolhível depois de um F5).
 */

import 'server-only';
import {
  apiErrorInfo,
  EFFORTS,
  ExtractError,
  ExtractInputError,
  extractWalls,
  finish,
  previewExtraction,
  type Effort,
  type ExtractHints,
  type ExtractOptions,
  type ExtractResult,
  type ExtractSource,
  type ImageMediaType,
} from 'extract';
import type { DrawingRef } from '@/lib/drawings';
import { extractErrorMessage } from '@/lib/messages.en';
import { toConvertOptions } from '@/schemas/extract';
import { EMPTY_PROJECT_DATA, type ExtractOutcome, type ExtractPreview, type ProjectData, type ReadingProvenance, type WallReview } from '@/types/extract';
import { defaultDeps as defaultJobsDeps, startJob, type ExtractJobsDeps } from './extract-jobs';

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
  /** Onde os jobs de leitura moram (S24): o banco, ou memória sem Supabase e nos testes. */
  jobs?: ExtractJobsDeps;
}

export function hasKey(): boolean {
  return (process.env['ANTHROPIC_API_KEY'] ?? '').trim() !== '';
}

export const defaultDeps: ExtractDeps = { extract: extractWalls, preview: previewExtraction, hasKey };

/**
 * Modelo e effort da leitura pelo ambiente (S25, B6): `EXTRACT_MODEL` (padrão do extract: `claude-opus-5-5`) e
 * `EXTRACT_EFFORT` (`low` | `medium` | `high` | `xhigh` | `max`; padrão `high`). Vazio = padrão; effort fora da
 * lista é ignorado (a leitura não pode quebrar por um erro de digitação no deploy). Ambos vão para a
 * proveniência gravada na leitura.
 */
export function extractModelOptions(env: Readonly<Record<string, string | undefined>> = process.env): Pick<ExtractOptions, 'model' | 'effort'> {
  const model = (env['EXTRACT_MODEL'] ?? '').trim();
  const effort = (env['EXTRACT_EFFORT'] ?? '').trim().toLowerCase();
  return {
    ...(model === '' ? {} : { model }),
    ...((EFFORTS as readonly string[]).includes(effort) ? { effort: effort as Effort } : {}),
  };
}

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
  /** Dono do job (S24): id do usuário da sessão; ausente sem Supabase. */
  owner?: string | undefined;
  /**
   * Desenhos no Storage de onde a leitura sai (S22.3). Entram no resultado guardado no job (S24): sem isso, a
   * leitura recolhida depois de um F5 chegava sem os caminhos, o projeto não os referenciava e a limpeza do bucket
   * apagaria a planta de fundo.
   */
  drawings?: readonly DrawingRef[] | undefined;
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
  const job = opts.jobId === undefined ? undefined : await startJob(opts.jobId, opts.owner, deps.jobs ?? defaultJobsDeps);
  let outcome: ExtractOutcome;
  try {
    const result = await deps.extract(
      {
        sources,
        ...(opts.hints === undefined ? {} : { hints: opts.hints }),
        convert: toConvertOptions(given),
      },
      { ...extractModelOptions(), ...(job === undefined ? {} : { signal: job.signal, onProgress: (p) => job.report(p) }) },
    );
    outcome = withDrawings(toOutcome(result, given), opts.drawings);
  } catch (e) {
    try {
      outcome = failure(e);
    } catch (unexpected) {
      // Erro que `failure` não reconhece sobe para a action; o job não pode ficar `running` com batimento eterno.
      await job?.finish({ ok: false, reason: 'api', message: 'The read failed on the server.' });
      throw unexpected;
    }
  }
  await job?.finish(outcome);
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
    // Pelo índice da fonte, não pelo nome (S25): dois arquivos com o mesmo nome não trocam páginas.
    const out: Extract<ExtractPreview, { ok: true }>['files'] = sources.map((s, i) => ({
      name: s.name,
      kind: s.kind,
      pages: info.sheets
        .filter((p) => p.source === i)
        .map(({ page, sheet, title, category }) => ({ page, ...(sheet === undefined ? {} : { sheet }), ...(title === undefined ? {} : { title }), ...(category === undefined ? {} : { category }) })),
      dropped: info.pagesDropped.filter((d) => d.source === i).map((d) => ({ page: d.page, ...(d.sheet === undefined ? {} : { sheet: d.sheet }), category: d.category })),
    }));
    return {
      ok: true,
      files: out,
      pagesTotal: info.pagesSent.reduce((n, p) => n + p.pages.length, 0),
      images: info.images,
      encodedBytes: info.encodedBytes,
      tiles: { count: info.tiles.count, encodedBytes: info.tiles.encodedBytes },
      textChars: info.textChars,
    };
  } catch (e) {
    const input = inputError(e);
    if (input !== undefined) return { ok: false, ...input };
    throw e;
  }
}

/**
 * Entrada que o extract recusou (S26): frase em inglês pelo código (`ExtractInputError`), a original em `detail`.
 * `undefined` = não é erro de entrada.
 */
function inputError(e: unknown): { message: string; detail: string; code?: string } | undefined {
  if (e instanceof ExtractInputError) return { message: extractErrorMessage(e.code, e.params), detail: e.message, code: e.code };
  if (e instanceof RangeError || e instanceof SyntaxError) return { message: 'The files could not be read. See Details.', detail: e.message };
  return undefined;
}

/** Resposta gravada do modelo (JSON) → mesmo pós-processamento, sem chave e sem rede. */
export function fromRecorded(raw: unknown, given: ProjectData = EMPTY_PROJECT_DATA): ExtractOutcome {
  try {
    return toOutcome(finish(raw, toConvertOptions(given), 'recorded', { inputTokens: 0, outputTokens: 0 }), given);
  } catch (e) {
    return failure(e);
  }
}

/**
 * Action `finishResponse` (S23, A9): um sample de leitura gravada pelo id — o servidor lê a resposta dos próprios
 * exemplos, o cliente não manda JSON — sempre; JSON colado ("Advanced") só com as ferramentas de desenvolvimento.
 * Antes qualquer sessão logada mandava qualquer JSON para a conversão em produção.
 */
export function replayRecorded(input: { sampleId?: string | undefined; responseJson?: string | undefined }, opts: { devTools: boolean; sample: (id: string) => string | undefined }): ExtractOutcome {
  let text: string;
  if (input.sampleId !== undefined) {
    const sample = opts.sample(input.sampleId);
    if (sample === undefined) return { ok: false, reason: 'input', message: `There is no sample reading “${input.sampleId}”.` };
    text = sample;
  } else if (input.responseJson !== undefined) {
    if (!opts.devTools) return { ok: false, reason: 'input', message: 'Recorded responses can only be loaded on a development server.' };
    text = input.responseJson;
  } else {
    return { ok: false, reason: 'input', message: 'Pick a sample or paste a recorded response.' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'input', message: `Not valid JSON: ${(e as Error).message}` };
  }
  return fromRecorded(raw);
}

function failure(e: unknown): ExtractOutcome {
  if (e instanceof ExtractError) {
    return {
      ok: false,
      reason: 'extraction',
      message: extractErrorMessage(e.code, e.params),
      detail: e.message,
      ...(e.code === undefined ? {} : { code: e.code }),
      ...(e.rawText === undefined ? {} : { rawText: e.rawText }),
    };
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
  const input = inputError(e);
  if (input !== undefined) return { ok: false, reason: 'input', ...input };
  throw e;
}

function point(p: { x: string; y: string }): string {
  return `(${p.x}, ${p.y})`;
}

/** Reaplica dados do projeto a uma leitura já feita (revisão), sem chamar a IA; mantém modelo, páginas, desenhos e proveniência. */
export function reconvert(
  raw: unknown,
  given: ProjectData,
  meta: { model: string; pagesSent: { name: string; pages: number[] }[]; drawings?: DrawingRef[] | undefined; provenance?: ReadingProvenance | undefined },
): ExtractOutcome {
  try {
    const r = finish(raw, toConvertOptions(given), meta.model, { inputTokens: 0, outputTokens: 0 });
    const outcome = withDrawings(toOutcome({ ...r, pagesSent: meta.pagesSent }, given), meta.drawings);
    return outcome.ok && meta.provenance !== undefined ? { ...outcome, provenance: meta.provenance } : outcome;
  } catch (e) {
    return failure(e);
  }
}

/** A leitura com os desenhos do Storage de onde saiu (S22.3); só numa leitura que deu certo. */
export function withDrawings(outcome: ExtractOutcome, drawings: readonly DrawingRef[] | undefined): ExtractOutcome {
  if (!outcome.ok || drawings === undefined || drawings.length === 0) return outcome;
  return { ...outcome, drawings: [...drawings] };
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
    ...(r.provenance === undefined ? {} : { provenance: { ...r.provenance, tiles: r.provenance.tiles === false ? false : { ...r.provenance.tiles } } }),
  };
}
