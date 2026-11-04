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
 *
 * S25 (2026-11-04): cada PDF é aberto uma vez por leitura (`openPdf`), as fontes são casadas pelo índice em
 * `sources` (dois arquivos com o mesmo nome não se confundem), `pageKey` é a única grafia da chave de página, o
 * `signal` cancela também a preparação (carimbos, texto, recortes), e o resultado leva a proveniência da leitura
 * (hash do prompt, modelo, effort, teto de saída e opções de recorte).
 */

import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { convert, reviewReport, type ConvertOptions, type Converted } from './convert';
import type { MessageParams } from 'core';
import { ExtractInputError, extractionNotice, type ExtractErrorCode, type ReadingNotice } from './notices';
import { formatPageText, openPdf, subsetPdf, type PageText, type PdfFile, type SheetInfo } from './pdf';
import {
  AUTO_BYTE_BUDGET,
  AUTO_PAGE_BUDGET,
  choosePages,
  classifySheet,
  pageKey,
  sheetFromFileName,
  tiledCategory,
  type Candidate,
  type SheetCategory,
} from './select';
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
export const DEFAULT_EFFORT: Effort = 'high';
/** Sem `pages` e sem folha reconhecível pelo carimbo, vão no máximo estas páginas do PDF. */
export const MAX_AUTO_PAGES = 20;
/**
 * Espera pela resposta da API (ms) antes de desistir de uma tentativa. No streaming do SDK o prazo vale até os
 * cabeçalhos chegarem (o envio de até 32 MB conta), não para a resposta inteira — uma leitura leva 10 min ou mais.
 */
export const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
/**
 * Novas tentativas do SDK em 408/409/429/5xx e erro de conexão — antes de a resposta começar, então sem cobrança
 * dobrada. Explícito (é o padrão do SDK) para a decisão ficar à vista.
 */
export const MAX_RETRIES = 2;

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Hash curto (sha-256, 16 hex) do system prompt completo: identifica a versão do prompt de cada leitura. */
export const PROMPT_HASH = createHash('sha256').update(FULL_SYSTEM_PROMPT).digest('hex').slice(0, 16);

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
  /** Cancela a leitura (M7): a preparação (carimbos, texto, recortes) e a chamada; o SDK lança `APIUserAbortError`. */
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
  /** Cópias de folha descartadas (a mesma folha já vai por outra página). */
  duplicates: DuplicatePage[];
  /** Por página enviada: fonte (índice em `sources`), número da folha, título do carimbo e categoria, quando lidos. */
  sheets: { source: number; name: string; page: number; sheet?: string; title?: string; category?: SheetCategory }[];
  /** Bytes dos PDFs recortados, imagens e recortes (estimados), já em base64 (o que conta para o limite da API). */
  encodedBytes: number;
  images: number;
  tiles: TilesInfo;
  /**
   * Caracteres do texto posicionado que vai no prompt (soma de `formatPageText` das páginas enviadas): a medida
   * de densidade do estimador de custo (S25; as folhas do Horace têm ~2,5× o texto das do Ringgold).
   */
  textChars: number;
  /** Avisos da seleção (folhas fora do orçamento, cópias descartadas, conjunto sem carimbo). */
  warnings: ReadingNotice[];
}

/** Tokens de saída por caractere de JSON streamado (as duas leituras reais deram ~3,6). */
const CHARS_PER_OUTPUT_TOKEN = 3.6;

/** Tokens da leitura como a API os conta: `inputTokens` é a entrada sem cache; o cache vem à parte. */
export interface ExtractUsage {
  inputTokens: number;
  outputTokens: number;
  /** Tokens escritos no cache nesta chamada (o system prompt, ~1,25× o preço da entrada). */
  cacheCreationInputTokens?: number;
  /** Tokens lidos do cache (o system prompt de uma leitura anterior em até 5 min, uma fração do preço). */
  cacheReadInputTokens?: number;
}

/** Com que prompt e parâmetros a leitura foi feita (S25): sem isso não se compara uma leitura com outra. */
export interface ReadingProvenance {
  /** `PROMPT_HASH` na hora da leitura. */
  promptHash: string;
  /** Modelo pedido (o que respondeu está em `ExtractResult.model`). */
  model: string;
  effort: Effort;
  maxTokens: number;
  /** Opções de recorte efetivas (o formato pode ter caído para JPEG para caber), ou `false` sem recortes. */
  tiles: TileOptions | false;
}

export interface ExtractResult {
  output: ExtractionOutput;
  project: Converted['project'];
  problems: Converted['problems'];
  warnings: Converted['warnings'];
  report: string;
  model: string;
  usage: ExtractUsage;
  /** Páginas efetivamente enviadas de cada PDF, na ordem de `sources`. */
  pagesSent: { name: string; pages: number[] }[];
  /** Páginas que a seleção automática deixou de fora por orçamento (vazio quando tudo coube). */
  pagesDropped: DroppedPage[];
  /** Recortes efetivamente enviados. */
  tilesSent: TiledPage[];
  /** Ausente numa resposta gravada (`finish` sem chamada). */
  provenance?: ReadingProvenance;
}

/** A leitura falhou depois de chamar a API. `code`/`params` (S26) para a tela; `message` em português para o CLI. */
export class ExtractError extends Error {
  readonly code: ExtractErrorCode | undefined;
  readonly params: MessageParams;
  constructor(
    message: string,
    public readonly rawText?: string,
    info?: { code: ExtractErrorCode; params?: MessageParams },
  ) {
    super(message);
    this.name = 'ExtractError';
    this.code = info?.code;
    this.params = info?.params ?? {};
  }
}

export function normalizeSources(req: ExtractRequest): ExtractSource[] {
  const out: ExtractSource[] = [];
  if (req.pdf !== undefined) {
    out.push({ kind: 'pdf', name: 'planta.pdf', data: req.pdf, ...(req.pages === undefined ? {} : { pages: req.pages }) });
  }
  for (const s of req.sources ?? []) out.push(s);
  if (out.length === 0) throw new ExtractInputError('NO_SOURCES', 'extractWalls: informe ao menos um PDF ou imagem');
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
  /** Índice da fonte em `sources`. */
  source: number;
  name: string;
  page: number;
  sheet: string | undefined;
  category: SheetCategory;
}

/** Uma cópia de folha que a seleção automática descartou, e a página que foi no lugar dela. */
export interface DuplicatePage {
  source: number;
  name: string;
  page: number;
  sheet: string;
  kept: { source: number; name: string; page: number };
}

export interface PageSelection {
  /** Na ordem de `sources`: páginas de cada PDF automático; `undefined` para imagem ou PDF com páginas pedidas. */
  pages: (number[] | undefined)[];
  dropped: DroppedPage[];
  duplicates: DuplicatePage[];
  /**
   * Nenhum PDF automático tinha carimbo reconhecível: foram as primeiras `MAX_AUTO_PAGES` de cada um, como planta,
   * e **sem recortes** (S25: a capa e a implantação gastavam o orçamento de recortes).
   */
  fallback: boolean;
  /** Carimbo de cada página lida, por `pageKey` — também dos PDFs com páginas pedidas. */
  sheets: Map<string, SheetInfo>;
  /** Categoria de cada página, por `pageKey`: a da seleção para as automáticas; para as pedidas, pelo carimbo (sem carimbo = planta). */
  categories: Map<string, SheetCategory>;
}

async function closeAll(opened: Map<number, PdfFile>, keep?: (i: number) => boolean): Promise<void> {
  for (const [i, pdf] of [...opened]) {
    if (keep?.(i) === true) continue;
    opened.delete(i);
    await pdf.close();
  }
}

/**
 * Páginas de cada PDF sem `pages` pedidas, escolhidas juntas no conjunto todo (`select.ts`): por categoria
 * do carimbo (e do nome do arquivo, num PDF de uma página ou em página sem título reconhecível), dentro do
 * orçamento de páginas e bytes. PDF sem nenhum número de folha reconhecível (exportação, foto escaneada) entra
 * com as primeiras `MAX_AUTO_PAGES` páginas como planta. PDFs com páginas pedidas também têm o carimbo lido
 * (para a prévia e para saber quais páginas recortar), mas a escolha é a do humano.
 *
 * `opened`: quem passa o mapa recebe os PDFs abertos (por índice da fonte) e os fecha; sem ele, cada PDF é
 * aberto e fechado aqui.
 */
export async function selectPages(
  sources: readonly ExtractSource[],
  level?: number,
  opts: { opened?: Map<number, PdfFile>; signal?: AbortSignal | undefined } = {},
): Promise<PageSelection> {
  const sheets = new Map<string, SheetInfo>();
  const categories = new Map<string, SheetCategory>();
  const scanned: { source: number; info: SheetInfo; bytes: number; pagesInFile: number }[] = [];
  const explicit: { source: number; info: SheetInfo; pagesInFile: number }[] = [];
  const opened = opts.opened ?? new Map<number, PdfFile>();
  try {
    for (const [i, s] of sources.entries()) {
      if (s.kind !== 'pdf') continue;
      opts.signal?.throwIfAborted();
      let pdf = opened.get(i);
      if (pdf === undefined) {
        pdf = await openPdf(s.data);
        opened.set(i, pdf);
      }
      const list = await pdf.sheets(opts.signal);
      const perPage = s.data.byteLength / Math.max(1, list.length);
      // Folha de um arquivo só sem texto no carimbo (desenho exportado como vetor): o número vem do nome.
      const fromName = list.length === 1 ? sheetFromFileName(s.name) : undefined;
      for (const raw of list) {
        const info = raw.sheet === undefined && fromName !== undefined ? { ...raw, sheet: fromName } : raw;
        sheets.set(pageKey(i, info.page), info);
        if (s.pages === undefined) scanned.push({ source: i, info, bytes: perPage, pagesInFile: list.length });
        else if (s.pages.includes(info.page)) explicit.push({ source: i, info, pagesInFile: list.length });
      }
    }
  } finally {
    if (opts.opened === undefined) await closeAll(opened);
  }
  // Nenhum carimbo no conjunto (fotos, exportações soltas): vão as primeiras páginas de cada PDF, como planta.
  const anySheet = scanned.some((x) => x.info.sheet !== undefined);
  const candidates: Candidate[] = scanned.map(({ source, info, bytes, pagesInFile }) => ({
    source,
    page: info.page,
    category: anySheet
      ? classifySheet(info, sources[source]!.name, level, pagesInFile)
      : info.page <= MAX_AUTO_PAGES
        ? 'plan'
        : 'skip',
    bytes,
    ...(info.sheet === undefined ? {} : { sheet: info.sheet }),
    titled: info.title !== undefined,
  }));
  for (const c of candidates) categories.set(pageKey(c.source, c.page), c.category);
  // Página pedida pelo humano: pelo carimbo quando há; sem carimbo reconhecível, quem pediu a página pediu a planta.
  for (const { source, info, pagesInFile } of explicit) {
    categories.set(pageKey(source, info.page), info.sheet === undefined ? 'plan' : classifySheet(info, sources[source]!.name, level, pagesInFile));
  }
  const { chosen, dropped, duplicates } = choosePages(candidates);
  const pages = sources.map((s, i) =>
    s.kind === 'pdf' && s.pages === undefined ? chosen.filter((c) => c.source === i).map((c) => c.page) : undefined,
  );
  const nameOf = (i: number) => sources[i]!.name;
  return {
    pages,
    dropped: dropped.map((c) => ({
      source: c.source,
      name: nameOf(c.source),
      page: c.page,
      sheet: sheets.get(pageKey(c.source, c.page))?.sheet,
      category: c.category,
    })),
    duplicates: duplicates.map(({ dropped: d, kept: k }) => ({
      source: d.source,
      name: nameOf(d.source),
      page: d.page,
      sheet: d.sheet!,
      kept: { source: k.source, name: nameOf(k.source), page: k.page },
    })),
    fallback: scanned.length > 0 && !anySheet,
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
  /** Por `pageKey`. */
  grids: Map<string, TileGrid>;
  pages: Map<string, { source: number; page: number; width: number; height: number }>;
  skipped: { name: string; page: number }[];
  options: TileOptions;
}

interface Prepared {
  sources: ExtractSource[];
  pdfs: PdfInput[];
  /** O `PdfInput` de cada fonte enviada, pelo índice em `sources` (nunca pelo nome: dois arquivos podem ter o mesmo). */
  pdfIndex: Map<number, PdfInput>;
  images: ImageInput[];
  /** Páginas enviadas de cada PDF, com o índice da fonte. */
  sent: { source: number; name: string; pages: number[] }[];
  selection: PageSelection;
  /** PDFs recortados + imagens, em base64. */
  baseEncodedBytes: number;
  /** Recortes: medidos quando renderizados, estimados na prévia. */
  tileEncodedBytes: number;
  tiles: PreparedTiles | undefined;
  /** Caracteres do texto posicionado enviado (`formatPageText`). */
  textChars: number;
  /** PDFs abertos das fontes enviadas, por índice; `closePrepared` fecha. */
  opened: Map<number, PdfFile>;
}

async function closePrepared(p: Prepared): Promise<void> {
  await closeAll(p.opened);
}

/**
 * Fontes prontas para a requisição: PDFs recortados com texto posicionado, imagens, recortes das plantas, e o
 * que foi/ficou de fora. `render: false` (prévia) só planeja os recortes e estima os bytes. Cada PDF é aberto
 * uma vez: os das fontes enviadas ficam abertos em `opened` (recortes, e de novo em JPEG se não couber) até
 * `closePrepared`; os que não mandam nada fecham logo depois da seleção.
 */
async function prepareSources(req: ExtractRequest, { render, signal }: { render: boolean; signal?: AbortSignal | undefined }): Promise<Prepared> {
  const sources = normalizeSources(req);
  const opened = new Map<number, PdfFile>();
  try {
    return await prepareOpened(req, sources, opened, render, signal);
  } catch (e) {
    await closeAll(opened);
    throw e;
  }
}

async function prepareOpened(
  req: ExtractRequest,
  sources: ExtractSource[],
  opened: Map<number, PdfFile>,
  render: boolean,
  signal: AbortSignal | undefined,
): Promise<Prepared> {
  const pdfs: PdfInput[] = [];
  const pdfIndex = new Map<number, PdfInput>();
  const images: ImageInput[] = [];
  const sent: Prepared['sent'] = [];
  const selection = await selectPages(sources, req.hints?.level, { opened, signal });
  const pagesOf = (i: number): number[] => {
    const s = sources[i]!;
    return s.kind !== 'pdf' ? [] : s.pages === undefined ? selection.pages[i]! : [...s.pages];
  };
  // PDF que não manda nenhuma página (capa, detalhes) não precisa ficar aberto.
  await closeAll(opened, (i) => pagesOf(i).length > 0);
  const tileOpts = tileOptionsOf(req);
  const tilePages: TilePage[] = [];
  const pageMeta = new Map<string, { source: number; page: number; width: number; height: number }>();
  let textChars = 0;
  for (const [i, s] of sources.entries()) {
    if (s.kind === 'image') {
      images.push({ name: s.name, data: s.data, mediaType: s.mediaType });
      continue;
    }
    const pages = pagesOf(i);
    if (pages.length === 0) {
      // Seleção automática que não achou nada útil neste arquivo (capa, detalhes): ele fica de fora.
      if (s.pages === undefined) continue;
      throw new ExtractInputError('NO_PAGES_REQUESTED', `${s.name}: nenhuma página pedida`, { file: s.name });
    }
    // Conjunto sem carimbo (fallback): as primeiras páginas vão como planta, mas sem recorte — a capa e a
    // implantação gastavam o orçamento. Quem pede as páginas ganha os recortes.
    const tileable = tileOpts !== undefined && !(selection.fallback && s.pages === undefined);
    const pdf = opened.get(i)!;
    const texts: PageText[] = [];
    for (const p of pages) {
      signal?.throwIfAborted();
      const text = await pdf.pageText(p);
      texts.push(text);
      textChars += formatPageText(text).length;
      const key = pageKey(i, p);
      const category = tileable ? tiledCategory(selection.categories.get(key) ?? 'skip') : undefined;
      if (category !== undefined) {
        tilePages.push({ key, category, width: text.width, height: text.height });
        pageMeta.set(key, { source: i, page: p, width: text.width, height: text.height });
      }
    }
    signal?.throwIfAborted();
    const input: PdfInput = { name: s.name, pdf: await subsetPdf(s.data, pages), pages: texts };
    pdfs.push(input);
    pdfIndex.set(i, input);
    sent.push({ source: i, name: s.name, pages });
  }
  if (pdfs.length === 0 && images.length === 0) {
    throw new ExtractInputError('NO_USEFUL_SHEETS', 'nenhuma folha útil reconhecida nos arquivos (planta, schedule, elevação, corte, estrutura); informe as páginas');
  }
  const baseEncodedBytes = pdfs.reduce((n, p) => n + base64Size(p.pdf.byteLength), 0) + images.reduce((n, im) => n + base64Size(im.data.byteLength), 0);

  const prepared: Prepared = { sources, pdfs, pdfIndex, images, sent, selection, baseEncodedBytes, tileEncodedBytes: 0, tiles: undefined, textChars, opened };
  if (tileOpts !== undefined && tilePages.length > 0) {
    const { grids, skipped } = allocateTiles(tilePages, tileOpts, images.length);
    prepared.tiles = {
      grids,
      pages: pageMeta,
      skipped: skipped.map((k) => ({ name: sources[pageMeta.get(k)!.source]!.name, page: pageMeta.get(k)!.page })),
      options: tileOpts,
    };
    if (render) {
      prepared.tileEncodedBytes = await renderTiles(prepared, tileOpts.format, signal);
    } else {
      for (const grid of grids.values()) for (const t of grid.tiles) prepared.tileEncodedBytes += estimateTileBytes(t.width, t.height, tileOpts.format);
    }
  }
  return prepared;
}

/** Renderiza os recortes planejados e os pendura nos `PdfInput`; devolve os bytes codificados. */
async function renderTiles(prepared: Prepared, format: TileOptions['format'], signal: AbortSignal | undefined): Promise<number> {
  const tiles = prepared.tiles!;
  let bytes = 0;
  for (const input of prepared.pdfIndex.values()) input.tiles = [];
  for (const [key, grid] of tiles.grids) {
    const meta = tiles.pages.get(key)!;
    const rendered = await prepared.opened.get(meta.source)!.renderTiles(meta.page, grid, format, signal);
    const info = prepared.selection.sheets.get(key);
    const pageTiles: PageTile[] = rendered.map((tile) => ({
      page: meta.page,
      ...(info?.sheet === undefined ? {} : { sheet: info.sheet }),
      ...(info?.title === undefined ? {} : { title: info.title }),
      grid,
      tile,
    }));
    const input = prepared.pdfIndex.get(meta.source)!;
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
export async function previewExtraction(req: ExtractRequest, opts: { signal?: AbortSignal | undefined } = {}): Promise<ExtractPreviewInfo> {
  const prepared = await prepareSources(req, { render: false, signal: opts.signal });
  await closePrepared(prepared);
  const { sent, selection, images } = prepared;
  const sheets: ExtractPreviewInfo['sheets'] = [];
  for (const { source, name, pages } of sent) {
    for (const page of pages) {
      const key = pageKey(source, page);
      const info = selection.sheets.get(key);
      const category = selection.categories.get(key);
      sheets.push({
        source,
        name,
        page,
        ...(info?.sheet === undefined ? {} : { sheet: info.sheet }),
        ...(info?.title === undefined ? {} : { title: info.title }),
        ...(category === undefined ? {} : { category }),
      });
    }
  }
  return {
    pagesSent: sent.map(({ name, pages }) => ({ name, pages })),
    pagesDropped: selection.dropped,
    duplicates: selection.duplicates,
    sheets,
    encodedBytes: prepared.baseEncodedBytes + prepared.tileEncodedBytes,
    images: images.length,
    tiles: tilesInfo(prepared),
    textChars: prepared.textChars,
    warnings: selectionWarnings(selection),
  };
}

const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);

/**
 * Recortes acima do teto da requisição: primeiro em JPEG (menor), depois tirando do fim (ampliadas antes das
 * plantas) até caber. Recorte é melhoria; nunca derruba a leitura.
 */
async function fitTiles(prepared: Prepared, signal: AbortSignal | undefined): Promise<ReadingNotice[]> {
  const warnings: ReadingNotice[] = [];
  if (prepared.tiles === undefined) return warnings;
  const over = () => prepared.baseEncodedBytes + prepared.tileEncodedBytes > API_REQUEST_LIMIT;
  if (!over()) return warnings;
  if (prepared.tiles.options.format === 'png') {
    prepared.tileEncodedBytes = await renderTiles(prepared, 'jpeg', signal);
    prepared.tiles.options = { ...prepared.tiles.options, format: 'jpeg' };
  }
  const removed: string[] = [];
  const bySource = [...prepared.pdfIndex.entries()].reverse();
  while (over()) {
    const found = bySource.find(([, p]) => (p.tiles?.length ?? 0) > 0);
    if (found === undefined) break;
    const [source, input] = found;
    const tiles = [...input.tiles!];
    const last = tiles.pop()!;
    input.tiles = tiles;
    prepared.tileEncodedBytes -= base64Size(last.tile.data.byteLength);
    const key = pageKey(source, last.page);
    const grid = prepared.tiles.grids.get(key);
    if (grid !== undefined) {
      const kept = grid.tiles.filter((t) => !(t.row === last.tile.row && t.col === last.tile.col));
      if (kept.length === 0) prepared.tiles.grids.delete(key);
      else prepared.tiles.grids.set(key, { ...grid, tiles: kept });
    }
    removed.push(`${input.name} p.${last.page} (${last.tile.row},${last.tile.col})`);
  }
  if (removed.length > 0) {
    warnings.push(
      extractionNotice(
        'TILES_DROPPED',
        `${removed.length} recorte(s) em alta resolução ficaram fora para a requisição caber em ` +
          `${mb(API_REQUEST_LIMIT)} MB: ${removed.slice(0, 8).join(', ')}${removed.length > 8 ? '…' : ''} — a leitura das portas internas ` +
          'nessas regiões pode perder detalhe; mande menos folhas ou informe as páginas',
        {},
        { count: removed.length, limitMb: Number(mb(API_REQUEST_LIMIT)), tiles: removed.slice(0, 8) },
      ),
    );
  }
  return warnings;
}

/** Parâmetros da requisição, separados para teste e para o `--dry-run` do CLI. */
export async function buildRequest(req: ExtractRequest, opts: ExtractOptions = {}) {
  const prepared = await prepareSources(req, { render: true, signal: opts.signal });
  try {
    if (prepared.baseEncodedBytes > API_REQUEST_LIMIT) {
      throw new ExtractInputError(
        'REQUEST_TOO_LARGE',
        `as folhas escolhidas somam ${mb(prepared.baseEncodedBytes)} MB codificados, acima do limite de ${mb(API_REQUEST_LIMIT)} MB da API; ` +
          'mande menos arquivos ou informe as páginas',
        { mb: Number(mb(prepared.baseEncodedBytes)), limitMb: Number(mb(API_REQUEST_LIMIT)) },
      );
    }
    const tileWarnings = await fitTiles(prepared, opts.signal);
    const { pdfs, images, sent, selection } = prepared;
    const effort = opts.effort ?? DEFAULT_EFFORT;
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
      output_config: { effort },
    } satisfies Anthropic.MessageCreateParamsNonStreaming;
    const provenance: ReadingProvenance = {
      promptHash: PROMPT_HASH,
      model: params.model,
      effort,
      maxTokens: params.max_tokens,
      tiles: prepared.tiles?.options ?? tileOptionsOf(req) ?? false,
    };
    return {
      params,
      pagesSent: sent.map(({ name, pages }) => ({ name, pages })),
      pagesDropped: selection.dropped,
      duplicates: selection.duplicates,
      tiles: tilesInfo(prepared),
      tileWarnings,
      selectionWarnings: selectionWarnings(selection),
      pdfs,
      textChars: prepared.textChars,
      provenance,
    };
  } finally {
    await closePrepared(prepared);
  }
}

export async function extractWalls(req: ExtractRequest, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const client = opts.client ?? new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
  opts.onProgress?.({ phase: 'preparing', outputTokens: 0 });
  const built = await buildRequest(req, opts);
  const { params, pagesSent, pagesDropped, tiles, tileWarnings, provenance } = built;
  opts.signal?.throwIfAborted();
  opts.onProgress?.({ phase: 'waiting', outputTokens: 0 });
  // Streaming: o SDK exige para respostas longas (max_tokens alto); `finalMessage` junta tudo. O progresso (M7)
  // vem do texto que chega: tokens de saída estimados por caractere; a entrada, do `message_start`.
  const stream = client.messages.stream(params, {
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    ...(opts.signal === undefined ? {} : { signal: opts.signal }),
  });
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
  checkStop(response, params.max_tokens, text);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ExtractError(`a resposta não é JSON: ${(e as Error).message}`, text, { code: 'RESPONSE_NOT_JSON' });
  }
  const done = finish(raw, req.convert, response.model, usageOf(response.usage));
  return {
    ...done,
    warnings: [...built.selectionWarnings, ...tileWarnings, ...done.warnings],
    pagesSent,
    pagesDropped,
    tilesSent: tiles.pages,
    provenance,
  };
}

/** `usage` da API → `ExtractUsage`; os campos de cache só quando a API os trouxe. */
export function usageOf(u: Anthropic.Usage): ExtractUsage {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    ...(u.cache_creation_input_tokens == null ? {} : { cacheCreationInputTokens: u.cache_creation_input_tokens }),
    ...(u.cache_read_input_tokens == null ? {} : { cacheReadInputTokens: u.cache_read_input_tokens }),
  };
}

/**
 * Todo `stop_reason` tratado (S25): só `end_turn` (e `stop_sequence`, que esta chamada não define) segue para o
 * JSON; o resto vira `ExtractError` com o texto cru e o que fazer.
 */
function checkStop(response: Anthropic.Message, maxTokens: number, text: string): void {
  const reason = response.stop_reason;
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return;
    case 'refusal': {
      const why = response.stop_details?.type === 'refusal' ? response.stop_details.explanation : undefined;
      throw new ExtractError(`o modelo recusou a extração${why ? `: ${why}` : ''}`, text, { code: 'MODEL_REFUSED', params: why ? { why } : {} });
    }
    case 'max_tokens':
      // O raciocínio conta no teto; 128 000 já é o máximo do streaming, então aumentar não é saída.
      throw new ExtractError(
        `resposta cortada em ${maxTokens} tokens de saída (o raciocínio conta no teto${maxTokens >= DEFAULT_MAX_TOKENS ? ', que já é o máximo' : ''}); ` +
          'mande menos folhas ou baixe o effort',
        text,
        { code: 'OUTPUT_TRUNCATED', params: { maxTokens, atMax: maxTokens >= DEFAULT_MAX_TOKENS } },
      );
    case 'model_context_window_exceeded':
      throw new ExtractError('as folhas passaram da janela de contexto do modelo; mande menos folhas ou informe as páginas', text, { code: 'CONTEXT_EXCEEDED' });
    case 'pause_turn':
      throw new ExtractError('a API pausou a resposta (pause_turn) antes do fim; tente de novo', text, { code: 'PAUSE_TURN' });
    case 'tool_use':
      throw new ExtractError('o modelo pediu uma ferramenta que esta chamada não oferece (tool_use); tente de novo', text, { code: 'TOOL_USE' });
    case null:
      throw new ExtractError('a resposta terminou sem motivo de parada (stop_reason vazio); tente de novo', text, { code: 'NO_STOP_REASON' });
    default: {
      const unknown: never = reason;
      throw new ExtractError(`a resposta parou por um motivo desconhecido (${String(unknown)})`, text, { code: 'UNKNOWN_STOP_REASON', params: { reason: String(unknown) } });
    }
  }
}

/** Aviso das folhas que a seleção automática deixou de fora por orçamento. */
export function droppedWarning(dropped: readonly DroppedPage[]): ReadingNotice[] {
  if (dropped.length === 0) return [];
  const sheets = dropped.slice(0, 12).map((d) => `${d.sheet ?? `p.${d.page}`} (${d.category})`);
  return [
    extractionNotice(
      'SHEETS_DROPPED',
      `${dropped.length} folha(s) útil(eis) ficaram fora do orçamento de ${AUTO_PAGE_BUDGET} páginas / ` +
        `${AUTO_BYTE_BUDGET / (1024 * 1024)} MB: ${sheets.join(', ')}${dropped.length > 12 ? '…' : ''} — para incluí-las, mande menos ` +
        'arquivos ou informe as páginas',
      {},
      { count: dropped.length, pageBudget: AUTO_PAGE_BUDGET, mbBudget: AUTO_BYTE_BUDGET / (1024 * 1024), sheets },
    ),
  ];
}

/** Avisos da seleção automática: folhas fora do orçamento, cópias de folha descartadas, conjunto sem carimbo. */
export function selectionWarnings(sel: Pick<PageSelection, 'dropped' | 'duplicates' | 'fallback'>): ReadingNotice[] {
  const out = droppedWarning(sel.dropped);
  if (sel.duplicates.length > 0) {
    const list = sel.duplicates
      .slice(0, 8)
      .map((d) => `${d.sheet} de ${d.name} p.${d.page} (foi a de ${d.kept.name} p.${d.kept.page})`)
      .join(', ');
    out.push(
      extractionNotice(
        'SHEET_DUPLICATE',
        `${sel.duplicates.length} cópia(s) de folha ficaram fora porque a mesma folha já vai por outra ` +
          `página: ${list}${sel.duplicates.length > 8 ? '…' : ''} — se a cópia é outra revisão, informe as páginas`,
        {},
        { count: sel.duplicates.length, sheets: sel.duplicates.slice(0, 8).map((d) => d.sheet) },
      ),
    );
  }
  if (sel.fallback) {
    out.push(
      extractionNotice(
        'NO_TITLE_BLOCK',
        `nenhum número de folha reconhecido nos carimbos; foram as primeiras ${MAX_AUTO_PAGES} página(s) de ` +
          'cada PDF como planta, sem recortes em alta resolução — informe as páginas da planta para recortá-las',
        {},
        { pages: MAX_AUTO_PAGES },
      ),
    );
  }
  return out;
}

/** Mesmo pós-processamento da chamada real, para respostas gravadas (fixtures) e para o CLI. */
export function finish(
  raw: unknown,
  convertOpts: ConvertOptions | undefined,
  model: string,
  usage: ExtractUsage,
): ExtractResult {
  const parsed = ExtractionOutput.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ExtractError(`resposta fora do schema: ${issues.join('; ')}`, JSON.stringify(raw), { code: 'SCHEMA_MISMATCH', params: { issues } });
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
