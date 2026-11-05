/**
 * Cotas da folha (S17): as de cada abertura dentro do vão, as marcas de layout e a cadeia acumulada dos centros
 * das peças verticais no rodapé.
 */

import { EPS } from '../../eps';
import type { Panel, PanelOpening } from '../../panel';
import { NOMINAL_2X_THICKNESS } from '../../sections';
import { formatInches } from '../../units';
import { layoutMarks } from '../../rules/studs';
import { memberBox, type ToPx, type ToPy } from './members';
import { DIM, MUTED, dimensionH, dimensionV, esc, px } from './primitives';
import type { SheetStrings } from './strings';

/** Altura de uma fileira de rótulos girados da cadeia (até `143 1/4"` em 9 px). */
export const CHAIN_ROW = 46;
/** Distância mínima em px entre dois rótulos da mesma fileira. */
const CHAIN_MIN_SPACING = 11;

/**
 * Cotas de uma abertura, dentro do vão (S17): id e tipo no topo; largura do RO logo abaixo do header;
 * na vertical, junto ao jack direito, peitoril (base do RO) e altura do RO em cadeia e a base do header
 * (= topo do RO) ao subfloor em linha própria. Porta (base do RO em 0): uma linha só.
 */
export function openingDims(o: PanelOpening, panel: Panel, toPx: ToPx, toPy: ToPy, S: SheetStrings): string[] {
  const OPENING_DIM = S.openingDim;
  if (!(o.width > 0) || !(o.height > 0) || !Number.isFinite(o.top)) {
    throw new RangeError(`panelSvg: panel ${panel.id}: opening ${o.id} has an invalid RO (${o.width} × ${o.height}, top ${o.top})`);
  }
  const out: string[] = [];
  const base = o.top - o.height;
  // Largura: linha a 9" abaixo do topo do RO (ou no meio, em RO baixo); id e tipo logo abaixo da linha
  // (acima dela fica o valor; o "H" do header deitado fica colado ao header).
  const widthY = toPy(o.top - Math.min(9, o.height / 2));
  out.push(dimensionH(toPx(o.x), toPx(o.x + o.width), widthY, toPy(o.top), OPENING_DIM.width(o.width)));
  out.push(
    `<text class="opening-id" x="${px(toPx(o.x + o.width / 2))}" y="${px(widthY + 12)}" font-size="10" ` +
      `fill="${MUTED}" text-anchor="middle">${esc(S.openingLabel(o))}</text>`,
  );
  // Alturas: linhas verticais recuadas do jack direito.
  const inset = Math.min(5, o.width / 4);
  const xA = toPx(o.x + o.width - inset);
  const xB = toPx(o.x + o.width - 2 * inset);
  const fromX = toPx(o.x + o.width);
  if (base > EPS) {
    out.push(dimensionV(xA, toPy(base), toPy(0), fromX, OPENING_DIM.sill(base)));
    out.push(dimensionV(xA, toPy(o.top), toPy(base), fromX, OPENING_DIM.height(o.height)));
    out.push(dimensionV(xB, toPy(o.top), toPy(0), fromX, OPENING_DIM.header(o.top)));
  } else {
    out.push(dimensionV(xA, toPy(o.top), toPy(0), fromX, OPENING_DIM.door(o.height, o.top, Math.abs(base) < EPS)));
  }
  return out;
}

/**
 * Marcas de layout no rodapé: o início (0), as marcas `origin + k·spacing` estritamente entre 0 e o
 * fechamento (`length − 1.5`) — centro de cada stud de layout (S11) — e o próprio fechamento,
 * com o valor em polegadas medido da ponta do painel.
 */
export function layoutMarksSvg(length: number, spacing: number, origin: number, y: number, toPx: ToPx): string {
  const closing = length - NOMINAL_2X_THICKNESS;
  const marks = [0, ...layoutMarks(length, spacing, origin).filter((x) => x > 0 && x < closing)];
  if (closing > 0) marks.push(closing);

  const parts: string[] = [`<g class="layout" stroke="#666" stroke-width="0.75">`];
  parts.push(`<line x1="${px(toPx(0))}" y1="${px(y)}" x2="${px(toPx(length))}" y2="${px(y)}"/>`);
  for (const x of marks) {
    parts.push(`<line x1="${px(toPx(x))}" y1="${px(y - 8)}" x2="${px(toPx(x))}" y2="${px(y)}"/>`);
  }
  parts.push('</g>');
  for (const [i, x] of marks.entries()) {
    // Fechamento colado à última marca (menos de 32 px): o rótulo desce uma linha para não a cobrir.
    const crowded = i === marks.length - 1 && i > 0 && (x - marks[i - 1]!) * (toPx(1) - toPx(0)) < 32;
    parts.push(
      `<text x="${px(toPx(x))}" y="${px(y + 11 + (crowded ? 11 : 0))}" font-size="9" fill="#666" text-anchor="middle">` +
        `${esc(formatInches(x))}</text>`,
    );
  }
  return parts.join('\n');
}

/** Centros (x, polegadas) de cada peça vertical do painel, sem repetição (1/64"), em ordem. */
export function verticalCenters(panel: Pick<Panel, 'members'>): number[] {
  const centers: number[] = [];
  for (const m of panel.members) {
    if (m.orientation !== 'vertical') continue;
    const box = memberBox(m);
    const c = Math.round((box.x + box.width / 2) * 64) / 64;
    if (!centers.includes(c)) centers.push(c);
  }
  return centers.sort((a, b) => a - b);
}

/**
 * Cadeia acumulada de cotas no rodapé (S17): tique em x=0 e em cada centro de peça vertical, com a
 * distância a x=0 em polegadas, girada −90°. Rótulos a menos de `CHAIN_MIN_SPACING` px do anterior na
 * mesma fileira descem para a segunda fileira. Devolve o SVG e o número de fileiras usadas (1 ou 2).
 */
export function studChain(panel: Panel, y: number, toPx: ToPx): { svg: string; rows: number } {
  const centers = verticalCenters(panel);
  const parts: string[] = [`<g class="chain" stroke="${DIM}" stroke-width="0.75">`];
  parts.push(`<line x1="${px(toPx(0))}" y1="${px(y)}" x2="${px(toPx(panel.length))}" y2="${px(y)}"/>`);
  parts.push(`<line x1="${px(toPx(0))}" y1="${px(y - 8)}" x2="${px(toPx(0))}" y2="${px(y + 4)}"/>`);
  for (const c of centers) {
    parts.push(`<line x1="${px(toPx(c))}" y1="${px(y - 6)}" x2="${px(toPx(c))}" y2="${px(y + 4)}"/>`);
  }
  parts.push('</g>');
  parts.push(`<g class="chain-labels" font-size="9" fill="${DIM}" text-anchor="end">`);
  const lastX = [-Infinity, -Infinity];
  let rows = 1;
  for (const c of centers) {
    const cx = toPx(c);
    // Fileira de cima se couber; senão a de baixo; se nem lá couber (escala muito pequena), a de cima mesmo.
    let row = 0;
    if (cx - lastX[0]! < CHAIN_MIN_SPACING) {
      rows = 2;
      if (cx - lastX[1]! >= CHAIN_MIN_SPACING) row = 1;
    }
    lastX[row] = cx;
    // Texto girado −90° com âncora no fim: lê de baixo para cima e termina em `ty`; o corpo das letras fica à
    // esquerda da âncora, então a âncora vai 3 px à direita do tique para centrar o texto nele.
    const tx = cx + 3;
    const ty = y + 6 + row * CHAIN_ROW;
    parts.push(
      `<text class="chain-label row-${row}" x="${px(tx)}" y="${px(ty)}" transform="rotate(-90 ${px(tx)} ${px(ty)})">` +
        `${esc(formatInches(c))}</text>`,
    );
  }
  parts.push('</g>');
  return { svg: parts.join('\n'), rows };
}
