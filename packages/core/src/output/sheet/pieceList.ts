/**
 * Lista de peças na margem direita da folha (S17): da `cutList`, com comprimento em pés-pol e em polegadas;
 * depois o peso estimado (madeira sem sheathing, P8), os posts com os conectores do projeto (S37) e os cortes na obra.
 */

import type { Panel } from '../../panel';
import { formatFeetInches, formatInches } from '../../units';
import { cutList } from '../cutlist';
import { FIELD_CUT, MUTED, esc, px } from './primitives';
import type { SheetStrings } from './strings';

/** Largura da coluna da lista. */
export const LIST_WIDTH = 282;
const LIST_ROW = 13;
/** Recuo e largura (em caracteres de 10 px) da linha de conectores do post (S37), para caber na coluna. */
const POST_INDENT = 8;
const POST_LINE_CHARS = 48;

/** Quebra o texto em linhas de até `max` caracteres, nos espaços (palavra maior que a linha fica inteira). */
export function wrapText(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line !== '' && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line === '' ? word : `${line} ${word}`;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

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

  // Posts (S37): o que o projeto diz de cada post (rótulo, seção, x, conectores). Só no painel com post.
  const posts = panel.members.filter((m) => m.role === 'post');
  if (posts.length > 0) {
    y += LIST_ROW + 6;
    out.push(`<text x="${px(x)}" y="${px(y)}" font-weight="bold">${S.posts.title}</text>`);
    for (const p of [...posts].sort((a, b) => a.x - b.x)) {
      y += LIST_ROW;
      out.push(`<text class="post-item" x="${px(x)}" y="${px(y)}">${esc(S.posts.item(p))}</text>`);
      const connectors = S.posts.connectors(p);
      for (const line of connectors === undefined ? [] : wrapText(connectors, POST_LINE_CHARS)) {
        y += LIST_ROW - 1;
        out.push(`<text class="post-connectors" x="${px(x + POST_INDENT)}" y="${px(y)}" font-size="10">${esc(line)}</text>`);
      }
    }
    for (const line of S.posts.note) {
      y += LIST_ROW - 2;
      out.push(`<text x="${px(x)}" y="${px(y)}" font-size="9" fill="${MUTED}">${esc(line)}</text>`);
    }
  }

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
