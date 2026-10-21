/**
 * PDF das folhas de fabricação (M9): cada folha SVG do motor vira uma página carta paisagem, rasterizada por
 * `@resvg/resvg-js` (fontes do sistema; a folha usa Helvetica/Arial) e embutida com `pdf-lib`, com rodapé
 * "projeto · folha · x de y". A planta de painéis entra como primeira página quando existe. Só servidor:
 * resvg é módulo nativo. O SVG não é interpretado como vetor: raster a `DPI` basta para a serra ler a cota e
 * mantém o arquivo pequeno.
 */

import 'server-only';
import { Resvg } from '@resvg/resvg-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface PdfPage {
  /** Rótulo no rodapé (id do painel, ou "Panel plan"). */
  label: string;
  svg: string;
}

export interface PdfOptions {
  projectName: string;
  /** Pontos por polegada do raster. 220 deixa a cota legível a 100 % e cada página em ~200–400 KB. */
  dpi?: number;
}

/** Carta paisagem em pontos (72 por polegada) e margem de 0,4" (a mesma do `@page` da impressão). */
export const LETTER = { width: 792, height: 612 } as const;
export const MARGIN_PT = 0.4 * 72;
export const FOOTER_PT = 14;
export const DEFAULT_DPI = 220;

/** Lado maior do raster, em px, para a página inteira na resolução pedida. */
function rasterWidth(dpi: number): number {
  return Math.round(((LETTER.width - 2 * MARGIN_PT) / 72) * dpi);
}

/** Rasteriza um SVG com a largura dada (altura proporcional), PNG. */
export function rasterize(svg: string, widthPx: number): Uint8Array {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: widthPx }, font: { loadSystemFonts: true, defaultFontFamily: 'Arial' }, background: '#ffffff' });
  return r.render().asPng();
}

export async function sheetsPdf(pages: readonly PdfPage[], opts: PdfOptions): Promise<Uint8Array> {
  if (pages.length === 0) throw new RangeError('nenhuma folha para o PDF');
  const dpi = opts.dpi ?? DEFAULT_DPI;
  const doc = await PDFDocument.create();
  doc.setTitle(`${opts.projectName} — fabrication sheets`);
  doc.setProducer('Panelizer');
  doc.setCreator('Panelizer');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const innerW = LETTER.width - 2 * MARGIN_PT;
  const innerH = LETTER.height - 2 * MARGIN_PT - FOOTER_PT;
  const widthPx = rasterWidth(dpi);
  for (const [i, p] of pages.entries()) {
    const png = await doc.embedPng(rasterize(p.svg, widthPx));
    const scale = Math.min(innerW / png.width, innerH / png.height);
    const w = png.width * scale;
    const h = png.height * scale;
    const page = doc.addPage([LETTER.width, LETTER.height]);
    // Centrado no miolo, acima do rodapé.
    page.drawImage(png, { x: MARGIN_PT + (innerW - w) / 2, y: MARGIN_PT + FOOTER_PT + (innerH - h) / 2, width: w, height: h });
    const footer = `${opts.projectName}  ·  ${p.label}`;
    const count = `${i + 1} de ${pages.length}`;
    page.drawText(footer, { x: MARGIN_PT, y: MARGIN_PT, size: 8, font, color: rgb(0.26, 0.31, 0.42) });
    page.drawText(count, { x: LETTER.width - MARGIN_PT - font.widthOfTextAtSize(count, 8), y: MARGIN_PT, size: 8, font, color: rgb(0.26, 0.31, 0.42) });
  }
  return doc.save();
}

/** Bytes → base64, para a server action devolver (JSON). */
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
