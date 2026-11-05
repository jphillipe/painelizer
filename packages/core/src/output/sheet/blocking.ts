/**
 * Fileiras de blocking na folha (S36): fire blocking (S31) e fileiras por altura (P44). Cada fileira ganha, numa
 * coluna entre o desenho e a lista de peças, a cota do subfloor ao **centro** do bloco e o rótulo do uso
 * (`B · Base cabinets / countertop (center 36")`). O ladder do T (bloco sem `blocking`) fica só com a letra B, como
 * antes. Painel sem fileira não ganha coluna: a folha sai byte a byte como antes.
 */

import { EPS } from '../../eps';
import type { BlockingKind, Panel } from '../../panel';
import { formatInches } from '../../units';
import { memberBox, type ToPy } from './members';
import { DIM, dimensionV, esc, px } from './primitives';
import type { SheetStrings } from './strings';

/** Uma fileira desenhada: uso, centro ao subfloor e trecho em x que os blocos ocupam. */
export interface SheetBlockingRow {
  kind: BlockingKind;
  /** Uso da fileira por altura; ausente no fire blocking. */
  label?: string;
  center: number;
  lo: number;
  hi: number;
}

/** Distância entre duas cotas de fileira na coluna (px). */
const ROW_DIM_STEP = 14;
/** Da borda do desenho à primeira cota. */
const COLUMN_PAD = 12;
/** Largura estimada de um caractere do rótulo (9 px). */
const CHAR_WIDTH = 5;
/** Distância mínima entre dois rótulos na vertical (px). */
const TEXT_LINE = 11;

/** As fileiras do painel (blocos com `blocking`), por centro crescente; mesmo uso e mesma altura = uma fileira. */
export function blockingRows(panel: Pick<Panel, 'members'>): SheetBlockingRow[] {
  const rows: SheetBlockingRow[] = [];
  for (const m of panel.members) {
    if (m.role !== 'block' || m.blocking === undefined) continue;
    const box = memberBox(m);
    const center = box.y + box.height / 2;
    const row = rows.find((r) => r.kind === m.blocking && r.label === m.label && Math.abs(r.center - center) < EPS);
    if (row === undefined) {
      rows.push({ kind: m.blocking, ...(m.label === undefined ? {} : { label: m.label }), center, lo: box.x, hi: box.x + box.width });
    } else {
      row.lo = Math.min(row.lo, box.x);
      row.hi = Math.max(row.hi, box.x + box.width);
    }
  }
  return rows.sort((a, b) => a.center - b.center || a.lo - b.lo);
}

/** Largura da coluna das fileiras (px), 0 sem fileira. */
export function blockingColumnWidth(rows: readonly SheetBlockingRow[], S: SheetStrings): number {
  if (rows.length === 0) return 0;
  const longest = Math.max(...rows.map((r) => S.blockingRow(r).length));
  return COLUMN_PAD + rows.length * ROW_DIM_STEP + 4 + longest * CHAR_WIDTH;
}

/**
 * Cotas e rótulos das fileiras, a partir de `columnX` (borda direita do desenho, avanço incluído). Cada fileira: cota
 * vertical do subfloor ao centro (linhas de chamada desde `fromX`, a ponta do painel) e o rótulo à direita das cotas,
 * na altura da fileira (desce quando encosta no de cima).
 */
export function blockingDims(
  rows: readonly SheetBlockingRow[],
  columnX: number,
  fromX: number,
  toPy: ToPy,
  S: SheetStrings,
): string[] {
  if (rows.length === 0) return [];
  const out: string[] = [];
  const textX = columnX + COLUMN_PAD + rows.length * ROW_DIM_STEP + 4;
  rows.forEach((r, i) => {
    out.push(dimensionV(columnX + COLUMN_PAD + i * ROW_DIM_STEP + 4, toPy(r.center), toPy(0), fromX, formatInches(r.center)));
  });
  out.push(`<g class="blocking-rows" font-size="9" fill="${DIM}">`);
  // De cima para baixo na folha (centro decrescente), cada rótulo pelo menos uma linha abaixo do anterior.
  let last = -Infinity;
  for (const r of [...rows].reverse()) {
    const y = Math.max(toPy(r.center) + 3, last + TEXT_LINE);
    last = y;
    out.push(`<text class="blocking-row ${r.kind}" x="${px(textX)}" y="${px(y)}">${esc(S.blockingRow(r))}</text>`);
  }
  out.push('</g>');
  return out;
}
