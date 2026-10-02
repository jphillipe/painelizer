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
 * - Aberturas isoladas ficam com os próprios kings (`openingKingXs`).
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
}

/**
 * Funde as zonas que se tocam ou se sobrepõem e posiciona os kings da parede.
 *
 * @throws RangeError abertura inválida (ver `openingZone`) ou RO vizinhos sem espaço para
 *                    jacks + king compartilhado (inclui RO sobrepostos)
 */
export function mergeOpeningZones(openings: readonly Opening[], studThickness: number): ZonePlan {
  const t = studThickness;
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
      const shared = Math.max(a.kings, b.kings);
      const prevEnd = prev.offset + prev.roughWidth;
      const gap = cur.offset - prevEnd;
      const needed = (a.jacks + shared + b.jacks) * t;
      if (gap < needed - EPS) {
        throw new RangeError(
          `aberturas ${prev.id} e ${cur.id}: ${gap}" entre os RO não comportam jacks e king ` +
            `compartilhado (mínimo ${needed}")`,
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

  return { zones, kings };
}
