/**
 * Leitura do PDF vetorial do arquiteto (S18). Só geometria de texto: cada item de texto da página
 * com posição (pontos PDF, origem no canto superior esquerdo, y crescendo para baixo), agrupado em
 * linhas, mais a numeração das folhas (`A-100`, `A-800`) e o recorte de páginas para mandar à API.
 *
 * Nada aqui interpreta a planta: isso é o prompt (`prompt.ts`) e o modelo. Os PDFs de referência
 * (`docs/06-referencias-projetos.md`) são de Revit, com texto extraível — a imagem fica por conta da
 * API, que recebe as páginas recortadas como `document`.
 */

// O web importa este arquivo pelo src e não inclui o .d.ts no tsconfig dele; a referência leva a declaração junto.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./pdfjs-worker.d.ts" />
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
// Antes do pdf.js: polyfills de DOMMatrix/Path2D/ImageData e a fábrica de canvas nativo (ver canvas.ts).
import { createCanvas, NapiCanvasFactory } from './canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import type { TileFormat, TileGrid, TileRect } from './tiles';
import { ExtractInputError } from './notices';

/**
 * Worker na própria thread, carregado por import estático. Em Node o pdf.js monta um "fake worker" com
 * `import("./pdf.worker.mjs")` dinâmico, que o rastreio de arquivos do Next/Vercel não enxerga: no deploy o
 * arquivo não ia junto e toda leitura morria em "Setting up fake worker failed" (2026-10-23). Com o módulo em
 * `globalThis.pdfjsWorker`, o pdf.js usa este handler e não importa nada em tempo de execução.
 */
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker ??= pdfjsWorker;

/** Um trecho de texto na página, já arredondado ao ponto. */
export interface TextRun {
  x: number;
  text: string;
}

/** Itens com o mesmo y (±2 pt) e a mesma rotação, em x crescente. */
export interface TextLine {
  y: number;
  /** Graus, 0 = horizontal; cotas de paredes verticais vêm com 90 ou −90. */
  rotation: number;
  runs: TextRun[];
}

export interface PageText {
  /** 1-based. */
  page: number;
  width: number;
  height: number;
  lines: TextLine[];
}

export interface SheetInfo {
  page: number;
  /** Número da folha no carimbo (`A-100`), quando encontrado. */
  sheet: string | undefined;
  /** Textos do carimbo na coluna do número (título da folha, projeto, escritório); ausente se não há. */
  title?: string;
}

/**
 * Número de folha no carimbo: `A-100`, `S-101A`; sem hífen, `A201`/`S101`; e com ponto, `SA1.1`/`A1.02`
 * (conjunto Matilda, 2026-11-03: arquiteto numera `A201`, o estrutural `SA0.0`…`SA3.0`).
 */
const SHEET_PATTERN = /^(?:[A-Z]{1,2}-?\d{3}[A-Z]?|[A-Z]{1,2}-?\d\.\d{1,2}[A-Z]?)$/;
/** Rótulo do carimbo sob o qual fica o título da folha ("DRAWING :", "Sheet Name:", "SHEET TITLE"); "SHEET:" sozinho é o do número. */
const TITLE_LABEL = /^(?:DRAWING(?: TITLE)?|SHEET (?:TITLE|NAME)|TITLE)\s*:?$/i;
/** Texto que é um rótulo de campo do carimbo ("DWG. NO. :", "DATE :"): nunca entra no título. */
const FIELD_LABEL = /:\s*$/;
const LINE_TOLERANCE = 2;

type TextContentItem = Awaited<ReturnType<pdfjs.PDFPageProxy['getTextContent']>>['items'][number];
type TextItem = Extract<TextContentItem, { str: string }>;

function isTextItem(v: TextContentItem): v is TextItem {
  return 'str' in v;
}

interface Loaded {
  doc: pdfjs.PDFDocumentProxy;
  close: () => Promise<void>;
}

/**
 * Pasta das 14 fontes padrão do PDF que vêm com o pdfjs-dist, para renderizar texto em fonte não embutida
 * (Helvetica dos testes). Sem ela o pdf.js só avisa e o texto nessa fonte não aparece no recorte; os PDFs de
 * Revit embutem as fontes, então em produção quase nunca é usada.
 */
const STANDARD_FONTS_URL = (() => {
  try {
    const pkg = createRequire(import.meta.url).resolve('pdfjs-dist/package.json');
    return join(dirname(pkg), 'standard_fonts') + '/';
  } catch {
    return undefined;
  }
})();

async function open(data: Uint8Array): Promise<Loaded> {
  // pdf.js toma posse do buffer: entregamos uma cópia para o chamador poder reutilizar `data`.
  const task = pdfjs.getDocument({
    data: data.slice(),
    useSystemFonts: true,
    CanvasFactory: NapiCanvasFactory,
    ...(STANDARD_FONTS_URL === undefined ? {} : { standardFontDataUrl: STANDARD_FONTS_URL }),
  });
  const doc = await task.promise;
  return { doc, close: () => task.destroy() };
}

export async function pageCount(data: Uint8Array): Promise<number> {
  const { doc, close } = await open(data);
  try {
    return doc.numPages;
  } finally {
    await close();
  }
}

/**
 * Um PDF aberto uma vez (S25): carimbos, texto posicionado e recortes da mesma fonte sem novo parse. Antes cada
 * chamada reabria o arquivo — no Horace, 40+ parses por leitura. Quem abre fecha (`close`).
 */
export interface PdfFile {
  readonly numPages: number;
  sheets(signal?: AbortSignal): Promise<SheetInfo[]>;
  pageText(page: number): Promise<PageText>;
  renderTiles(page: number, grid: TileGrid, format?: TileFormat, signal?: AbortSignal): Promise<RenderedTile[]>;
  close(): Promise<void>;
}

export async function openPdf(data: Uint8Array): Promise<PdfFile> {
  const { doc, close } = await open(data);
  const getPage = async (page: number) => {
    if (!Number.isInteger(page) || page < 1 || page > doc.numPages) {
      throw new ExtractInputError('PAGE_OUT_OF_RANGE', `page ${page} is outside the PDF (${doc.numPages} pages)`, { page, pages: doc.numPages });
    }
    return doc.getPage(page);
  };
  return {
    numPages: doc.numPages,
    sheets: (signal) => sheetsOf(doc, signal),
    pageText: async (page) => {
      const p = await getPage(page);
      const viewport = p.getViewport({ scale: 1 });
      const content = await p.getTextContent();
      return {
        page,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        lines: groupLines(content.items.filter(isTextItem), viewport.height),
      };
    },
    renderTiles: async (page, grid, format = 'png', signal) => renderTilesOf(await getPage(page), grid, format, signal),
    close,
  };
}

async function withPdf<T>(data: Uint8Array, f: (pdf: PdfFile) => Promise<T>): Promise<T> {
  const pdf = await openPdf(data);
  try {
    return await f(pdf);
  } finally {
    await pdf.close();
  }
}

/** Texto posicionado de uma página (1-based). Abre e fecha o PDF; para várias páginas, `openPdf`. */
export async function readPageText(data: Uint8Array, page: number): Promise<PageText> {
  return withPdf(data, (pdf) => pdf.pageText(page));
}

function groupLines(items: TextItem[], pageHeight: number): TextLine[] {
  const placed = items
    .filter((i) => i.str.trim() !== '')
    .map((i) => {
      const [a = 1, b = 0, , , e = 0, f = 0] = i.transform;
      return {
        x: Math.round(e),
        y: Math.round(pageHeight - f),
        rotation: Math.round((Math.atan2(b, a) * 180) / Math.PI),
        text: i.str,
      };
    })
    .sort((p, q) => p.y - q.y || p.x - q.x);

  const lines: TextLine[] = [];
  let current: TextLine | undefined;
  for (const it of placed) {
    if (current && Math.abs(it.y - current.y) <= LINE_TOLERANCE && it.rotation === current.rotation) {
      current.runs.push({ x: it.x, text: it.text });
    } else {
      current = { y: it.y, rotation: it.rotation, runs: [{ x: it.x, text: it.text }] };
      lines.push(current);
    }
  }
  for (const l of lines) l.runs.sort((p, q) => p.x - q.x);
  return lines;
}

/**
 * Serialização do texto posicionado para o prompt: uma linha por `TextLine`, com o x de cada trecho
 * entre colchetes. Determinística (mesma página → mesma string).
 */
export function formatPageText(pt: PageText): string {
  const head = `# página ${pt.page} · ${pt.width}×${pt.height} pt · y cresce para baixo; [x] antecede cada trecho`;
  const body = pt.lines.map((l) => {
    const rot = l.rotation === 0 ? '' : ` rot=${l.rotation}`;
    return `y=${l.y}${rot}  ${l.runs.map((r) => `[${r.x}] ${r.text}`).join('  ')}`;
  });
  return [head, ...body].join('\n');
}

/** Distância em x (pt) do número da folha em que o texto ainda conta como título do carimbo. */
const TITLE_COLUMN = 100;
/** Faixa em y (pt, para cima a partir da base do número) onde fica o título da folha. */
const TITLE_BELOW = 20;
const TITLE_ABOVE = 160;
/** Altura mínima do título em fração da altura do número: datas, escala e notas do carimbo ficam de fora. */
const TITLE_MIN_RATIO = 0.25;
/** Carimbo com rótulo: o título fica abaixo do rótulo, nesta largura de coluna (pt) e até esta distância. */
const LABEL_COLUMN = 300;
const LABEL_REACH = 130;
/** Linhas do título separadas por mais do que isto (pt) são outra coisa (o carimbo "NOT FOR CONSTRUCTION", a escala). */
const LABEL_LINE_GAP = 40;

interface Placed {
  text: string;
  height: number;
  x: number;
  y: number;
}

/**
 * Número da folha de cada página (o texto `A-100`-like de maior altura, o do carimbo) e o título, por dois
 * carimbos conhecidos:
 * - **com rótulo** ("DRAWING :", "Sheet Name:"): os textos logo abaixo do rótulo, na coluna dele, linha a linha
 *   enquanto não houver um salto maior que `LABEL_LINE_GAP` — "FIRST LEVEL FLOOR PLAN" (Matilda, arquiteto),
 *   "APARTMENT FIRST LEVEL PLAN" em três linhas (Matilda, estrutural); o carimbo "DRAFT - NOT FOR CONSTRUCTION"
 *   fica depois do salto e de fora;
 * - **sem rótulo**: os textos logo acima do número (até 160 pt), na mesma coluna (±100 pt em x) e com pelo
 *   menos 1/4 da altura dele, de cima para baixo — "Exterior Elevations", "Door Schedule New Wing & Units"
 *   (Ringgold e Horace); o nome do projeto e a tabela de revisões ficam mais acima e de fora.
 * Rótulos de campo ("DWG. NO. :", "DATE :") nunca entram no título.
 */
export async function listSheets(data: Uint8Array): Promise<SheetInfo[]> {
  return withPdf(data, (pdf) => pdf.sheets());
}

async function sheetsOf(doc: pdfjs.PDFDocumentProxy, signal?: AbortSignal): Promise<SheetInfo[]> {
  const out: SheetInfo[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    signal?.throwIfAborted();
    const p = await doc.getPage(n);
    const content = await p.getTextContent();
    const items: Placed[] = content.items
      .filter(isTextItem)
      .map((i) => ({ text: i.str.trim(), height: i.height, x: i.transform[4] as number, y: i.transform[5] as number }))
      .filter((i) => i.text !== '');
    let best: Placed | undefined;
    for (const item of items) {
      if (!SHEET_PATTERN.test(item.text)) continue;
      if (!best || item.height > best.height) best = item;
    }
    const info: SheetInfo = { page: n, sheet: best?.text };
    if (best !== undefined) {
      const title = titleUnderLabel(items) ?? titleAboveNumber(items, best);
      if (title !== '') info.title = title;
    }
    out.push(info);
  }
  return out;
}

/** Texto que pode fazer parte de um título: não é número de folha nem rótulo de campo. */
function isTitleText(i: Placed): boolean {
  return !SHEET_PATTERN.test(i.text) && !FIELD_LABEL.test(i.text) && !TITLE_LABEL.test(i.text);
}

/** Carimbo com rótulo de título; `undefined` quando a página não tem o rótulo. */
function titleUnderLabel(items: readonly Placed[]): string | undefined {
  const label = items.find((i) => TITLE_LABEL.test(i.text));
  if (label === undefined) return undefined;
  // A coluna do título vai até o próximo rótulo da mesma linha ("ISSUE:", "DWG. NO. :"); sem outro, `LABEL_COLUMN`.
  const nextLabel = items
    .filter((i) => (FIELD_LABEL.test(i.text) || TITLE_LABEL.test(i.text)) && Math.abs(i.y - label.y) <= 4 && i.x > label.x + 5)
    .sort((a, b) => a.x - b.x)[0];
  const column = nextLabel === undefined ? LABEL_COLUMN : Math.min(LABEL_COLUMN, nextLabel.x - label.x - 5);
  const below = items
    .filter(isTitleText)
    .filter((i) => i.height >= TITLE_MIN_RATIO * label.height)
    .map((i) => ({ i, dx: i.x - label.x, dy: label.y - i.y }))
    .filter(({ dx, dy }) => dx >= -10 && dx <= column && dy > 0 && dy <= LABEL_REACH)
    .sort((a, b) => a.dy - b.dy || a.i.x - b.i.x);
  const lines: string[] = [];
  let last: number | undefined;
  for (const { i, dy } of below) {
    if (last !== undefined && dy - last > LABEL_LINE_GAP) break;
    lines.push(i.text);
    last = dy;
  }
  return lines.join(' ');
}

/** Carimbo sem rótulo: a coluna acima do número. */
function titleAboveNumber(items: readonly Placed[], number: Placed): string {
  return items
    .filter(isTitleText)
    .filter((i) => i.height >= TITLE_MIN_RATIO * number.height)
    .filter((i) => {
      const dx = i.x - number.x;
      const dy = i.y - number.y;
      return Math.abs(dx) <= TITLE_COLUMN && dy >= -TITLE_BELOW && dy <= TITLE_ABOVE;
    })
    .sort((a, c) => c.y - a.y)
    .map((i) => i.text)
    .join(' ');
}

/** Novo PDF só com as páginas pedidas (1-based, na ordem dada). */
export async function subsetPdf(data: Uint8Array, pages: readonly number[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new RangeError('subsetPdf: no pages requested');
  const src = await PDFDocument.load(data);
  const n = src.getPageCount();
  for (const p of pages) {
    if (!Number.isInteger(p) || p < 1 || p > n) throw new ExtractInputError('PAGE_OUT_OF_RANGE', `page ${p} is outside the PDF (${n} pages)`, { page: p, pages: n });
  }
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    src,
    pages.map((p) => p - 1),
  );
  for (const page of copied) out.addPage(page);
  return out.save();
}

/** Um recorte renderizado: a região (`TileRect`) mais os bytes da imagem. */
export interface RenderedTile extends TileRect {
  data: Uint8Array;
  mediaType: 'image/png' | 'image/jpeg';
}

/**
 * Renderiza os recortes de uma página (1-based) na grade dada (`planTiles`). Cada recorte é um canvas do seu
 * próprio tamanho: o viewport leva `offsetX/offsetY = −x0·scale/−y0·scale`, em pixels, então a região da
 * página cai exatamente na imagem (mesmo sistema de coordenadas do texto posicionado). Sequencial, um canvas
 * por vez (~15 MB RGBA cada); nunca renderiza a folha inteira. Determinístico: sem data nem metadado variável.
 */
export async function renderPageTiles(data: Uint8Array, page: number, grid: TileGrid, format: TileFormat = 'png'): Promise<RenderedTile[]> {
  return withPdf(data, (pdf) => pdf.renderTiles(page, grid, format));
}

/** `signal` é conferido antes de cada recorte (cada um leva segundos numa folha grande). */
async function renderTilesOf(p: pdfjs.PDFPageProxy, grid: TileGrid, format: TileFormat, signal?: AbortSignal): Promise<RenderedTile[]> {
  const out: RenderedTile[] = [];
  for (const t of grid.tiles) {
    signal?.throwIfAborted();
    const viewport = p.getViewport({ scale: grid.scale, offsetX: -t.x0 * grid.scale, offsetY: -t.y0 * grid.scale });
    const canvas = createCanvas(t.width, t.height);
    const context = canvas.getContext('2d');
    await p.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      canvas: canvas as unknown as HTMLCanvasElement,
      viewport,
      background: 'rgb(255,255,255)',
    }).promise;
    const bytes = format === 'png' ? await canvas.encode('png') : await canvas.encode('jpeg', 85);
    out.push({ ...t, data: new Uint8Array(bytes), mediaType: format === 'png' ? 'image/png' : 'image/jpeg' });
  }
  p.cleanup();
  return out;
}
