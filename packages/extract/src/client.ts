/**
 * Chamada à API do Claude (S18, S20.2): arquivos do projeto (PDFs recortados + texto posicionado, recortes em
 * alta resolução das plantas, imagens) → `ExtractionOutput` validado pelo schema zod → JSON do CLI + relatório
 * de revisão. Este é o único módulo do repositório que fala com a rede, e só quando chamado: os testes injetam
 * um cliente falso.
 *
 * Credencial: `new Anthropic()` lê `ANTHROPIC_API_KEY` (ou o perfil do `ant auth login`); nada é
 * gravado nem registrado aqui. De cada PDF vão só as páginas pedidas.
 *
 * Sem structured outputs: a API recusou o schema (33 campos nullable; depois "gramática grande demais" mesmo
 * sem uniões), então o JSON Schema vai no system prompt e o zod valida a resposta em `finish`. Streaming
 * porque o SDK recusa chamadas sem stream que possam passar de 10 minutos; o texto cru fica no `ExtractError`.
 *
 * Recortes (2026-10-30): as páginas de planta vão também em imagens de alta resolução (`tiles.ts`,
 * `renderPageTiles`), renderizadas só na chamada real — a prévia só conta e estima, porque roda a cada
 * mudança do formulário.
 */

import Anthropic from '@anthropic-ai/sdk';
import { convert, reviewReport, type ConvertOptions, type Converted } from './convert';
import { listSheets, readPageText, renderPageTiles, subsetPdf, type PageText, type SheetInfo } from './pdf';
import { AUTO_BYTE_BUDGET, AUTO_PAGE_BUDGET, choosePages, classifySheet, sheetFromFileName, tiledCategory, type Candidate, type SheetCategory } from './select';
import { buildUserContent, FULL_SYSTEM_PROMPT, type ExtractHints, type ImageMediaType, type PageTile, type PdfInput, type ImageInput } from './prompt';
import { ExtractionOutput } from './schema';
import { allocateTiles, DEFAULT_TILE_OPTIONS, estimateTileBytes, type TileGrid, type TileOptions, type TilePage } from './tiles';

export const DEFAULT_MODEL = 'claude-opus-5-5';
/**
 * O raciocínio adaptativo conta no `max_tokens`: com effort alto e uma planta inteira, 32 000 acabaram antes
 * de o modelo escrever um byte de resposta (2026-10-15); 96 000 bastaram para o Ringgold, mas no Horace (32 folhas,
 * 633 k tokens de entrada) o raciocínio comeu o teto com 17 k de resposta escrita (2026-10-30). 128 000 é o máximo
 * do streaming; só custa o que for usado.
 */
export const DEFAULT_MAX_TOKENS = 128000;
/** Sem `pages` e sem folha reconhecível pelo carimbo, vão no máximo estas páginas do PDF. */
export const MAX_AUTO_PAGES = 20;

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type ExtractSource =
  | {
      kind: 'pdf';
      name: string;
      data: Uint8Array;
      /** Páginas (1-based). Ausente: seleção automática pelo carimbo (`select.ts`); sem carimbo, as primeiras `MAX_AUTO_PAGES`. */
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
  /** Recortes em alta resolução das plantas: ligado por padrão; `false` desliga; objeto ajusta `DEFAULT_TILE_OPTIONS`. */
  tiles?: boolean | Partial<TileOptions>;
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

/** Recortes de uma página: quantos e em que resolução. */
export interface TiledPage {
  name: string;
  page: number;
  tiles: number;
  dpi: number;
}

/** Resumo dos recortes de uma requisição (prévia e resultado). */
export interface TilesInfo {
  count: number;
  /** Bytes codificados dos recortes: medidos quando renderizados, estimados na prévia. */
  encodedBytes: number;
  pages: TiledPage[];
  /** Páginas de planta que ficaram sem recorte por falta de orçamento (20 imagens por requisição). */
  skipped: { name: string; page: number }[];
}

/** O que a prévia mostra antes de pagar (M7): páginas que vão, as que ficam de fora e o tamanho codificado. */
export interface ExtractPreviewInfo {
  pagesSent: { name: string; pages: number[] }[];
  pagesDropped: DroppedPage[];
  /** Por página enviada: número da folha, título do carimbo e categoria, quando lidos. */
  sheets: { name: string; page: number; sheet?: string; title?: string; category?: SheetCategory }[];
  /** Bytes dos PDFs recortados, imagens e recortes (estimados), já em base64 (o que conta para o limite da API). */
  encodedBytes: number;
  images: number;
  tiles: TilesInfo;
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
  /** Recortes efetivamente enviados. */
  tilesSent: TiledPage[];
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

/** Opções de recorte efetivas, ou `undefined` quando desligado. */
export function tileOptionsOf(req: Pick<ExtractRequest, 'tiles'>): TileOptions | undefined {
  if (req.tiles === false) return undefined;
  return { ...DEFAULT_TILE_OPTIONS, ...(typeof req.tiles === 'object' ? req.tiles : {}) };
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

export interface PageSelection {
  /** Na ordem de `sources`: páginas de cada PDF automático; `undefined` para imagem ou PDF com páginas pedidas. */
  pages: (number[] | undefined)[];
  dropped: DroppedPage[];
  /** Carimbo de cada página lida, por `"<fonte>:<página>"` — também dos PDFs com páginas pedidas. */
  sheets: Map<string, SheetInfo>;
  /** Categoria de cada página, por `"<fonte>:<página>"`: a da seleção para as automáticas; para as pedidas, pelo carimbo (sem carimbo = planta). */
  categories: Map<string, SheetCategory>;
}

/**
 * Páginas de cada PDF sem `pages` pedidas, escolhidas juntas no conjunto todo (`select.ts`): por categoria
 * do carimbo e do nome do arquivo, dentro do orçamento de páginas e bytes. PDF sem nenhum número de folha
 * reconhecível (exportação, foto escaneada) entra com as primeiras `MAX_AUTO_PAGES` páginas como planta.
 * PDFs com páginas pedidas também têm o carimbo lido (para a prévia e para saber quais páginas recortar),
 * mas a escolha é a do humano.
 */
export async function selectPages(sources: readonly ExtractSource[], level?: number): Promise<PageSelection> {
  const sheets = new Map<string, SheetInfo>();
  const categories = new Map<string, SheetCategory>();
  const scanned: { source: number; info: SheetInfo; bytes: number }[] = [];
  const explicit: { source: number; info: SheetInfo }[] = [];
  for (const [i, s] of sources.entries()) {
    if (s.kind !== 'pdf') continue;
    const list = await listSheets(s.data);
    const perPage = s.data.byteLength / Math.max(1, list.length);
    // Folha de um arquivo só sem texto no carimbo (desenho exportado como vetor): o número vem do nome.
    const fromName = list.length === 1 ? sheetFromFileName(s.name) : undefined;
    for (const raw of list) {
      const info = raw.sheet === undefined && fromName !== undefined ? { ...raw, sheet: fromName } : raw;
      sheets.set(`${i}:${info.page}`, info);
      if (s.pages === undefined) scanned.push({ source: i, info, bytes: perPage });
      else if (s.pages.includes(info.page)) explicit.push({ source: i, info });
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
  for (const c of candidates) categories.set(`${c.source}:${c.page}`, c.category);
  // Página pedida pelo humano: pelo carimbo quando há; sem carimbo reconhecível, quem pediu a página pediu a planta.
  for (const { source, info } of explicit) {
    categories.set(`${source}:${info.page}`, info.sheet === undefined ? 'plan' : classifySheet(info, sources[source]!.name, level));
  }
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
    categories,
  };
}

/** Páginas automáticas de um PDF sozinho (ver `selectPages`). */
export async function autoPages(data: Uint8Array, name = 'planta.pdf', level?: number): Promise<number[]> {
  const { pages } = await selectPages([{ kind: 'pdf', name, data }], level);
  return pages[0] ?? [];
}

const base64Size = (n: number) => Math.ceil(n / 3) * 4;

interface PreparedTiles {
  /** Por `"<fonte>:<página>"`. */
  grids: Map<string, TileGrid>;
  pages: Map<string, { source: number; page: number; width: number; height: number }>;
  skipped: { name: string; page: number }[];
  options: TileOptions;
}

interface Prepared {
  sources: ExtractSource[];
  pdfs: PdfInput[];
  images: ImageInput[];
  pagesSent: ExtractResult['pagesSent'];
  selection: PageSelection;
  /** PDFs recortados + imagens, em base64. */
  baseEncodedBytes: number;
  /** Recortes: medidos quando renderizados, estimados na prévia. */
  tileEncodedBytes: number;
  tiles: PreparedTiles | undefined;
}

/**
 * Fontes prontas para a requisição: PDFs recortados com texto posicionado, imagens, recortes das plantas, e o
 * que foi/ficou de fora. `render: false` (prévia) só planeja os recortes e estima os bytes.
 */
async function prepareSources(req: ExtractRequest, { render }: { render: boolean }): Promise<Prepared> {
  const sources = normalizeSources(req);
  const pdfs: PdfInput[] = [];
  const pdfIndex = new Map<number, PdfInput>();
  const images: ImageInput[] = [];
  const pagesSent: ExtractResult['pagesSent'] = [];
  const selection = await selectPages(sources, req.hints?.level);
  const tileOpts = tileOptionsOf(req);
  const tilePages: TilePage[] = [];
  const pageMeta = new Map<string, { source: number; page: number; width: number; height: number }>();
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
    for (const p of pages) {
      const text = await readPageText(s.data, p);
      texts.push(text);
      const key = `${i}:${p}`;
      const category = tileOpts === undefined ? undefined : tiledCategory(selection.categories.get(key) ?? 'skip');
      if (category !== undefined) {
        tilePages.push({ key, category, width: text.width, height: text.height });
        pageMeta.set(key, { source: i, page: p, width: text.width, height: text.height });
      }
    }
    const input: PdfInput = { name: s.name, pdf: await subsetPdf(s.data, pages), pages: texts };
    pdfs.push(input);
    pdfIndex.set(i, input);
    pagesSent.push({ name: s.name, pages });
  }
  if (pdfs.length === 0 && images.length === 0) {
    throw new RangeError('nenhuma folha útil reconhecida nos arquivos (planta, schedule, elevação, corte, estrutura); informe as páginas');
  }
  const baseEncodedBytes = pdfs.reduce((n, p) => n + base64Size(p.pdf.byteLength), 0) + images.reduce((n, im) => n + base64Size(im.data.byteLength), 0);

  let tiles: PreparedTiles | undefined;
  let tileEncodedBytes = 0;
  if (tileOpts !== undefined && tilePages.length > 0) {
    const { grids, skipped } = allocateTiles(tilePages, tileOpts, images.length);
    tiles = {
      grids,
      pages: pageMeta,
      skipped: skipped.map((k) => ({ name: sources[pageMeta.get(k)!.source]!.name, page: pageMeta.get(k)!.page })),
      options: tileOpts,
    };
    if (render) {
      tileEncodedBytes = await renderTiles(sources, selection, tiles, pdfIndex, tileOpts.format);
    } else {
      for (const grid of grids.values()) for (const t of grid.tiles) tileEncodedBytes += estimateTileBytes(t.width, t.height, tileOpts.format);
    }
  }
  return { sources, pdfs, images, pagesSent, selection, baseEncodedBytes, tileEncodedBytes, tiles };
}

/** Renderiza os recortes planejados e os pendura nos `PdfInput`; devolve os bytes codificados. */
async function renderTiles(
  sources: readonly ExtractSource[],
  selection: PageSelection,
  tiles: PreparedTiles,
  pdfIndex: Map<number, PdfInput>,
  format: TileOptions['format'],
): Promise<number> {
  let bytes = 0;
  for (const input of pdfIndex.values()) input.tiles = [];
  for (const [key, grid] of tiles.grids) {
    const meta = tiles.pages.get(key)!;
    const source = sources[meta.source]!;
    if (source.kind !== 'pdf') continue;
    const rendered = await renderPageTiles(source.data, meta.page, grid, format);
    const info = selection.sheets.get(key);
    const pageTiles: PageTile[] = rendered.map((tile) => ({
      page: meta.page,
      ...(info?.sheet === undefined ? {} : { sheet: info.sheet }),
      ...(info?.title === undefined ? {} : { title: info.title }),
      grid,
      tile,
    }));
    const input = pdfIndex.get(meta.source)!;
    input.tiles = [...(input.tiles ?? []), ...pageTiles];
    for (const t of rendered) bytes += base64Size(t.data.byteLength);
  }
  return bytes;
}

function tilesInfo(p: Prepared): TilesInfo {
  if (p.tiles === undefined) return { count: 0, encodedBytes: 0, pages: [], skipped: [] };
  const pages: TiledPage[] = [];
  let count = 0;
  for (const [key, grid] of p.tiles.grids) {
    const meta = p.tiles.pages.get(key)!;
    pages.push({ name: p.sources[meta.source]!.name, page: meta.page, tiles: grid.tiles.length, dpi: grid.dpi });
    count += grid.tiles.length;
  }
  return { count, encodedBytes: p.tileEncodedBytes, pages, skipped: p.tiles.skipped };
}

/**
 * Prévia sem chamar a API (M7): quais páginas vão, quais ficam de fora, quantos recortes e quanto pesa — o que
 * a tela mostra antes de o humano pagar a leitura. Mesma seleção e mesmo recorte da chamada real; os recortes
 * são só planejados (estimativa de bytes), porque a prévia roda a cada mudança do formulário.
 */
export async function previewExtraction(req: ExtractRequest): Promise<ExtractPreviewInfo> {
  const prepared = await prepareSources(req, { render: false });
  const { sources, images, pagesSent, selection } = prepared;
  const sheets: ExtractPreviewInfo['sheets'] = [];
  for (const sent of pagesSent) {
    const i = sources.findIndex((s) => s.name === sent.name);
    for (const page of sent.pages) {
      const key = `${i}:${page}`;
      const info = selection.sheets.get(key);
      const category = selection.categories.get(key);
      sheets.push({
        name: sent.name,
        page,
        ...(info?.sheet === undefined ? {} : { sheet: info.sheet }),
        ...(info?.title === undefined ? {} : { title: info.title }),
        ...(category === undefined ? {} : { category }),
      });
    }
  }
  return {
    pagesSent,
    pagesDropped: selection.dropped,
    sheets,
    encodedBytes: prepared.baseEncodedBytes + prepared.tileEncodedBytes,
    images: images.length,
    tiles: tilesInfo(prepared),
  };
}

const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);

/**
 * Recortes acima do teto da requisição: primeiro em JPEG (menor), depois tirando do fim (ampliadas antes das
 * plantas) até caber. Recorte é melhoria; nunca derruba a leitura.
 */
async function fitTiles(prepared: Prepared): Promise<string[]> {
  const warnings: string[] = [];
  if (prepared.tiles === undefined) return warnings;
  const over = () => prepared.baseEncodedBytes + prepared.tileEncodedBytes > API_REQUEST_LIMIT;
  if (!over()) return warnings;
  if (prepared.tiles.options.format === 'png') {
    const pdfIndex = new Map<number, PdfInput>();
    prepared.sources.forEach((s, i) => {
      const input = prepared.pdfs.find((p) => p.name === s.name);
      if (s.kind === 'pdf' && input !== undefined) pdfIndex.set(i, input);
    });
    prepared.tileEncodedBytes = await renderTiles(prepared.sources, prepared.selection, prepared.tiles, pdfIndex, 'jpeg');
    prepared.tiles.options = { ...prepared.tiles.options, format: 'jpeg' };
  }
  const removed: string[] = [];
  while (over()) {
    const input = [...prepared.pdfs].reverse().find((p) => (p.tiles?.length ?? 0) > 0);
    if (input === undefined) break;
    const tiles = [...input.tiles!];
    const last = tiles.pop()!;
    input.tiles = tiles;
    prepared.tileEncodedBytes -= base64Size(last.tile.data.byteLength);
    const key = [...prepared.tiles.pages.entries()].find(([, m]) => m.page === last.page && prepared.sources[m.source]!.name === input.name)?.[0];
    if (key !== undefined) {
      const grid = prepared.tiles.grids.get(key);
      if (grid !== undefined) {
        const kept = grid.tiles.filter((t) => !(t.row === last.tile.row && t.col === last.tile.col));
        if (kept.length === 0) prepared.tiles.grids.delete(key);
        else prepared.tiles.grids.set(key, { ...grid, tiles: kept });
      }
    }
    removed.push(`${input.name} p.${last.page} (${last.tile.row},${last.tile.col})`);
  }
  if (removed.length > 0) {
    warnings.push(
      `extração RECORTES_FORA: ${removed.length} recorte(s) em alta resolução ficaram fora para a requisição caber em ` +
        `${mb(API_REQUEST_LIMIT)} MB: ${removed.slice(0, 8).join(', ')}${removed.length > 8 ? '…' : ''} — a leitura das portas internas ` +
        'nessas regiões pode perder detalhe; mande menos folhas ou informe as páginas',
    );
  }
  return warnings;
}

/** Parâmetros da requisição, separados para teste e para o `--dry-run` do CLI. */
export async function buildRequest(req: ExtractRequest, opts: ExtractOptions = {}) {
  const prepared = await prepareSources(req, { render: true });
  if (prepared.baseEncodedBytes > API_REQUEST_LIMIT) {
    throw new RangeError(
      `as folhas escolhidas somam ${mb(prepared.baseEncodedBytes)} MB codificados, acima do limite de ${mb(API_REQUEST_LIMIT)} MB da API; ` +
        'mande menos arquivos ou informe as páginas',
    );
  }
  const tileWarnings = await fitTiles(prepared);
  const { pdfs, images, pagesSent, selection } = prepared;
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
  return { params, pagesSent, pagesDropped: selection.dropped, tiles: tilesInfo(prepared), tileWarnings, pdfs };
}

export async function extractWalls(req: ExtractRequest, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const client = opts.client ?? new Anthropic();
  opts.onProgress?.({ phase: 'preparing', outputTokens: 0 });
  const { params, pagesSent, pagesDropped, tiles, tileWarnings } = await buildRequest(req, opts);
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
  return { ...done, warnings: [...droppedWarning(pagesDropped), ...tileWarnings, ...done.warnings], pagesSent, pagesDropped, tilesSent: tiles.pages };
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
    tilesSent: [],
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
