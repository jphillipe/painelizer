/**
 * "Draw wall" por dois cliques (S30): onde o ponteiro cai depois do snap. Com a primeira ponta dada (`anchor`), a
 * parede sai ortogonal (o eixo dominante manda) e a coordenada livre gruda na ponta ou no eixo de uma parede vizinha
 * a menos de `tolerance` polegadas; sem âncora, gruda primeiro numa ponta, senão em x/y de pontas e eixos. O que não
 * gruda vai ao 1". Puro: o canvas converte a tolerância de px para polegadas e desenha a guia (`ref`).
 */

import type { Point } from './draft';
import { snap } from './viewport';

export interface SnapWall {
  start: Point;
  end: Point;
}

export interface DrawSnap {
  point: Point;
  /** `end` = numa ponta de parede; `axis` = alinhado a ponta ou eixo; `grid` = só o 1". */
  kind: 'end' | 'axis' | 'grid';
  /** Ponto de referência do alinhamento (para a guia tracejada), quando `axis`. */
  ref?: Point;
}

/** Grade do desenho: 1". */
export const DRAW_STEP = 1;

export function snapDrawPoint(p: Point, walls: readonly SnapWall[], tolerance: number, anchor?: Point): DrawSnap {
  const ends = walls.flatMap((w) => [w.start, w.end]);
  if (anchor !== undefined) {
    const horizontal = Math.abs(p.x - anchor.x) >= Math.abs(p.y - anchor.y);
    const free = horizontal ? 'x' : 'y';
    const hit = nearestLine(p[free], lines(walls, free), tolerance, p);
    const value = hit === undefined ? snap(p[free], DRAW_STEP) : hit.value;
    const point = horizontal ? { x: value, y: anchor.y } : { x: anchor.x, y: value };
    if (ends.some((e) => e.x === point.x && e.y === point.y)) return { point, kind: 'end' };
    return hit === undefined ? { point, kind: 'grid' } : { point, kind: 'axis', ref: hit.ref };
  }
  let best: Point | undefined;
  let bestDist = tolerance;
  for (const e of ends) {
    const dist = Math.hypot(e.x - p.x, e.y - p.y);
    if (dist <= bestDist) {
      best = e;
      bestDist = dist;
    }
  }
  if (best !== undefined) return { point: best, kind: 'end' };
  const hx = nearestLine(p.x, lines(walls, 'x'), tolerance, p);
  const hy = nearestLine(p.y, lines(walls, 'y'), tolerance, p);
  const point = { x: hx?.value ?? snap(p.x, DRAW_STEP), y: hy?.value ?? snap(p.y, DRAW_STEP) };
  const ref = hx?.ref ?? hy?.ref;
  return ref === undefined ? { point, kind: 'grid' } : { point, kind: 'axis', ref };
}

/**
 * Linhas a que a coordenada `c` gruda: a coordenada de cada ponta — que, com paredes paralelas aos eixos, já é o
 * eixo das paredes perpendiculares (para `x`: as verticais) — com a ponta como referência da guia.
 */
function lines(walls: readonly SnapWall[], c: 'x' | 'y'): { value: number; ref: Point }[] {
  const out: { value: number; ref: Point }[] = [];
  for (const w of walls) {
    out.push({ value: w.start[c], ref: w.start }, { value: w.end[c], ref: w.end });
  }
  return out;
}

/** Linha mais perto de `v`; no empate (pontas na mesma linha), a referência mais perto do ponteiro — a guia fica curta. */
function nearestLine(
  v: number,
  candidates: readonly { value: number; ref: Point }[],
  tolerance: number,
  p: Point,
): { value: number; ref: Point } | undefined {
  let best: { value: number; ref: Point } | undefined;
  let bestDist = tolerance;
  for (const c of candidates) {
    const dist = Math.abs(c.value - v);
    if (
      dist < bestDist ||
      (dist === bestDist &&
        (best === undefined ||
          Math.hypot(c.ref.x - p.x, c.ref.y - p.y) < Math.hypot(best.ref.x - p.x, best.ref.y - p.y)))
    ) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}
