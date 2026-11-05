/**
 * Cabeçalho da folha (S17): id do painel e projeto; dados do painel, data e revisão; linha da vista (P24). Logo abaixo
 * vem o bloco "Wall content" (S39, `content.ts`), de altura variável: a altura do cabeçalho inteiro deixou de ser fixa
 * (era `TITLE_HEIGHT = 60`) e é `CONTENT_TOP` + a altura do bloco.
 */

import type { Panel } from '../../panel';
import { esc, px } from './primitives';
import type { SheetStrings } from './strings';

/** Da margem ao topo do bloco "Wall content": as três linhas do cabeçalho (id/projeto, dados/data, vista). */
export const CONTENT_TOP = 54;

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
