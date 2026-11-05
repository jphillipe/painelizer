/**
 * Cabeçalho da folha (S17): id do painel e projeto; dados do painel, data e revisão; linha da vista (P24).
 */

import type { Panel } from '../../panel';
import { esc, px } from './primitives';
import type { SheetStrings } from './strings';

/** Altura do cabeçalho: três linhas (id/projeto, dados do painel/data, vista). */
export const TITLE_HEIGHT = 60;

export interface SheetStamp {
  project?: string;
  date?: string;
  revision?: string;
}

/** Linhas do cabeçalho, alinhadas entre `margin` e `totalW − margin`. */
export function sheetHeader(
  panel: Panel,
  stamp: SheetStamp,
  margin: number,
  totalW: number,
  pieces: number,
  weightLb: number,
  S: SheetStrings,
): string[] {
  const out: string[] = [];
  const right = totalW - margin;
  out.push(
    `<text x="${px(margin)}" y="${px(margin + 18)}" font-size="18" font-weight="bold" fill="#000">` +
      `${esc(panel.id)}</text>`,
  );
  if (stamp.project !== undefined) {
    out.push(
      `<text class="project" x="${px(right)}" y="${px(margin + 18)}" font-size="14" font-weight="bold" ` +
        `fill="#000" text-anchor="end">${esc(stamp.project)}</text>`,
    );
  }
  out.push(
    `<text class="info" x="${px(margin)}" y="${px(margin + 34)}" font-size="12" fill="#333">` +
      `${esc(S.infoLine(panel, pieces, weightLb))}</text>`,
  );
  const date = S.stampLine(stamp.date, stamp.revision);
  if (date !== '') {
    out.push(
      `<text class="stamp" x="${px(right)}" y="${px(margin + 34)}" font-size="11" fill="#333" ` +
        `text-anchor="end">${esc(date)}</text>`,
    );
  }
  out.push(
    `<text class="view" x="${px(margin)}" y="${px(margin + 48)}" font-size="11" fill="#333">` +
      `${esc(S.viewNote(panel))}</text>`,
  );
  return out;
}
