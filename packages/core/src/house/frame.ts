/**
 * Da planta à parede do motor: comprimento de plate, offsets convertidos e origem de layout (S13).
 *
 * Regras (docs/02-framing.md, docs/04-decisoes.md 2026-10-13; hipótese P21):
 * - A plate é medida do **cruzamento dos eixos**, nunca do ponto digitado. Na ponta que atravessa um canto,
 *   avança `t_outra/2` além do cruzamento (até a face externa da outra parede); na que encosta (canto ou T),
 *   para `t_outra/2` antes (na face da outra). Ponta livre: a plate acaba no ponto.
 * - x do painel: 0 no início da plate, crescendo de `start` para `end`. Offset de abertura, x de stud extra
 *   e cruzamento de T são medidos do ponto `start` ao longo do eixo e convertidos subtraindo o deslocamento
 *   da plate (`plateStart` em relação a `start`).
 * - `layoutOrigin` = `−t_outra` quando `start` encosta num canto (a marca 0 é a quina do prédio, antes da
 *   plate), 0 nos demais casos (atravessa, T, livre). Primeiro stud sempre em 0.
 * - RO que não cabe na plate é erro (abertura sobre o canto); stud extra fora da plate é erro do motor
 *   (`panelizeWall`).
 */

import type { ExtraStud, Opening, Wall } from '../types';
import { along, axisOf, pointAt, type Axis } from './axis';
import { DEFAULT_TOLERANCE, findConnections, type Connection, type WallConnections } from './connections';
import type { House, HouseWall, Point } from './types';

const EPS = 1e-9;

/** Parede que encosta em T nesta, em x do painel. */
export interface TeeAt {
  /** x do eixo da parede que encosta, no painel desta. */
  x: number;
  wallId: string;
  /** Espessura real da parede que encosta; ela ocupa `[x − width/2, x + width/2]`. */
  width: number;
}

export interface FrameConnections {
  start: Connection;
  end: Connection;
  tees: TeeAt[];
}

/** Uma parede da casa pronta para o motor. */
export interface WallFrame {
  wallId: string;
  /** Pontos da plate em planta (x=0 do painel é `plateStart`). */
  plateStart: Point;
  plateEnd: Point;
  /** `Wall` derivada: `length` = plate, offsets em x do painel, `layoutOrigin` já definido. */
  wall: Wall;
  layoutOrigin: number;
  connections: FrameConnections;
}

/**
 * Deriva a `Wall` de cada parede da casa, na ordem do arquivo.
 *
 * @param tolerance folga de `findConnections`
 * @throws RangeError os de `findConnections`; plate sem comprimento; RO fora da plate
 */
export function frameWalls(house: House, tolerance: number = DEFAULT_TOLERANCE): WallFrame[] {
  const connections = findConnections(house.walls, tolerance);
  const axes = new Map<string, Axis>();
  for (const w of house.walls) axes.set(w.id, axisOf(w));
  return house.walls.map((w, i) => frameWall(axes.get(w.id)!, connections[i]!, axes));
}

function frameWall(axis: Axis, conns: WallConnections, axes: ReadonlyMap<string, Axis>): WallFrame {
  const { wall } = axis;
  const otherThickness = (c: Connection): number =>
    c.kind === 'free' ? 0 : axes.get(c.wallId)!.thickness;

  const s0 = plateOffset(axis, conns.start, 'start', otherThickness(conns.start));
  const s1 = plateOffset(axis, conns.end, 'end', otherThickness(conns.end));
  const length = s1 - s0;
  if (length <= EPS) {
    throw new RangeError(
      `parede ${wall.id}: plate sem comprimento (${length}") — as paredes das pontas ocupam tudo`,
    );
  }

  const openings: Opening[] = wall.openings.map((o) => {
    const offset = o.offset - s0;
    if (offset < -EPS || offset + o.roughWidth > length + EPS) {
      throw new RangeError(
        `parede ${wall.id}, abertura ${o.id}: RO de ${o.offset}" a ${o.offset + o.roughWidth}" do start ` +
          `não cabe na plate (de ${s0}" a ${s1}" do start)`,
      );
    }
    return { ...o, offset };
  });

  const layoutOrigin =
    conns.start.kind === 'corner' && !conns.start.through ? -otherThickness(conns.start) : 0;

  // `start`, `end`, `level` e `ends` são da planta; o resto é `Wall`.
  const { start, end, level, ends, ...rest } = wall;
  const derived: Wall = { ...rest, length, openings, layoutOrigin };
  if (wall.extraStuds !== undefined) {
    derived.extraStuds = wall.extraStuds.map((e): ExtraStud => ({ ...e, x: e.x - s0 }));
  }

  const tees: TeeAt[] = conns.tees.map((t) => ({
    x: along(axis, t.at) - s0,
    wallId: t.wallId,
    width: axes.get(t.wallId)!.thickness,
  }));

  return {
    wallId: wall.id,
    plateStart: pointAt(axis, s0),
    plateEnd: pointAt(axis, s1),
    wall: derived,
    layoutOrigin,
    connections: { start: conns.start, end: conns.end, tees },
  };
}

/** Posição, ao longo do eixo a partir de `start`, onde a plate começa (`start`) ou termina (`end`). */
function plateOffset(axis: Axis, c: Connection, end: 'start' | 'end', tOther: number): number {
  if (c.kind === 'free') return end === 'start' ? 0 : axis.length;
  const s = along(axis, c.at);
  const half = tOther / 2;
  const through = c.kind === 'corner' && c.through;
  // Atravessa: avança além do cruzamento (antes do start / depois do end). Encosta: fica aquém.
  if (end === 'start') return through ? s - half : s + half;
  return through ? s + half : s - half;
}
