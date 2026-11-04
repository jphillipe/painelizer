/**
 * Geometria em x comum às regras e à folha (S28.1): faixa de uma peça e sobreposição de faixas.
 */

import { EPS } from './eps';
import type { Member } from './panel';
import { verticalWidth } from './sections';

/** Faixa `[lo, hi]` em x. */
export interface Span {
  lo: number;
  hi: number;
}

/** As faixas `[aLo, aHi]` e `[bLo, bHi]` se sobrepõem com área (encostar não conta). */
export function overlaps(aLo: number, aHi: number, bLo: number, bHi: number): boolean {
  return aLo < bHi - EPS && aHi > bLo + EPS;
}

/** Faixa `[lo, hi]` que um member ocupa em x na elevação (stud flat do canto California: `sectionDepth`). */
export function span(m: Member): Span {
  const width = m.orientation === 'vertical' ? verticalWidth(m) : m.length;
  return { lo: m.x, hi: m.x + width };
}
