/**
 * Fusão de zonas de abertura vizinhas e posição dos kings da parede.
 *
 * Regras (docs/02-framing.md, docs/04-decisoes.md 2026-10-02):
 * - Aberturas em ordem de offset. Duas zonas que se tocam ou se sobrepõem viram uma zona só;
 *   os kings externos ficam, e entre os dois RO vão os jacks da esquerda, os kings compartilhados
 *   e os jacks da direita.
 * - Kings compartilhados = o maior número de kings das duas aberturas (1 no caso default),
 *   colados ao jack da abertura da esquerda; a folga que sobrar (< 1.5" no default) fica à direita.
 * - RO vizinhos mais próximos que jacks + kings compartilhados (4.5" no default) lançam
 *   `RangeError` — o que a fábrica faz nesse caso é P16.
 * - Com `fit` (hipótese P39), em vez do erro os kings compartilhados caem para o que cabe (mínimo 1) e o
 *   plano lista a redução em `reducedKings`; o erro fica para quando nem 1 king cabe.
 * - Aberturas isoladas ficam com os próprios kings (`openingKingXs`).
 *
 * `fitNeighborJacks` (hipótese P30) roda antes: par de RO vizinhos sem espaço para jacks + kings compartilhados
 * passa a 1 jack por lado nas duas aberturas, desde que jack + king + jack (4.5" no default) caiba. Os jacks
 * caem antes dos kings; se ainda faltar espaço, o `fit` reduz os kings.
 */

import type { Opening } from '../types';
import { openingKingXs, openingStudCounts, openingZone, type OpeningZone } from './openings';

/** Folga numérica para comparações de geometria. */
const EPS = 1e-9;

/** Zona de uma ou mais aberturas fundidas. */
export interface MergedZone extends OpeningZone {
  /** Aberturas da zona, em ordem de offset. */
  openingIds: string[];
}

export interface ZonePlan {
  /** Zonas já fundidas, em ordem de x. */
  zones: MergedZone[];
  /** x (borda esquerda) de todos os kings da parede, em ordem crescente. */
  kings: number[];
  /** Só com `fit` e só quando houve: pares em que os kings compartilhados ficaram abaixo do pedido. */
  reducedKings?: ReducedKings[];
}

/** Kings compartilhados reduzidos entre duas aberturas vizinhas (hipótese P39). */
export interface ReducedKings {
  prevId: string;
  curId: string;
  /** Distância entre os RO. */
  gap: number;
  /** O maior número de kings das duas aberturas. */
  wanted: number;
  /** Kings que o painel leva. */
  used: number;
}

/** Jacks reduzidos por falta de espaço entre RO vizinhos (hipótese P30). */
export interface ReducedJacks {
  openingId: string;
  /** Abertura vizinha que apertou. */
  neighborId: string;
  gap: number;
  wanted: number;
}

/**
 * Hipótese P30: RO vizinhos que não comportam jacks + kings compartilhados passam a 1 jack por lado nas duas
 * aberturas, se jack + king + jack couber. Devolve as aberturas (na ordem recebida) e as reduções.
 */
export function fitNeighborJacks(
  openings: readonly Opening[],
  studThickness: number,
): { openings: Opening[]; reduced: ReducedJacks[] } {
  const t = studThickness;
  const out = openings.map((o) => ({ ...o }));
  const sorted = [...out].sort((a, b) => a.offset - b.offset);
  const reduced: ReducedJacks[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const gap = cur.offset - (prev.offset + prev.roughWidth);
    const a = openingStudCounts(prev);
    const b = openingStudCounts(cur);
    const shared = Math.max(a.kings, b.kings);
    if (gap >= (a.jacks + shared + b.jacks) * t - EPS || gap < 3 * t - EPS) continue;
    for (const [o, neighbor, wanted] of [
      [prev, cur, a.jacks],
      [cur, prev, b.jacks],
    ] as const) {
      if (wanted > 1) {
        o.jackStuds = 1;
        reduced.push({ openingId: o.id, neighborId: neighbor.id, gap, wanted });
      }
    }
  }
  return { openings: out, reduced };
}

/**
 * Funde as zonas que se tocam ou se sobrepõem e posiciona os kings da parede.
 *
 * @param fit reduz os kings compartilhados ao que cabe (hipótese P39) em vez de lançar
 * @throws RangeError abertura inválida (ver `openingZone`) ou RO vizinhos sem espaço para
 *                    jacks + king compartilhado (inclui RO sobrepostos)
 */
export function mergeOpeningZones(
  openings: readonly Opening[],
  studThickness: number,
  opts: { fit?: boolean } = {},
): ZonePlan {
  const t = studThickness;
  const reducedKings: ReducedKings[] = [];
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  const zones: MergedZone[] = [];
  const kings: number[] = [];

  let prev: Opening | undefined;
  for (const cur of sorted) {
    const zone = openingZone(cur, t);
    const group = zones[zones.length - 1];

    if (prev === undefined || group === undefined || zone.start > group.end + EPS) {
      if (prev !== undefined) kings.push(...openingKingXs(prev, t).right);
      kings.push(...openingKingXs(cur, t).left);
      zones.push({ ...zone, openingIds: [cur.id] });
    } else {
      const a = openingStudCounts(prev);
      const b = openingStudCounts(cur);
      const wanted = Math.max(a.kings, b.kings);
      const prevEnd = prev.offset + prev.roughWidth;
      const gap = cur.offset - prevEnd;
      let shared = wanted;
      if (opts.fit === true) {
        const fits = Math.floor((gap + EPS) / t) - a.jacks - b.jacks;
        if (fits >= 1 && fits < wanted) {
          shared = fits;
          reducedKings.push({ prevId: prev.id, curId: cur.id, gap, wanted, used: shared });
        }
      }
      const needed = (a.jacks + shared + b.jacks) * t;
      if (gap < needed - EPS) {
        throw new RangeError(
          `aberturas ${prev.id} e ${cur.id}: ${gap}" entre os RO não comportam jacks e king ` +
            `compartilhado (mínimo ${needed}")` +
            (opts.fit === true
              ? `; nem 1 jack + 1 king + 1 jack (${3 * t}") cabe — confira a posição e o RO das duas`
              : ''),
        );
      }
      const first = prevEnd + a.jacks * t;
      for (let i = 0; i < shared; i++) kings.push(first + i * t);
      group.end = zone.end;
      group.openingIds.push(cur.id);
    }
    prev = cur;
  }
  if (prev !== undefined) kings.push(...openingKingXs(prev, t).right);

  return reducedKings.length === 0 ? { zones, kings } : { zones, kings, reducedKings };
}
