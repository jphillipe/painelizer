/**
 * Folha de fabricação de um painel em SVG (S5 elevação → S17 folha), sem dependências. Esta função só monta a
 * página; cada parte mora em `sheet/`: primitivos de desenho (`primitives.ts`, comuns com a planta), peças
 * (`members.ts`), cotas (`dims.ts`), lista de peças (`pieceList.ts`), cabeçalho (`header.ts`) e todos os
 * textos (`strings.ts`).
 *
 * Convenções:
 * - A elevação vai sempre de start para end: x=0 à esquerda, como a planta, a lista de corte e a cadeia de
 *   cotas. A folha diz qual face o leitor vê (hipótese P24): em parede externa em planta, `panel.facing`
 *   (`'exterior'` = vista de fora, `'interior'` = vista de dentro, face externa no verso); parede externa solta
 *   assume vista de fora; parede interna só indica o início. Nunca espelha o desenho.
 * - Escala padrão 4 px por polegada (`opts.scale`). O eixo y do painel cresce para cima (y=0 na base da
 *   bottom plate); o do SVG cresce para baixo. `toPy` converte o topo de cada caixa.
 * - Cabeçalho: id do painel, projeto (`opts.project`), parede, pavimento, seção, externa/interna,
 *   portante, dimensões, nº de peças a cortar (plies contam, como na lista), peso, data e revisão (`opts.date`,
 *   `opts.revision` — a folha não lê o relógio: mesma entrada, mesma string) e a linha da vista (P24).
 * - Desenho: contorno tracejado, members com cor por papel e `<title>`, rótulo curto por peça (K king, J jack,
 *   C cripple, H header, S sill, B bloco; studs e plates sem letra; stud extra com o `label` do projeto ao longo
 *   da peça), cortes na obra hachurados em vermelho, cotas de RO (largura; peitoril, altura do RO e base do
 *   header ao subfloor, dentro do vão), nota da face no topo, avanço da double top plate cotado (S14).
 * - Rodapé: cota do comprimento, marcas de layout (`layoutOrigin + k·studSpacing`, mais 0 e o fechamento) e
 *   a cadeia acumulada do centro de cada peça vertical a partir de x=0 (rótulos girados; segunda fileira
 *   quando dois centros ficam a menos de 11 px), legenda das letras e avisos.
 * - Margem direita: lista de peças da `cutList` (qtd, papel, seção, pés-pol, polegadas), peso estimado
 *   (`weightLb`; madeira sem sheathing, P8) e cortes na obra.
 * - Saída determinística: mesma entrada → mesma string.
 */

import { piecesOf, type Panel, type Warning } from '../panel';
import { formatFeetInches } from '../units';
import { CHAIN_ROW, layoutMarksSvg, openingDims, studChain } from './sheet/dims';
import { TITLE_HEIGHT, sheetHeader } from './sheet/header';
import { FIELD_CUT_HATCH, fieldCutMark, memberLabels, memberRect, overhang } from './sheet/members';
import { LIST_WIDTH, pieceList } from './sheet/pieceList';
import { FONT, LABEL, MUTED, STROKE, dimensionH, dimensionV, esc, px } from './sheet/primitives';
import { LEGEND, faceNote, overhangLabel } from './sheet/strings';

export { verticalCenters } from './sheet/dims';
export { memberBox, SHORT_LABEL, type MemberBox } from './sheet/members';
export { DIM, FONT, STROKE, dimensionH, dimensionV, esc, px } from './sheet/primitives';
export { viewNote } from './sheet/strings';

export interface PanelSvgOptions {
  /** Pixels por polegada. Padrão 4. */
  scale?: number;
  /** Espaçamento OC usado para as marcas de layout no rodapé. Padrão 16. */
  studSpacing?: number;
  /** Margem externa em px. Padrão 24. */
  margin?: number;
  /** Nome do projeto, no cabeçalho (S17). Ausente = sem projeto. */
  project?: string;
  /** Data da folha, como texto (S17). Ausente = sem data. A folha nunca lê o relógio. */
  date?: string;
  /** Revisão da folha, como texto (S17). Ausente = sem revisão. */
  revision?: string;
}

const DIM_LEFT_WIDTH = 56;
const DIM_GAP = 28;
const LAYOUT_GAP = 34;
/** Da linha das marcas de layout à linha da cadeia de centros. */
const CHAIN_GAP = 24;
const LEGEND_GAP = 14;
const WARNING_LINE = 16;
/** Espaço extra acima do painel para a cota do avanço da double top plate (S14). */
const OVERHANG_DIM_GAP = 22;
/** Da borda direita do desenho à lista de peças. */
const LIST_GAP = 28;

export function panelSvg(panel: Panel, opts: PanelSvgOptions = {}): string {
  const scale = opts.scale ?? 4;
  const studSpacing = opts.studSpacing ?? 16;
  const margin = opts.margin ?? 24;

  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`panelSvg: scale inválido (${scale}); esperado número > 0`);
  }
  if (!Number.isFinite(studSpacing) || studSpacing <= 0) {
    throw new RangeError(`panelSvg: studSpacing inválido (${studSpacing}); esperado número > 0`);
  }
  if (!Number.isFinite(margin) || margin < 0) {
    throw new RangeError(`panelSvg: margin inválido (${margin}); esperado número ≥ 0`);
  }
  if (
    !Number.isFinite(panel.length) ||
    panel.length <= 0 ||
    !Number.isFinite(panel.height) ||
    panel.height <= 0
  ) {
    throw new RangeError(
      `panelSvg: painel ${panel.id} com dimensões inválidas (${panel.length} × ${panel.height})`,
    );
  }

  // Avanço da double top plate além do contorno (laps de canto e T, S14): o desenho abre espaço dos dois
  // lados e cota o avanço. Sem avanço, nada muda.
  const { left: overLeft, right: overRight } = overhang(panel);
  const drawX0 = margin + DIM_LEFT_WIDTH + overLeft * scale;
  // Com avanço, a cota fica entre o cabeçalho e o topo do painel: o desenho desce `OVERHANG_DIM_GAP`.
  const drawY0 = margin + TITLE_HEIGHT + (overLeft > 0 || overRight > 0 ? OVERHANG_DIM_GAP : 0);
  const drawW = panel.length * scale;
  const drawH = panel.height * scale;
  const dimY = drawY0 + drawH + DIM_GAP;
  const layoutY = dimY + LAYOUT_GAP;
  const chainY = layoutY + CHAIN_GAP;

  const toPx = (x: number): number => drawX0 + x * scale;
  /** y em px do topo de uma caixa cujo topo está em `yTop` polegadas. */
  const toPy = (yTop: number): number => drawY0 + (panel.height - yTop) * scale;

  const chain = studChain(panel, chainY, toPx);
  const legendY = chainY + 6 + CHAIN_ROW * chain.rows + LEGEND_GAP;
  const warningsY = legendY + 6;

  const listX = drawX0 + drawW + overRight * scale + LIST_GAP;
  const list = pieceList(panel, listX, drawY0);
  const totalW = listX + LIST_WIDTH + margin;
  const totalH = Math.max(warningsY + panel.warnings.length * WARNING_LINE, list.bottom) + margin;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px(totalW)}" height="${px(totalH)}" ` +
      `viewBox="0 0 ${px(totalW)} ${px(totalH)}" font-family="${FONT}">`,
  );
  out.push(`<rect width="${px(totalW)}" height="${px(totalH)}" fill="#ffffff"/>`);

  // Cabeçalho.
  out.push(...sheetHeader(panel, opts, margin, totalW, piecesOf(panel), panel.weightLb));

  // Contorno do painel.
  out.push(
    `<rect x="${px(toPx(0))}" y="${px(toPy(panel.height))}" width="${px(drawW)}" height="${px(drawH)}" ` +
      `fill="none" stroke="#999" stroke-width="0.5" stroke-dasharray="4 3"/>`,
  );

  // Members.
  out.push(`<g class="members" stroke="${STROKE}" stroke-width="1">`);
  for (const m of panel.members) {
    out.push(memberRect(m, scale, toPx, toPy));
  }
  out.push('</g>');

  // Rótulos curtos por peça (S17).
  out.push(`<g class="labels" font-size="8" font-weight="bold" fill="${LABEL}" text-anchor="middle">`);
  out.push(...memberLabels(panel, scale, toPx, toPy));
  out.push('</g>');

  // Cortes na obra, por cima das peças.
  if (panel.fieldCuts.length > 0) {
    out.push(FIELD_CUT_HATCH);
    for (const cut of panel.fieldCuts) {
      out.push(fieldCutMark(cut, panel, scale, toPx, toPy));
    }
  }

  // Cotas de cada abertura, dentro do vão (S17).
  for (const o of panel.openings) {
    out.push(...openingDims(o, panel, toPx, toPy));
  }

  // Nota da face no topo do desenho (P24).
  out.push(
    `<text class="face" x="${px(toPx(panel.length / 2))}" y="${px(toPy(panel.height) - 3)}" font-size="10" ` +
      `fill="${MUTED}" text-anchor="middle">${esc(faceNote(panel))}</text>`,
  );

  // Cota do comprimento (embaixo).
  out.push(dimensionH(toPx(0), toPx(panel.length), dimY, toPy(0), formatFeetInches(panel.length)));
  // Cotas do avanço da double top plate (acima do topo do painel).
  const overY = toPy(panel.height) - 10;
  if (overLeft > 0) {
    out.push(dimensionH(toPx(-overLeft), toPx(0), overY, toPy(panel.height), overhangLabel(overLeft)));
  }
  if (overRight > 0) {
    out.push(
      dimensionH(toPx(panel.length), toPx(panel.length + overRight), overY, toPy(panel.height), overhangLabel(overRight)),
    );
  }
  // Cota da altura (à esquerda).
  out.push(dimensionV(margin + 20, toPy(panel.height), toPy(0), toPx(0), formatFeetInches(panel.height)));

  // Marcas de layout no rodapé.
  out.push(layoutMarksSvg(panel.length, studSpacing, panel.layoutOrigin, layoutY, toPx));

  // Cadeia acumulada dos centros dos studs (S17).
  out.push(chain.svg);

  // Lista de peças, peso e cortes na obra (margem direita).
  out.push(list.svg);

  // Legenda e avisos.
  out.push(`<text class="legend" x="${px(margin)}" y="${px(legendY)}" font-size="9" fill="${MUTED}">${LEGEND}</text>`);
  panel.warnings.forEach((w, i) => {
    out.push(warningLine(w, margin, warningsY + (i + 1) * WARNING_LINE));
  });

  out.push('</svg>');
  return out.join('\n');
}

function warningLine(w: Warning, x: number, y: number): string {
  return (
    `<text x="${px(x)}" y="${px(y)}" font-size="11" fill="#a33">` +
    `! ${esc(w.code)}: ${esc(w.message)}</text>`
  );
}
