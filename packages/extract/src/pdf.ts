/**
 * Leitura do PDF vetorial do arquiteto (S18). Só geometria de texto: cada item de texto da página
 * com posição (pontos PDF, origem no canto superior esquerdo, y crescendo para baixo), agrupado em
 * linhas, mais a numeração das folhas (`A-100`, `A-800`) e o recorte de páginas para mandar à API.
 *
 * Nada aqui interpreta a planta: isso é o prompt (`prompt.ts`) e o modelo. Os PDFs de referência
 * (`docs/06-referencias-projetos.md`) são de Revit, com texto extraível — a imagem fica por conta da
 * API, que recebe as páginas recortadas como `document`.
 */

/// <reference path="./pdfjs-worker.d.ts" />
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

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

const SHEET_PATTERN = /^[A-Z]{1,2}-\d{3}[A-Z]?$/;
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

async function open(data: Uint8Array): Promise<Loaded> {
  // pdf.js toma posse do buffer: entregamos uma cópia para o chamador poder reutilizar `data`.
  const task = pdfjs.getDocument({ data: data.slice(), useSystemFonts: true });
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

/** Texto posicionado de uma página (1-based). */
export async function readPageText(data: Uint8Array, page: number): Promise<PageText> {
  const { doc, close } = await open(data);
  try {
    if (!Number.isInteger(page) || page < 1 || page > doc.numPages) {
      throw new RangeError(`página ${page} fora do PDF (${doc.numPages} páginas)`);
    }
    const p = await doc.getPage(page);
    const viewport = p.getViewport({ scale: 1 });
    const content = await p.getTextContent();
    return {
      page,
      width: Math.round(viewport.width),
      height: Math.round(viewport.height),
      lines: groupLines(content.items.filter(isTextItem), viewport.height),
    };
  } finally {
    await close();
  }
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

/**
 * Número da folha de cada página (o texto `A-100`-like de maior altura, o do carimbo) e o título: os textos
 * logo acima do número (até 160 pt), na mesma coluna (±100 pt em x) e com pelo menos 1/4 da altura dele,
 * de cima para baixo — "Exterior Elevations", "Door Schedule New Wing & Units". Ringgold e Horace têm o
 * título ali; o nome do projeto e a tabela de revisões ficam mais acima e de fora.
 */
export async function listSheets(data: Uint8Array): Promise<SheetInfo[]> {
  const { doc, close } = await open(data);
  try {
    const out: SheetInfo[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      const content = await p.getTextContent();
      let best: { text: string; height: number; x: number; y: number } | undefined;
      const items = content.items.filter(isTextItem);
      for (const item of items) {
        const text = item.str.trim();
        if (!SHEET_PATTERN.test(text)) continue;
        if (!best || item.height > best.height) {
          best = { text, height: item.height, x: item.transform[4] as number, y: item.transform[5] as number };
        }
      }
      const info: SheetInfo = { page: n, sheet: best?.text };
      if (best !== undefined) {
        const b = best;
        const title = items
          .filter((i) => i.str.trim() !== '' && !SHEET_PATTERN.test(i.str.trim()) && i.height >= TITLE_MIN_RATIO * b.height)
          .filter((i) => {
            const dx = (i.transform[4] as number) - b.x;
            const dy = (i.transform[5] as number) - b.y;
            return Math.abs(dx) <= TITLE_COLUMN && dy >= -TITLE_BELOW && dy <= TITLE_ABOVE;
          })
          .sort((a, c) => (c.transform[5] as number) - (a.transform[5] as number))
          .map((i) => i.str.trim())
          .join(' ');
        if (title !== '') info.title = title;
      }
      out.push(info);
    }
    return out;
  } finally {
    await close();
  }
}

/** Novo PDF só com as páginas pedidas (1-based, na ordem dada). */
export async function subsetPdf(data: Uint8Array, pages: readonly number[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new RangeError('subsetPdf: nenhuma página pedida');
  const src = await PDFDocument.load(data);
  const n = src.getPageCount();
  for (const p of pages) {
    if (!Number.isInteger(p) || p < 1 || p > n) throw new RangeError(`página ${p} fora do PDF (${n} páginas)`);
  }
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    src,
    pages.map((p) => p - 1),
  );
  for (const page of copied) out.addPage(page);
  return out.save();
}
