/**
 * Chamada à API do Claude (S18, S20.2): arquivos do projeto (PDFs recortados + texto posicionado, imagens)
 * → `ExtractionOutput` validado pelo schema zod (structured outputs) → JSON do CLI + relatório de revisão.
 * Este é o único módulo do repositório que fala com a rede, e só quando chamado: os testes injetam um
 * cliente falso.
 *
 * Credencial: `new Anthropic()` lê `ANTHROPIC_API_KEY` (ou o perfil do `ant auth login`); nada é
 * gravado nem registrado aqui. De cada PDF vão só as páginas pedidas.
 *
 * Sem structured outputs: a API recusou o schema (33 campos nullable; depois "gramática grande demais" mesmo
 * sem uniões), então o JSON Schema vai no system prompt e o zod valida a resposta em `finish`. Streaming
 * porque o SDK recusa chamadas sem stream que possam passar de 10 minutos; o texto cru fica no `ExtractError`.
 */

import Anthropic from '@anthropic-ai/sdk';
import { convert, reviewReport, type ConvertOptions, type Converted } from './convert';
import { listSheets, readPageText, subsetPdf, type PageText, type SheetInfo } from './pdf';
import { AUTO_BYTE_BUDGET, AUTO_PAGE_BUDGET, choosePages, classifySheet, sheetFromFileName, type Candidate, type SheetCategory } from './select';
import { buildUserContent, FULL_SYSTEM_PROMPT, type ExtractHints, type ImageMediaType, type PdfInput, type ImageInput } from './prompt';
import { ExtractionOutput } from './schema';

export const DEFAULT_MODEL = 'claude-opus-5-5';
/**
 * O raciocínio adaptativo conta no `max_tokens`: com effort alto e uma planta inteira, 32 000 acabaram antes
 * de o modelo escrever um byte de resposta (2026-10-15). 96 000 deixa folga; streaming permite até 128 000.
 */
export const DEFAULT_MAX_TOKENS = 96000;
/** Sem `pages` e sem folha reconhecível pelo carimbo, vão no máximo estas páginas do PDF. */
export const MAX_AUTO_PAGES = 20;

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type ExtractSource =
  | {
      kind: 'pdf';
      name: string;
      data: Uint8Array;
      /** Páginas (1-based). Ausente: planta A-1xx + schedule A-8xx pelo carimbo; sem eles, todas (até `MAX_AUTO_PAGES`). */
      pages?: readonly number[];
    }
  | { kind: 'image'; name: string; data: Uint8Array; mediaType: ImageMediaType };

export interface ExtractRequest {
  /** Arquivos do projeto: PDFs e/ou imagens, na ordem em que o modelo deve lê-los. */
  sources?: readonly ExtractSource[];
  /** Atalho de um PDF só (S18/S19): equivale a `sources: [{ kind: 'pdf', data: pdf, pages }]`. */
  pdf?: Uint8Array;
  pages?: readonly number[];
  hints?: ExtractHints;
  convert?: ConvertOptions;
}

/** Progresso da chamada (M7): fase e tokens de saída já recebidos (estimados pelo texto streamado). */
export interface ExtractProgress {
  phase: 'preparing' | 'waiting' | 'reading';
  inputTokens?: number;
  outputTokens: number;
}

export interface ExtractOptions {
  client?: Anthropic;
  model?: string;
  effort?: Effort;
  maxTokens?: number;
  /** Cancela a chamada em curso (M7): o SDK lança `APIUserAbortError`. */
  signal?: AbortSignal;
  onProgress?: (p: ExtractProgress) => void;
}

/** O que a prévia mostra antes de pagar (M7): páginas que vão, as que ficam de fora e o tamanho codificado. */
export interface ExtractPreviewInfo {
  pagesSent: { name: string; pages: number[] }[];
  pagesDropped: DroppedPage[];
  /** Por página enviada: número da folha e título do carimbo, quando lidos. */
  sheets: { name: string; page: number; sheet?: string; title?: string }[];
  /** Bytes dos PDFs recortados e imagens, já em base64 (o que conta para o limite da API). */
  encodedBytes: number;
  images: number;
}

/** Tokens de saída por caractere de JSON streamado (as duas leituras reais deram ~3,6). */
const CHARS_PER_OUTPUT_TOKEN = 3.6;

export interface ExtractResult {
  output: ExtractionOutput;
  project: Converted['project'];
  problems: Converted['problems'];
  warnings: Converted['warnings'];
  report: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /** Páginas efetivamente enviadas de cada PDF, na ordem de `sources`. */
  pagesSent: { name: string; pages: number[] }[];
  /** Páginas que a seleção automática deixou de fora por orçamento (vazio quando tudo coube). */
  pagesDropped: DroppedPage[];
}

export class ExtractError extends Error {
  constructor(
    message: string,
    public readonly rawText?: string,
  ) {
    super(message);
    this.name = 'ExtractError';
  }
}

export function normalizeSources(req: ExtractRequest): ExtractSource[] {
  const out: ExtractSource[] = [];
  if (req.pdf !== undefined) {
    out.push({ kind: 'pdf', name: 'planta.pdf', data: req.pdf, ...(req.pages === undefined ? {} : { pages: req.pages }) });
  }
  for (const s of req.sources ?? []) out.push(s);
  if (out.length === 0) throw new RangeError('extractWalls: informe ao menos um PDF ou imagem');
  return out;
}

/** Teto da API por requisição (32 MB, já com o base64). */
export const API_REQUEST_LIMIT = 32 * 1024 * 1024;

/** Uma página que ficou fora da seleção automática por orçamento. */
export interface DroppedPage {
  name: string;
  page: number;
  sheet: string | undefined;
  category: SheetCategory;
}

/**
 * Páginas de cada PDF sem `pages` pedidas, escolhidas juntas no conjunto todo (`select.ts`): por categoria
 * do carimbo e do nome do arquivo, dentro do orçamento de páginas e bytes. PDF sem nenhum número de folha
 * reconhecível (exportação, foto escaneada) entra com as primeiras `MAX_AUTO_PAGES` páginas como planta.
 * Devolve, na ordem de `sources`, as páginas de cada PDF automático (`undefined` para imagem ou PDF com
 * páginas pedidas) e as que ficaram de fora.
 */
export async function selectPages(
  sources: readonly ExtractSource[],
  level?: number,
): Promise<{ pages: (number[] | undefined)[]; dropped: DroppedPage[]; sheets: Map<string, SheetInfo> }> {
  const sheets = new Map<string, SheetInfo>();
  const scanned: { source: number; info: SheetInfo; bytes: number }[] = [];
  for (const [i, s] of sources.entries()) {
    if (s.kind !== 'pdf' || s.pages !== undefined) continue;
    const list = await listSheets(s.data);
    const perPage = s.data.byteLength / Math.max(1, list.length);
    // Folha de um arquivo só sem texto no carimbo (desenho exportado como vetor): o número vem do nome.
    const fromName = list.length === 1 ? sheetFromFileName(s.name) : undefined;
    for (const raw of list) {
      const info = raw.sheet === undefined && fromName !== undefined ? { ...raw, sheet: fromName } : raw;
      sheets.set(`${i}:${info.page}`, info);
      scanned.push({ source: i, info, bytes: perPage });
    }
  }
  // Nenhum carimbo no conjunto (fotos, exportações soltas): vão as primeiras páginas de cada PDF, como planta.
  const anySheet = scanned.some((x) => x.info.sheet !== undefined);
  const candidates: Candidate[] = scanned.map(({ source, info, bytes }) => ({
    source,
    page: info.page,
    category: anySheet
      ? classifySheet(info, sources[source]!.name, level)
      : info.page <= MAX_AUTO_PAGES
        ? 'plan'
        : 'skip',
    bytes,
    ...(info.sheet === undefined ? {} : { sheet: info.sheet }),
    titled: info.title !== undefined,
  }));
  const { chosen, dropped } = choosePages(candidates);
  const pages = sources.map((s, i) =>
    s.kind === 'pdf' && s.pages === undefined ? chosen.filter((c) => c.source === i).map((c) => c.page) : undefined,
  );
  return {
    pages,
    dropped: dropped.map((c) => ({
      name: sources[c.source]!.name,
      page: c.page,
      sheet: sheets.get(`${c.source}:${c.page}`)?.sheet,
      category: c.category,
    })),
    sheets,
  };
}

/** Páginas automáticas de um PDF sozinho (ver `selectPages`). */
export async function autoPages(data: Uint8Array, name = 'planta.pdf', level?: number): Promise<number[]> {
  const { pages } = await selectPages([{ kind: 'pdf', name, data }], level);
  return pages[0] ?? [];
}

/** Fontes prontas para a requisição: PDFs recortados com texto posicionado, imagens, e o que foi/ficou de fora. */
async function prepareSources(req: ExtractRequest) {
  const sources = normalizeSources(req);
  const pdfs: PdfInput[] = [];
  const images: ImageInput[] = [];
  const pagesSent: ExtractResult['pagesSent'] = [];
  const selection = await selectPages(sources, req.hints?.level);
  for (const [i, s] of sources.entries()) {
    if (s.kind === 'image') {
      images.push({ name: s.name, data: s.data, mediaType: s.mediaType });
      continue;
    }
    const pages = s.pages === undefined ? selection.pages[i]! : [...s.pages];
    if (pages.length === 0) {
      // Seleção automática que não achou nada útil neste arquivo (capa, detalhes): ele fica de fora.
      if (s.pages === undefined) continue;
      throw new RangeError(`${s.name}: nenhuma página pedida`);
    }
    const texts: PageText[] = [];
    for (const p of pages) texts.push(await readPageText(s.data, p));
    pdfs.push({ name: s.name, pdf: await subsetPdf(s.data, pages), pages: texts });
    pagesSent.push({ name: s.name, pages });
  }
  if (pdfs.length === 0 && images.length === 0) {
    throw new RangeError('nenhuma folha útil reconhecida nos arquivos (planta, schedule, elevação, corte, estrutura); informe as páginas');
  }
  const base64 = (n: number) => Math.ceil(n / 3) * 4;
  const encodedBytes = pdfs.reduce((n, p) => n + base64(p.pdf.byteLength), 0) + images.reduce((n, im) => n + base64(im.data.byteLength), 0);
  return { sources, pdfs, images, pagesSent, selection, encodedBytes };
}

/**
 * Prévia sem chamar a API (M7): quais páginas vão, quais ficam de fora e quanto pesa — o que a tela mostra
 * antes de o humano pagar a leitura. Mesma seleção e mesmo recorte da chamada real.
 */
export async function previewExtraction(req: ExtractRequest): Promise<ExtractPreviewInfo> {
  const { sources, images, pagesSent, selection, encodedBytes } = await prepareSources(req);
  const sheets: ExtractPreviewInfo['sheets'] = [];
  for (const sent of pagesSent) {
    const i = sources.findIndex((s) => s.name === sent.name);
    for (const page of sent.pages) {
      const info = selection.sheets.get(`${i}:${page}`);
      sheets.push({ name: sent.name, page, ...(info?.sheet === undefined ? {} : { sheet: info.sheet }), ...(info?.title === undefined ? {} : { title: info.title }) });
    }
  }
  return { pagesSent, pagesDropped: selection.dropped, sheets, encodedBytes, images: images.length };
}

/** Parâmetros da requisição, separados para teste e para `countTokens`. */
export async function buildRequest(req: ExtractRequest, opts: ExtractOptions = {}) {
  const { pdfs, images, pagesSent, selection, encodedBytes: total } = await prepareSources(req);
  if (total > API_REQUEST_LIMIT) {
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    throw new RangeError(
      `as folhas escolhidas somam ${mb(total)} MB codificados, acima do limite de ${mb(API_REQUEST_LIMIT)} MB da API; ` +
        'mande menos arquivos ou informe as páginas',
    );
  }
  const params = {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: [{ type: 'text' as const, text: FULL_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } }],
    messages: [
      {
        role: 'user' as const,
        content: buildUserContent({ pdfs, images, ...(req.hints === undefined ? {} : { hints: req.hints }) }),
      },
    ],
    // Sem `output_config.format`: a API recusa a gramática deste schema; o formato vai no system prompt.
    output_config: { effort: opts.effort ?? 'high' },
  } satisfies Anthropic.MessageCreateParamsNonStreaming;
  return { params, pagesSent, pagesDropped: selection.dropped };
}

export async function extractWalls(req: ExtractRequest, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const client = opts.client ?? new Anthropic();
  opts.onProgress?.({ phase: 'preparing', outputTokens: 0 });
  const { params, pagesSent, pagesDropped } = await buildRequest(req, opts);
  opts.signal?.throwIfAborted();
  opts.onProgress?.({ phase: 'waiting', outputTokens: 0 });
  // Streaming: o SDK exige para respostas longas (max_tokens alto); `finalMessage` junta tudo. O progresso (M7)
  // vem do texto que chega: tokens de saída estimados por caractere; a entrada, do `message_start`.
  const stream = client.messages.stream(params, opts.signal === undefined ? {} : { signal: opts.signal });
  if (opts.onProgress !== undefined) {
    const report = opts.onProgress;
    let chars = 0;
    let inputTokens: number | undefined;
    stream.on('streamEvent', (e) => {
      if (e.type === 'message_start') inputTokens = e.message.usage.input_tokens;
    });
    stream.on('text', (delta) => {
      chars += delta.length;
      report({ phase: 'reading', outputTokens: Math.round(chars / CHARS_PER_OUTPUT_TOKEN), ...(inputTokens === undefined ? {} : { inputTokens }) });
    });
  }
  const response = await stream.finalMessage();
  const text = stripFences(textOf(response));

  if (response.stop_reason === 'refusal') {
    const why = response.stop_details?.type === 'refusal' ? response.stop_details.explanation : undefined;
    throw new ExtractError(`o modelo recusou a extração${why ? `: ${why}` : ''}`, text);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ExtractError(`resposta cortada em ${params.max_tokens} tokens; aumente maxTokens`, text);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ExtractError(`a resposta não é JSON: ${(e as Error).message}`, text);
  }
  const done = finish(raw, req.convert, response.model, {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });
  return { ...done, warnings: [...droppedWarning(pagesDropped), ...done.warnings], pagesSent, pagesDropped };
}

/** Aviso das folhas que a seleção automática deixou de fora por orçamento. */
export function droppedWarning(dropped: readonly DroppedPage[]): string[] {
  if (dropped.length === 0) return [];
  const list = dropped
    .slice(0, 12)
    .map((d) => `${d.sheet ?? `p.${d.page}`} (${d.category})`)
    .join(', ');
  return [
    `extração FOLHAS_FORA: ${dropped.length} folha(s) útil(eis) ficaram fora do orçamento de ${AUTO_PAGE_BUDGET} páginas / ` +
      `${AUTO_BYTE_BUDGET / (1024 * 1024)} MB: ${list}${dropped.length > 12 ? '…' : ''} — para incluí-las, mande menos ` +
      'arquivos ou informe as páginas',
  ];
}

/** Mesmo pós-processamento da chamada real, para respostas gravadas (fixtures) e para o CLI. */
export function finish(
  raw: unknown,
  convertOpts: ConvertOptions | undefined,
  model: string,
  usage: ExtractResult['usage'],
): ExtractResult {
  const parsed = ExtractionOutput.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ExtractError(`resposta fora do schema: ${issues.join('; ')}`, JSON.stringify(raw));
  }
  const output = parsed.data;
  const converted = convert(output, convertOpts);
  return {
    output,
    project: converted.project,
    problems: converted.problems,
    warnings: converted.warnings,
    report: reviewReport(output, converted),
    model,
    usage,
    pagesSent: [],
    pagesDropped: [],
  };
}

/**
 * Erro da API da Anthropic (autenticação, limite, 5xx…) em forma neutra, para quem chama não precisar
 * depender do SDK. `undefined` para qualquer outro erro.
 */
export function apiErrorInfo(e: unknown): { status: number | undefined; message: string; authentication: boolean; aborted: boolean } | undefined {
  if (!(e instanceof Anthropic.APIError)) return undefined;
  return { status: e.status, message: e.message, authentication: e instanceof Anthropic.AuthenticationError, aborted: e instanceof Anthropic.APIUserAbortError };
}

/** Tira uma cerca de código (```json … ```) se o modelo a puser apesar da instrução. */
export function stripFences(text: string): string {
  const m = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(text);
  return m?.[1] ?? text.trim();
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
