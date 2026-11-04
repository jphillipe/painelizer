/**
 * Tolerância de leitura (hipótese P40, decisão do humano em 2026-10-15): abertura que conflita por pouco com
 * a ponta da parede ou com uma parede em T é deslocada o mínimo necessário, até `maxShift` (1 1/2", um stud).
 *
 * Regras:
 * - Conflitos: zona da abertura (RO + jacks + kings) fora de `[0, length]`; faixa de T sobrepondo o RO.
 * - Deslocamento: para a ponta, o que falta para a zona caber; para o T, o menor dos dois (RO termina no início
 *   da faixa ou começa no fim dela). Depois de deslocada, a abertura não pode ter conflito nenhum, nem chegar a
 *   menos de 3 studs (jack + king + jack) do RO de uma vizinha; senão fica onde estava e o erro de sempre aparece.
 * - Faixa de T só na zona (kings/jacks), sem tocar o RO, não é conflito aqui: é o aviso `OPENING_AT_TEE`.
 * - Aberturas em ordem de offset; cada uma vê as vizinhas já deslocadas.
 */

import { EPS } from '../eps';
import { overlaps } from '../geom';
import type { Opening } from '../opening';
import type { TeeStrip } from './corners';
import { openingZone } from './openings';

/** Um stud: o maior deslocamento aceito. */
export const MAX_NUDGE = 1.5;

export interface Nudge {
  openingId: string;
  from: number;
  to: number;
  /** O que a abertura tocava: o início, o fim da parede ou a parede em T. */
  touched: Touched;
}

export type Touched = { kind: 'start' } | { kind: 'end' } | { kind: 'tee'; wallId?: string };

interface Conflict {
  shift: number;
  touched: Touched;
}

function conflictOf(o: Opening, length: number, strips: readonly TeeStrip[], t: number): Conflict | undefined {
  const zone = openingZone(o, t);
  if (zone.start < -EPS) return { shift: -zone.start, touched: { kind: 'start' } };
  if (zone.end > length + EPS) return { shift: length - zone.end, touched: { kind: 'end' } };
  const end = o.offset + o.roughWidth;
  for (const s of strips) {
    if (overlaps(s.lo, s.hi, o.offset, end)) {
      const left = s.lo - end;
      const right = s.hi - o.offset;
      return { shift: Math.abs(left) <= Math.abs(right) ? left : right, touched: s.wallId === undefined ? { kind: 'tee' } : { kind: 'tee', wallId: s.wallId } };
    }
  }
  return undefined;
}

/**
 * @param openings aberturas com `jackStuds`/`kingStuds` resolvidos (a zona depende deles), em qualquer ordem
 * @returns as aberturas (na ordem recebida, deslocadas quando resolveu) e os deslocamentos feitos
 */
export function nudgeOpenings(
  openings: readonly Opening[],
  length: number,
  strips: readonly TeeStrip[],
  studThickness: number,
  maxShift: number = MAX_NUDGE,
): { openings: Opening[]; nudges: Nudge[] } {
  const t = studThickness;
  const out = openings.map((o) => ({ ...o }));
  const nudges: Nudge[] = [];
  const sorted = [...out].sort((a, b) => a.offset - b.offset);
  for (const o of sorted) {
    const c = conflictOf(o, length, strips, t);
    if (c === undefined || Math.abs(c.shift) > maxShift + EPS) continue;
    const moved = { ...o, offset: o.offset + c.shift };
    if (conflictOf(moved, length, strips, t) !== undefined) continue;
    const tooClose = sorted.some(
      (n) =>
        n !== o &&
        moved.offset < n.offset + n.roughWidth + 3 * t - EPS &&
        n.offset < moved.offset + moved.roughWidth + 3 * t - EPS,
    );
    if (tooClose) continue;
    nudges.push({ openingId: o.id, from: o.offset, to: moved.offset, touched: c.touched });
    o.offset = moved.offset;
  }
  return { openings: out, nudges };
}
