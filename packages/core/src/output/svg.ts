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
 * - Fileiras de blocking (S36): entre o desenho e a lista, a cota do subfloor ao centro de cada fileira (fogo e por
 *   altura) e o uso (`sheet/blocking.ts`); só quando o painel tem fileira.
 * - Margem direita: lista de peças da `cutList` (qtd, papel, seção, pés-pol, polegadas), peso estimado
 *   (`weightLb`; madeira e, com chapa, o sheathing, P8), chapas (S38), posts com os conectores do projeto (S37, só com
 *   post) e cortes na obra.
 * - Sheathing (S38): o contorno tracejado de cada chapa da face desenhada (a exterior; a interior quando só ela leva
 *   chapa) por cima das peças; o desenho abre espaço para o avanço no canto e na linha de piso. Só no painel com chapa:
 *   sem ela, a folha sai byte a byte como antes.
 * - Textos sempre em inglês (`sheet/strings.ts`; P51 resolvida).
 * - Saída determinística: mesma entrada → mesma string.
 */

import { piecesOf, type Panel, type SheathingSheet, type Warning } from '../panel';
import { formatFeetInches } from '../units';
import { blockingColumnWidth, blockingDims, blockingRows } from './sheet/blocking';
import { CHAIN_ROW, layoutMarksSvg, openingDims, studChain } from './sheet/dims';
import { TITLE_HEIGHT, sheetHeader } from './sheet/header';
import { FIELD_CUT_HATCH, fieldCutMark, memberLabels, memberRect, overhang } from './sheet/members';
import { LIST_WIDTH, pieceList } from './sheet/pieceList';
import { FONT, LABEL, MUTED, STROKE, dimensionH, dimensionV, esc, px } from './sheet/primitives';
import { sheetStrings, type SheetStrings } from './sheet/strings';

export { verticalCenters } from './sheet/dims';
export { memberBox, SHORT_LABEL, type MemberBox } from './sheet/members';
export { DIM, FONT, STROKE, dimensionH, dimensionV, esc, px } from './sheet/primitives';
export { sheetStrings, viewNote, type SheetStrings } from './sheet/strings';

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
  const S = sheetStrings();

  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`panelSvg: invalid scale (${scale}); expected a number > 0`);
  }
  if (!Number.isFinite(studSpacing) || studSpacing <= 0) {
    throw new RangeError(`panelSvg: invalid studSpacing (${studSpacing}); expected a number > 0`);
  }
  if (!Number.isFinite(margin) || margin < 0) {
    throw new RangeError(`panelSvg: invalid margin (${margin}); expected a number ≥ 0`);
  }
  if (
    !Number.isFinite(panel.length) ||
    panel.length <= 0 ||
    !Number.isFinite(panel.height) ||
    panel.height <= 0
  ) {
    throw new RangeError(
      `panelSvg: panel ${panel.id} has invalid dimensions (${panel.length} × ${panel.height})`,
    );
  }

  // Avanço da double top plate além do contorno (laps de canto e T, S14): o desenho abre espaço dos dois
  // lados e cota o avanço. Sem avanço, nada muda.
  const { left: overLeft, right: overRight } = overhang(panel);
  // Chapas além do contorno (S38): canto e linha de piso. Sem sheathing, tudo 0.
  const sheets = drawnSheets(panel);
  const sheathPad = sheathingPad(panel, sheets);
  const drawX0 = margin + DIM_LEFT_WIDTH + Math.max(overLeft, sheathPad.left) * scale;
  // Com avanço, a cota fica entre o cabeçalho e o topo do painel: o desenho desce `OVERHANG_DIM_GAP`.
  const drawY0 = margin + TITLE_HEIGHT + (overLeft > 0 || overRight > 0 ? OVERHANG_DIM_GAP : 0) + sheathPad.top * scale;
  const drawW = panel.length * scale;
  const drawH = panel.height * scale;
  const dimY = drawY0 + drawH + sheathPad.bottom * scale + DIM_GAP;
  const layoutY = dimY + LAYOUT_GAP;
  const chainY = layoutY + CHAIN_GAP;

  const toPx = (x: number): number => drawX0 + x * scale;
  /** y em px do topo de uma caixa cujo topo está em `yTop` polegadas. */
  const toPy = (yTop: number): number => drawY0 + (panel.height - yTop) * scale;

  const chain = studChain(panel, chainY, toPx);
  const legendY = chainY + 6 + CHAIN_ROW * chain.rows + LEGEND_GAP;
  const warningsY = legendY + 6;

  // Fileiras de blocking (S36): coluna de cotas e rótulos entre o desenho e a lista; sem fileira, nada muda.
  const rows = blockingRows(panel);
  const rightX = drawX0 + drawW + Math.max(overRight, sheathPad.right) * scale;
  const listX = rightX + blockingColumnWidth(rows, S) + LIST_GAP;
  const list = pieceList(panel, listX, drawY0, S);
  const totalW = listX + LIST_WIDTH + margin;
  const totalH = Math.max(warningsY + panel.warnings.length * WARNING_LINE, list.bottom) + margin;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px(totalW)}" height="${px(totalH)}" ` +
      `viewBox="0 0 ${px(totalW)} ${px(totalH)}" font-family="${FONT}">`,
  );
  out.push(`<rect width="${px(totalW)}" height="${px(totalH)}" fill="#ffffff"/>`);

  // Cabeçalho.
  out.push(...sheetHeader(panel, opts, margin, totalW, piecesOf(panel), panel.weightLb, S));

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

  // Chapas de sheathing (S38): contorno tracejado por cima das peças.
  if (sheets.length > 0) {
    out.push(`<g class="sheathing" fill="none" stroke="${SHEATHING_STROKE}" stroke-width="1.2" stroke-dasharray="8 4">`);
    for (const p of sheets) {
      out.push(
        `<rect x="${px(toPx(p.x))}" y="${px(toPy(p.y + p.h))}" width="${px(p.w * scale)}" height="${px(p.h * scale)}">` +
          `<title>${esc(S.sheathing.sheetTitle(p))}</title></rect>`,
      );
    }
    out.push('</g>');
  }

  // Cortes na obra, por cima das peças.
  if (panel.fieldCuts.length > 0) {
    out.push(FIELD_CUT_HATCH);
    for (const cut of panel.fieldCuts) {
      out.push(fieldCutMark(cut, panel, scale, toPx, toPy, S));
    }
  }

  // Cotas de cada abertura, dentro do vão (S17).
  for (const o of panel.openings) {
    out.push(...openingDims(o, panel, toPx, toPy, S));
  }

  // Cota ao subfloor e uso de cada fileira de blocking (S36).
  out.push(...blockingDims(rows, rightX, toPx(panel.length), toPy, S));

  // Nota da face no topo do desenho (P24).
  out.push(
    `<text class="face" x="${px(toPx(panel.length / 2))}" y="${px(toPy(panel.height) - 3)}" font-size="10" ` +
      `fill="${MUTED}" text-anchor="middle">${esc(S.faceNote(panel))}</text>`,
  );

  // Cota do comprimento (embaixo).
  out.push(dimensionH(toPx(0), toPx(panel.length), dimY, toPy(0), formatFeetInches(panel.length)));
  // Cotas do avanço da double top plate (acima do topo do painel).
  const overY = toPy(panel.height) - 10;
  if (overLeft > 0) {
    out.push(dimensionH(toPx(-overLeft), toPx(0), overY, toPy(panel.height), S.overhangLabel(overLeft)));
  }
  if (overRight > 0) {
    out.push(
      dimensionH(toPx(panel.length), toPx(panel.length + overRight), overY, toPy(panel.height), S.overhangLabel(overRight)),
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
  const baseLegend = panel.members.some((m) => m.role === 'post') ? S.legendWithPosts : S.legend;
  const legend = panel.sheathing === undefined ? baseLegend : `${baseLegend} · ${S.sheathing.legend}`;
  out.push(`<text class="legend" x="${px(margin)}" y="${px(legendY)}" font-size="9" fill="${MUTED}">${legend}</text>`);
  panel.warnings.forEach((w, i) => {
    out.push(warningLine(w, margin, warningsY + (i + 1) * WARNING_LINE, S));
  });

  out.push('</svg>');
  return out.join('\n');
}

/** Cor do contorno das chapas (S38). */
const SHEATHING_STROKE = '#2a7f62';

/** As chapas que a folha desenha: as da face exterior; as da interior quando só ela leva chapa (S38). */
function drawnSheets(panel: Panel): SheathingSheet[] {
  const s = panel.sheathing;
  if (s === undefined) return [];
  const face = s.sheets.some((p) => p.face === 'exterior') ? 'exterior' : 'interior';
  return s.sheets.filter((p) => p.face === face);
}

/** Quanto as chapas desenhadas passam do contorno do painel, em polegadas (0 sem chapa). */
function sheathingPad(panel: Panel, sheets: readonly SheathingSheet[]): { left: number; right: number; top: number; bottom: number } {
  if (sheets.length === 0) return { left: 0, right: 0, top: 0, bottom: 0 };
  return {
    left: Math.max(0, -Math.min(...sheets.map((p) => p.x))),
    right: Math.max(0, Math.max(...sheets.map((p) => p.x + p.w)) - panel.length),
    top: Math.max(0, Math.max(...sheets.map((p) => p.y + p.h)) - panel.height),
    bottom: Math.max(0, -Math.min(...sheets.map((p) => p.y))),
  };
}

function warningLine(w: Warning, x: number, y: number, S: SheetStrings): string {
  return (
    `<text x="${px(x)}" y="${px(y)}" font-size="11" fill="#a33">` +
    `! ${esc(w.code)}: ${esc(S.warning(w))}</text>`
  );
}
