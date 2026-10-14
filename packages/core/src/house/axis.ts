/**
 * Geometria de uma parede em planta: eixo paralelo a x ou a y, posição ao longo dele e cruzamentos.
 * Interno a `src/house`; nada aqui sabe de studs.
 */

import { sectionDepth } from '../types';
import type { HouseWall, Point } from './types';

/** Parede reduzida ao seu eixo: direção, comprimento entre os pontos e espessura real. */
export interface Axis {
  id: string;
  wall: HouseWall;
  /** Eixo da planta ao qual a parede é paralela. */
  dir: 'x' | 'y';
  /** +1 quando `end` tem coordenada maior que `start` nesse eixo. */
  sign: 1 | -1;
  start: Point;
  end: Point;
  /** Distância entre `start` e `end`. */
  length: number;
  /** Espessura real da parede (3.5 / 5.5). */
  thickness: number;
}

const EPS = 1e-9;

/**
 * @throws RangeError coordenada não finita, parede de comprimento zero ou fora dos eixos (diagonal)
 */
export function axisOf(wall: HouseWall): Axis {
  const { start, end } = wall;
  for (const [name, p] of [['start', start], ['end', end]] as const) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new RangeError(`parede ${wall.id}: ${name} deve ter x e y finitos (recebido ${p.x}, ${p.y})`);
    }
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) {
    throw new RangeError(`parede ${wall.id}: start e end coincidem (${start.x}, ${start.y})`);
  }
  if (Math.abs(dx) >= EPS && Math.abs(dy) >= EPS) {
    throw new RangeError(
      `parede ${wall.id}: fora dos eixos da planta (de ${start.x}, ${start.y} a ${end.x}, ${end.y}) — ` +
        'só paredes paralelas a x ou a y',
    );
  }
  const dir = Math.abs(dx) >= EPS ? 'x' : 'y';
  const delta = dir === 'x' ? dx : dy;
  return {
    id: wall.id,
    wall,
    dir,
    sign: delta > 0 ? 1 : -1,
    start,
    end,
    length: Math.abs(delta),
    thickness: sectionDepth(wall.section),
  };
}

/** Posição de `p` ao longo do eixo, medida de `start` no sentido de `end` (negativa antes do start). */
export function along(a: Axis, p: Point): number {
  const s = a.dir === 'x' ? (p.x - a.start.x) * a.sign : (p.y - a.start.y) * a.sign;
  return s || 0; // nunca −0
}

/** Distância de `p` à reta do eixo. */
export function across(a: Axis, p: Point): number {
  return a.dir === 'x' ? Math.abs(p.y - a.start.y) : Math.abs(p.x - a.start.x);
}

/** Ponto do eixo à posição `s` de `start`. */
export function pointAt(a: Axis, s: number): Point {
  return a.dir === 'x' ? { x: a.start.x + a.sign * s, y: a.start.y } : { x: a.start.x, y: a.start.y + a.sign * s };
}

/** Cruzamento das retas de dois eixos perpendiculares. */
export function crossing(a: Axis, b: Axis): Point {
  if (a.dir === b.dir) throw new RangeError(`paredes ${a.id} e ${b.id} são paralelas; não se cruzam`);
  return a.dir === 'x' ? { x: b.start.x, y: a.start.y } : { x: a.start.x, y: b.start.y };
}
