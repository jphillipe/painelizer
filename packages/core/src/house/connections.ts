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
 * - **Emenda em T** (S42, hipótese P54): uma ponta que chega onde duas paredes da **mesma linha** se emendam (três
 *   pontas num ponto — as duas da linha colineares, de lados opostos, com os corpos se tocando na espessura) não é
 *   erro: a linha é tratada como contínua. A que chega faz canto com uma das duas e **sempre encosta**; essa da linha
 *   **atravessa** o canto (o stud de canto dela recebe a que chega); a outra **continua** (`kind: 'continues'`): plate
 *   começando na face da que chega mais longe da que atravessa, onde a plate da que atravessa acaba, e livre para o
 *   motor. Quem atravessa: a da linha com `ends` "through" > a externa (a outra interna) > a mais grossa > a mais longa
 *   > a primeira do arquivo; a da linha com `ends` "butt" cede a vez; a que chega com `ends` "through", ou as duas da
 *   linha com "butt", é erro (`SPLIT_TEE_ENDS`).
 * - Fora disso, uma ponta com duas ligações (quatro pontas num ponto, canto e T no mesmo lugar) é erro.
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
    }
  | {
      /**
       * Emenda em T (S42, P54): esta ponta continua a parede `wallId`, da mesma linha, que atravessa o canto com
       * `cornerWallId`. A plate para `t_corner/2` antes do cruzamento (onde a de `wallId` acaba); para o motor é livre.
       */
      kind: 'continues';
      wallId: string;
      cornerWallId: string;
      /** Cruzamento do eixo desta parede com o de `cornerWallId`. */
      at: Point;
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
    throw new RangeError(`findConnections: tolerance must be ≥ 0 (got ${tolerance})`);
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

  // Ligações candidatas de cada ponta; resolvidas depois de ver todos os pares (a emenda em T precisa das três).
  const candidates = new Map<string, Candidate[]>();
  const offer = (i: number, end: WallEnd, c: Candidate): void => {
    const k = key(i, end);
    candidates.set(k, [...(candidates.get(k) ?? []), c]);
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
        offer(i, ha as WallEnd, { kind: 'corner', other: j, otherEnd: hb as WallEnd, at: x });
        offer(j, hb as WallEnd, { kind: 'corner', other: i, otherEnd: ha as WallEnd, at: x });
      } else if (aEnd && hb === 'inside') {
        offer(i, ha as WallEnd, { kind: 'tee', other: j, at: x });
        out[j]!.tees.push({ wallId: a.id, at: x });
      } else if (bEnd && ha === 'inside') {
        offer(j, hb as WallEnd, { kind: 'tee', other: i, at: x });
        out[i]!.tees.push({ wallId: b.id, at: x });
      } else if (ha === 'inside' && hb === 'inside') {
        throw new EngineError('WALLS_CROSS', { wallId: a.id, alsoWalls: [b.id] }, { otherWallId: b.id, x: x.x, y: x.y });
      }
      // Demais combinações: os eixos se cruzam fora de uma das paredes; não há ligação.
    }
  }
  resolveEnds(axes, candidates, out, tolerance);
  const byId = new Map(axes.map((a, i) => [a.id, i]));
  for (const [i, c] of out.entries()) c.tees = mergeCrossTees(axes[i]!, c.tees, axes, byId, out);
  return out;
}

/** Ligação candidata de uma ponta: canto com a ponta `otherEnd` de `other`, ou T no interior de `other`. */
type Candidate =
  | { kind: 'corner'; other: number; otherEnd: WallEnd; at: Point }
  | { kind: 'tee'; other: number; at: Point };

const key = (i: number, end: WallEnd): string => `${i}:${end}`;
const ENDS = ['start', 'end'] as const;

/**
 * Decide a ligação de cada ponta a partir das candidatas, na ordem do arquivo: uma só vira canto ou T; duas que formam
 * a emenda em T (S42, P54) viram canto + continuação; o resto é `WALL_END_TWO_JOINTS`. A ponta da linha que tem uma só
 * candidata (o canto com a que chega) espera a resolução da que chega.
 */
function resolveEnds(
  axes: readonly Axis[],
  candidates: ReadonlyMap<string, Candidate[]>,
  out: WallConnections[],
  tolerance: number,
): void {
  const done = new Set<string>();
  const listOf = (i: number, end: WallEnd): Candidate[] => candidates.get(key(i, end)) ?? [];
  for (let i = 0; i < axes.length; i++) {
    for (const end of ENDS) {
      if (done.has(key(i, end))) continue;
      const list = listOf(i, end);
      if (list.length === 0) continue;
      if (list.length > 1) {
        if (list.length === 2 && splitTee(axes, i, end, list, listOf, out, tolerance, done)) continue;
        const [first, second] = list.map((c) => axes[c.other]!.id);
        throw new EngineError(
          'WALL_END_TWO_JOINTS',
          { wallId: axes[i]!.id, alsoWalls: [first!, second!] },
          { end, first: first!, second: second! },
        );
      }
      const c = list[0]!;
      if (c.kind === 'tee') {
        out[i]![end] = { kind: 'tee', wallId: axes[c.other]!.id, at: c.at };
        done.add(key(i, end));
        continue;
      }
      // Canto: se a outra ponta tem mais de uma candidata, quem resolve (ou acusa o erro) é ela.
      if (listOf(c.other, c.otherEnd).length !== 1) continue;
      // `throughAt` com a primeira do arquivo como `a` (o desempate é dela).
      const [lo, loEnd, hi, hiEnd] = i < c.other ? [i, end, c.other, c.otherEnd] : [c.other, c.otherEnd, i, end];
      const through = throughAt(axes[lo]!, loEnd, axes[hi]!, hiEnd);
      out[lo]![loEnd] = { kind: 'corner', wallId: axes[hi]!.id, through, at: c.at };
      out[hi]![hiEnd] = { kind: 'corner', wallId: axes[lo]!.id, through: !through, at: c.at };
      done.add(key(lo, loEnd));
      done.add(key(hi, hiEnd));
    }
  }
}

/**
 * Emenda em T (S42, P54): a ponta `end` de `axes[s]` tem dois cantos, com duas paredes da mesma linha que se emendam
 * nesse ponto. Grava canto (a que chega encosta, a da linha escolhida atravessa) e a continuação da outra, e devolve
 * `true`; devolve `false` se não for esse o caso (o chamador acusa as duas ligações).
 *
 * @throws EngineError `SPLIT_TEE_ENDS` `ends` que contradiz a emenda
 */
function splitTee(
  axes: readonly Axis[],
  s: number,
  end: WallEnd,
  list: readonly Candidate[],
  listOf: (i: number, end: WallEnd) => Candidate[],
  out: WallConnections[],
  tolerance: number,
  done: Set<string>,
): boolean {
  const [c1, c2] = list;
  if (c1?.kind !== 'corner' || c2?.kind !== 'corner') return false;
  const p = axes[c1.other]!;
  const q = axes[c2.other]!;
  // As duas da linha: cada uma só com este canto na ponta, corpos que se tocam na espessura, de lados opostos do ponto.
  if (listOf(c1.other, c1.otherEnd).length !== 1 || listOf(c2.other, c2.otherEnd).length !== 1) return false;
  if (p.dir !== q.dir || Math.abs(across(p, q.start)) >= (p.thickness + q.thickness) / 2 - tolerance - EPS) return false;
  // Lado de cada uma: para onde vai a outra ponta, medido no eixo de `p` (os dois eixos são paralelos).
  const side = (a: Axis, e: WallEnd, at: Point): number => Math.sign(along(p, e === 'start' ? a.end : a.start) - along(p, at));
  const sideP = side(p, c1.otherEnd, c1.at);
  const sideQ = side(q, c2.otherEnd, c2.at);
  if (sideP === 0 || sideQ === 0 || sideP === sideQ) return false;

  const stem = axes[s]!;
  const rule = (a: Axis, e: WallEnd): EndRule | undefined => a.wall.ends?.[e];
  const line = [
    { i: c1.other, end: c1.otherEnd, at: c1.at },
    { i: c2.other, end: c2.otherEnd, at: c2.at },
  ];
  const ids = { end, first: p.id, second: q.id };
  if (rule(stem, end) === 'through') {
    throw new EngineError('SPLIT_TEE_ENDS', { wallId: stem.id, alsoWalls: [p.id, q.id] }, { ...ids, reason: 'stem' });
  }
  const open = line.filter((l) => rule(axes[l.i]!, l.end) !== 'butt');
  if (open.length === 0) {
    throw new EngineError('SPLIT_TEE_ENDS', { wallId: stem.id, alsoWalls: [p.id, q.id] }, { ...ids, reason: 'line' });
  }
  const rank = (l: (typeof line)[number]): number[] => {
    const a = axes[l.i]!;
    return [rule(a, l.end) === 'through' ? 1 : 0, a.wall.exterior ? 1 : 0, a.thickness, a.length, -l.i];
  };
  const cross = [...open].sort((x, y) => compareDesc(rank(x), rank(y)))[0]!;
  const rest = line.find((l) => l !== cross)!;
  const crossId = axes[cross.i]!.id;
  out[s]![end] = { kind: 'corner', wallId: crossId, through: false, at: cross.at };
  out[cross.i]![cross.end] = { kind: 'corner', wallId: stem.id, through: true, at: cross.at };
  out[rest.i]![rest.end] = { kind: 'continues', wallId: crossId, cornerWallId: stem.id, at: rest.at };
  for (const k of [key(s, end), key(cross.i, cross.end), key(rest.i, rest.end)]) done.add(k);
  return true;
}

/** Ordem decrescente, critério a critério. */
function compareDesc(a: readonly number[], b: readonly number[]): number {
  for (let k = 0; k < a.length; k++) {
    const d = (b[k] ?? 0) - (a[k] ?? 0);
    if (Math.abs(d) > EPS) return d;
  }
  return 0;
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
