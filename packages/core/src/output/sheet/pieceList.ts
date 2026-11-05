/**
 * Lista de peças na margem direita da folha (S17): da `cutList`, com comprimento em pés-pol e em polegadas;
 * depois o peso estimado (madeira sem sheathing, P8) e os cortes na obra.
 */

import type { Panel } from '../../panel';
import { formatFeetInches, formatInches } from '../../units';
import { cutList } from '../cutlist';
import { FIELD_CUT, MUTED, esc, px } from './primitives';
import type { SheetStrings } from './strings';

/** Largura da coluna da lista. */
export const LIST_WIDTH = 282;
const LIST_ROW = 13;

/** A lista a partir de (`x`, `y0`). Devolve o SVG e o y onde termina. */
export function pieceList(panel: Panel, x: number, y0: number, S: SheetStrings): { svg: string; bottom: number } {
  const lines = cutList(panel);
  const PIECE_LIST = S.pieceList;
  const out: string[] = [];
  const col = { qty: x + 18, role: x + 26, section: x + 96, feet: x + 230, inches: x + LIST_WIDTH };
  let y = y0 + 12;
  out.push(`<g class="pieces" font-size="11" fill="#000">`);
  out.push(`<text x="${px(x)}" y="${px(y)}" font-size="12" font-weight="bold">${PIECE_LIST.title}</text>`);
  y += LIST_ROW + 2;
  out.push(
    `<g font-size="9" fill="${MUTED}">` +
      `<text x="${px(col.qty)}" y="${px(y)}" text-anchor="end">${PIECE_LIST.qty}</text>` +
      `<text x="${px(col.role)}" y="${px(y)}">${PIECE_LIST.role}</text>` +
      `<text x="${px(col.section)}" y="${px(y)}">${PIECE_LIST.section}</text>` +
      `<text x="${px(col.feet)}" y="${px(y)}" text-anchor="end">${PIECE_LIST.feet}</text>` +
      `<text x="${px(col.inches)}" y="${px(y)}" text-anchor="end">${PIECE_LIST.inches}</text></g>`,
  );
  out.push(
    `<line x1="${px(x)}" y1="${px(y + 3)}" x2="${px(x + LIST_WIDTH)}" y2="${px(y + 3)}" stroke="${MUTED}" stroke-width="0.5"/>`,
  );
  for (const l of lines) {
    y += LIST_ROW;
    out.push(
      `<g class="piece ${l.role}">` +
        `<text x="${px(col.qty)}" y="${px(y)}" text-anchor="end">${l.qty}</text>` +
        `<text x="${px(col.role)}" y="${px(y)}">${esc(S.cutRoleName[l.role])}</text>` +
        `<text x="${px(col.section)}" y="${px(y)}">${esc(l.section)}</text>` +
        `<text x="${px(col.feet)}" y="${px(y)}" text-anchor="end">${esc(formatFeetInches(l.length))}</text>` +
        `<text x="${px(col.inches)}" y="${px(y)}" text-anchor="end">${esc(formatInches(l.length))}</text></g>`,
    );
  }
  const total = lines.reduce((n, l) => n + l.qty, 0);
  y += LIST_ROW;
  out.push(
    `<line x1="${px(x)}" y1="${px(y - 9)}" x2="${px(x + LIST_WIDTH)}" y2="${px(y - 9)}" stroke="${MUTED}" stroke-width="0.5"/>`,
  );
  out.push(`<text x="${px(col.qty)}" y="${px(y)}" text-anchor="end" font-weight="bold">${total}</text>`);
  out.push(`<text x="${px(col.role)}" y="${px(y)}" font-weight="bold">${PIECE_LIST.total}</text>`);

  y += LIST_ROW + 6;
  out.push(`<text class="weight" x="${px(x)}" y="${px(y)}">${PIECE_LIST.weight(panel.weightLb)}</text>`);
  y += LIST_ROW - 2;
  out.push(`<text x="${px(x)}" y="${px(y)}" font-size="9" fill="${MUTED}">${PIECE_LIST.weightNote}</text>`);

  if (panel.fieldCuts.length > 0) {
    y += LIST_ROW + 6;
    out.push(`<text x="${px(x)}" y="${px(y)}" font-weight="bold" fill="${FIELD_CUT}">${PIECE_LIST.fieldCuts}</text>`);
    for (const cut of panel.fieldCuts) {
      y += LIST_ROW;
      out.push(
        `<text class="field-cut-item" x="${px(x)}" y="${px(y)}" fill="${FIELD_CUT}">` +
          `${esc(S.fieldCutItem(cut))}</text>`,
      );
    }
  }
  out.push('</g>');
  return { svg: out.join('\n'), bottom: y };
}
