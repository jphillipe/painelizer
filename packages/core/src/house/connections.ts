/**
 * Ligações entre paredes em planta: canto, T ou ponta livre (S13, hipótese P21).
 *
 * Regras (docs/02-framing.md):
 * - Tudo é decidido no **cruzamento dos eixos** de duas paredes perpendiculares, nunca no ponto digitado:
 *   o arquiteto pode ter cotado a ponta na face da outra parede em vez de no eixo. A ponta "está" num
 *   cruzamento quando dista dele no máximo `t_outra/2 + tolerance` ao longo do próprio eixo.
 * - `corner`: ponta de uma no cruzamento e ponta da outra também. `tee`: ponta de uma no cruzamento e o
 *   cruzamento no interior da outra (além da faixa de ponta). Cruzamento no interior das duas: as paredes
 *   se cruzam — erro. Nada em nenhuma ponta: `free`.
 * - Paredes paralelas cujos corpos se sobrepõem (eixos a menos de `(t_a + t_b)/2` e trechos que se
 *   sobrepõem) são erro: é a mesma parede escrita duas vezes. Colineares ponta a ponta são duas paredes livres.
 * - Uma ponta com duas ligações (três pontas num ponto, canto e T no mesmo lugar) é erro.
 * - **Cruzamento em +** (S31, hipótese P46): dois T na mesma parede, chegando por lados opostos com faixas que se
 *   sobrepõem (do mesmo lado seriam corpos sobrepostos, `WALLS_OVERLAP`), viram um T só com `sides: 2`, faixa =
 *   união das duas (`at` no centro, `width`), e as duas pontas que encostam ganham `cross: true`. Uma parede que
 *   atravessa outra pelo interior das duas continua `WALLS_CROSS`: o + exige partir uma delas no cruzamento.
 * - No canto, quem atravessa: `ends` declarado em qualquer das duas (as duas iguais é erro) > a mais longa
 *   (entre os pontos) > a primeira do arquivo.
 */

import type { EndRule, HouseWall, Point, WallEnd } from './types';
import { across, along, axisOf, crossing, pointAt, type Axis } from './axis';
import { EngineError } from '../messages';
import { EPS } from '../eps';

/** Folga, em polegadas, para a ponta digitada "estar" no cruzamento dos eixos. */
export const DEFAULT_TOLERANCE = 0.5;


export type Connection =
  | { kind: 'free' }
  | {
      kind: 'corner';
      /** A outra parede do canto. */
      wallId: string;
      /** Esta parede atravessa (plate até a face externa da outra) ou encosta. */
      through: boolean;
      /** Cruzamento dos eixos, em planta. */
      at: Point;
    }
  | {
      kind: 'tee';
      /** Parede em cujo interior esta ponta encosta. */
      wallId: string;
      at: Point;
      /** Outra parede encosta no mesmo ponto pelo lado oposto (cruzamento em +, S31). */
      cross?: true;
    };

/** Parede que encosta em T no interior desta. */
export interface TeeOn {
  wallId: string;
  /** Cruzamento dos eixos, em planta (no + , o centro da faixa unida). */
  at: Point;
  /** Cruzamento em + (S31, P46): duas paredes encostam aqui, uma de cada lado. */
  sides?: 2;
  /** No +, a parede do outro lado. */
  otherWallId?: string;
  /** No +, largura da faixa unida (sem o +, é a espessura de `wallId`). */
  width?: number;
}

export interface WallConnections {
  wallId: string;
  start: Connection;
  end: Connection;
  /** Paredes que encostam em T nesta, na ordem em que aparecem no arquivo. */
  tees: TeeOn[];
}

/** Onde um cruzamento cai em relação a um eixo. */
type Hit = WallEnd | 'inside' | 'outside';

function hit(a: Axis, s: number, slack: number): Hit {
  const atStart = Math.abs(s) <= slack + EPS;
  const atEnd = Math.abs(s - a.length) <= slack + EPS;
  if (atStart && atEnd) return Math.abs(s) <= Math.abs(s - a.length) ? 'start' : 'end';
  if (atStart) return 'start';
  if (atEnd) return 'end';
  if (s > slack && s < a.length - slack) return 'inside';
  return 'outside';
}

/**
 * Ligações de cada ponta de cada parede, na ordem do arquivo.
 *
 * @param tolerance folga além de `t_outra/2` para a ponta estar no cruzamento (default 0.5")
 * @throws RangeError ids duplicados, parede fora dos eixos ou de comprimento zero, paredes que se cruzam
 *                    ou se sobrepõem, ponta com mais de uma ligação, `ends` em conflito
 */
export function findConnections(
  walls: readonly HouseWall[],
  tolerance: number = DEFAULT_TOLERANCE,
): WallConnections[] {
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError(`findConnections: tolerance deve ser ≥ 0 (recebido ${tolerance})`);
  }
  const axes = walls.map(axisOf);
  const seen = new Set<string>();
  for (const a of axes) {
    if (seen.has(a.id)) throw new EngineError('WALL_DUPLICATE_ID', { wallId: a.id });
    seen.add(a.id);
  }

  const out: WallConnections[] = axes.map((a) => ({
    wallId: a.id,
    start: { kind: 'free' },
    end: { kind: 'free' },
    tees: [],
  }));

  const attach = (i: number, end: WallEnd, conn: Connection): void => {
    const cur = out[i]![end];
    if (cur.kind !== 'free') {
      const other = conn.kind === 'free' ? '?' : conn.wallId;
      const prev = cur.wallId;
      throw new EngineError(
        'WALL_END_TWO_JOINTS',
        { wallId: axes[i]!.id, alsoWalls: [prev, other].filter((w) => w !== '?') },
        { end, first: prev, second: other },
      );
    }
    out[i]![end] = conn;
  };

  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) {
      const a = axes[i]!;
      const b = axes[j]!;
      if (a.dir === b.dir) {
        checkParallel(a, b, tolerance);
        continue;
      }
      const x = crossing(a, b);
      const sa = along(a, x);
      const sb = along(b, x);
      const ha = hit(a, sa, b.thickness / 2 + tolerance);
      const hb = hit(b, sb, a.thickness / 2 + tolerance);
      const aEnd = ha === 'start' || ha === 'end';
      const bEnd = hb === 'start' || hb === 'end';

      if (aEnd && bEnd) {
        const through = throughAt(a, ha as WallEnd, b, hb as WallEnd);
        attach(i, ha as WallEnd, { kind: 'corner', wallId: b.id, through, at: x });
        attach(j, hb as WallEnd, { kind: 'corner', wallId: a.id, through: !through, at: x });
      } else if (aEnd && hb === 'inside') {
        attach(i, ha as WallEnd, { kind: 'tee', wallId: b.id, at: x });
        out[j]!.tees.push({ wallId: a.id, at: x });
      } else if (bEnd && ha === 'inside') {
        attach(j, hb as WallEnd, { kind: 'tee', wallId: a.id, at: x });
        out[i]!.tees.push({ wallId: b.id, at: x });
      } else if (ha === 'inside' && hb === 'inside') {
        throw new EngineError('WALLS_CROSS', { wallId: a.id, alsoWalls: [b.id] }, { otherWallId: b.id, x: x.x, y: x.y });
      }
      // Demais combinações: os eixos se cruzam fora de uma das paredes; não há ligação.
    }
  }
  const byId = new Map(axes.map((a, i) => [a.id, i]));
  for (const [i, c] of out.entries()) c.tees = mergeCrossTees(axes[i]!, c.tees, axes, byId, out);
  return out;
}

/**
 * Funde os T de lados opostos cujas faixas se sobrepõem num T de dois lados (S31, P46) e marca `cross` nas pontas
 * que encostam. Ordem: a do arquivo, com o T fundido no lugar do primeiro.
 */
function mergeCrossTees(
  a: Axis,
  tees: TeeOn[],
  axes: readonly Axis[],
  byId: ReadonlyMap<string, number>,
  out: WallConnections[],
): TeeOn[] {
  if (tees.length < 2) return tees;
  const stripOf = (t: TeeOn): { lo: number; hi: number } => {
    const s = along(a, t.at);
    const half = axes[byId.get(t.wallId)!]!.thickness / 2;
    return { lo: s - half, hi: s + half };
  };
  const merged: TeeOn[] = [];
  const used = new Set<number>();
  for (let i = 0; i < tees.length; i++) {
    if (used.has(i)) continue;
    const ti = tees[i]!;
    const si = stripOf(ti);
    const j = tees.findIndex((tj, k) => k > i && !used.has(k) && overlapsStrip(si, stripOf(tj)));
    if (j < 0) {
      merged.push(ti);
      continue;
    }
    used.add(j);
    const tj = tees[j]!;
    const sj = stripOf(tj);
    const lo = Math.min(si.lo, sj.lo);
    const hi = Math.max(si.hi, sj.hi);
    merged.push({ wallId: ti.wallId, at: pointAt(a, (lo + hi) / 2), sides: 2, otherWallId: tj.wallId, width: hi - lo });
    for (const w of [ti.wallId, tj.wallId]) markCross(out[byId.get(w)!]!, a.id);
  }
  return merged;
}

function overlapsStrip(p: { lo: number; hi: number }, q: { lo: number; hi: number }): boolean {
  return p.lo < q.hi - EPS && p.hi > q.lo + EPS;
}

/** Marca `cross` na ponta desta parede que encosta em T em `throughId`. */
function markCross(c: WallConnections, throughId: string): void {
  for (const end of ['start', 'end'] as const) {
    const e = c[end];
    if (e.kind === 'tee' && e.wallId === throughId) c[end] = { ...e, cross: true };
  }
}

/** Paredes paralelas: erro se os corpos se sobrepõem. Colineares que só se encostam ponta a ponta são
 * duas paredes livres em sequência (a planta pode partir uma parede onde a seção muda). */
function checkParallel(a: Axis, b: Axis, tolerance: number): void {
  const gapAcross = across(a, b.start);
  if (gapAcross >= (a.thickness + b.thickness) / 2 - tolerance - EPS) return;
  const a0 = 0;
  const a1 = a.length;
  const b0 = Math.min(along(a, b.start), along(a, b.end));
  const b1 = Math.max(along(a, b.start), along(a, b.end));
  const overlap = Math.min(a1, b1) - Math.max(a0, b0);
  if (overlap > tolerance + EPS) {
    throw new EngineError('WALLS_OVERLAP', { wallId: a.id, alsoWalls: [b.id] }, { otherWallId: b.id, overlap });
  }
}

/** `a` atravessa o canto? `ends` declarado > a mais longa > a primeira do arquivo (`a`). */
function throughAt(a: Axis, aEnd: WallEnd, b: Axis, bEnd: WallEnd): boolean {
  const ra: EndRule | undefined = a.wall.ends?.[aEnd];
  const rb: EndRule | undefined = b.wall.ends?.[bEnd];
  if (ra !== undefined && rb !== undefined && ra === rb) {
    throw new EngineError('CORNER_ENDS_CONFLICT', { wallId: a.id, alsoWalls: [b.id] }, { end: aEnd, otherWallId: b.id, otherEnd: bEnd, rule: ra });
  }
  if (ra !== undefined) return ra === 'through';
  if (rb !== undefined) return rb === 'butt';
  return a.length >= b.length - EPS;
}
