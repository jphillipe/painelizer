/**
 * Peças de canto e de T e laps da double top plate (S14), a partir de `Wall.joints`.
 *
 * Regras (docs/02-framing.md; P5 respondida, P22 hipótese):
 * - **Canto** (`config.corner`, default `'california'`): só a parede que **atravessa** ganha peça. California:
 *   um stud `flat: true` (face larga para dentro da parede; ocupa `sectionDepth` em x e 1.5" na espessura)
 *   colado ao stud de ponta pelo lado de dentro do canto — x = t no início, `length − t − sectionDepth` no
 *   fim. `'three-stud'`: um stud comum em pé no mesmo lugar (x = t ou `length − 2t`). A parede que encosta
 *   não ganha peça: seu stud de ponta já é o do canto.
 * - **T** (`config.tee`, default `'ladder'`): na parede atravessada, a parede que encosta ocupa a faixa
 *   `[x − w/2, x + w/2]`. Ladder: blocos `role: 'block'` da seção da parede, deitados (1.5" de altura), do
 *   stud vizinho à esquerda da faixa ao vizinho à direita, com centros em 24, 48, 72… do subfloor enquanto o
 *   topo do bloco não passar da base da top plate (3 blocos em 8', 4 em 9' — hipótese P22). Stud de altura
 *   inteira que cai dentro da faixa fica e divide o bloco; pedaço menor que 1.5" sai. `'backer'`: dois studs
 *   de altura inteira colados às faces da faixa (x = lo − t e x = hi).
 * - Faixa do T dentro do RO de uma abertura é erro (não há onde pregar a parede); na zona (kings/jacks) gera
 *   o aviso `OPENING_AT_TEE` e **nenhuma** peça de T — kings/jacks e blocos disputam o lugar.
 * - **Laps da double top plate** (R602.3.2): no canto, a double top de quem **encosta** avança `t_outra` sobre
 *   a top plate da outra (x negativo no início) e a de quem **atravessa** recua `t_outra`; no T, a de quem
 *   encosta avança `t_outra` e a da atravessada é cortada na faixa. Fica como `PlateOptions` para
 *   `layoutPlates`.
 */

import {
  sectionDepth,
  verticalWidth,
  type Config,
  type Member,
  type Opening,
  type TeeJoint,
  type Wall,
  type WallJoints,
  type Warning,
} from '../types';
import type { PlateOptions } from './plates';
import type { MergedZone } from './zones';

const EPS = 1e-9;

/** Espaçamento vertical entre centros dos blocos do ladder (hipótese P22). */
export const LADDER_BLOCK_SPACING = 24;

/** Pedaço de bloco mais curto que isto não é cortado. */
export const MIN_BLOCK_LENGTH = 1.5;

/** Stud de canto ou de encosto a acrescentar: borda esquerda e se vai deitado. */
export interface JointStud {
  x: number;
  flat: boolean;
}

/** Faixa `[lo, hi]` ocupada por uma parede que encosta em T, em x do painel. */
export interface TeeStrip {
  lo: number;
  hi: number;
  wallId?: string;
}

export function teeStrips(joints: WallJoints | undefined): TeeStrip[] {
  return (joints?.tees ?? []).map((t: TeeJoint) => ({
    lo: t.x - t.width / 2,
    hi: t.x + t.width / 2,
    ...(t.wallId === undefined ? {} : { wallId: t.wallId }),
  }));
}

/** Laps e cortes da double top plate a partir das ligações da parede. */
export function plateOptionsFor(joints: WallJoints | undefined): PlateOptions {
  if (joints === undefined) return {};
  const opts: PlateOptions = {};
  for (const end of ['start', 'end'] as const) {
    const j = joints[end];
    if (j === undefined) continue;
    // Quem atravessa o canto recua; quem encosta (canto ou T) avança sobre a top plate da outra.
    opts[end] = j.kind === 'corner' && j.through ? { recess: j.otherThickness } : { extend: j.otherThickness };
  }
  const cuts = (joints.tees ?? []).map((t) => ({ x: t.x - t.width / 2, width: t.width }));
  if (cuts.length > 0) opts.cuts = cuts;
  return opts;
}

/**
 * Studs de canto desta parede (só nas pontas em que ela atravessa), na ordem início, fim.
 *
 * @throws RangeError stud de canto que não cabe na plate
 */
export function cornerStuds(wall: Wall, config: Config): JointStud[] {
  const joints = wall.joints;
  if (joints === undefined) return [];
  const t = config.studThickness;
  const flat = (config.corner ?? 'california') === 'california';
  const width = flat ? sectionDepth(wall.section) : t;
  const out: JointStud[] = [];
  if (joints.start?.kind === 'corner' && joints.start.through) out.push({ x: t, flat });
  if (joints.end?.kind === 'corner' && joints.end.through) out.push({ x: wall.length - t - width, flat });
  for (const s of out) {
    if (s.x < -EPS || s.x + width > wall.length + EPS) {
      throw new RangeError(`parede ${wall.id}: stud de canto em x=${s.x} não cabe na plate de ${wall.length}"`);
    }
  }
  return out;
}

/**
 * Studs de encosto (`config.tee: 'backer'`) para as faixas de T dadas: um colado a cada face da faixa.
 */
export function backerStuds(strips: readonly TeeStrip[], config: Config): JointStud[] {
  if ((config.tee ?? 'ladder') !== 'backer') return [];
  const t = config.studThickness;
  return strips.flatMap((s) => [
    { x: s.lo - t, flat: false },
    { x: s.hi, flat: false },
  ]);
}

/**
 * Faixas de T que conflitam com as aberturas da parede: dentro do RO é erro; na zona (kings/jacks) devolve o
 * aviso `OPENING_AT_TEE` e a faixa fica fora das peças de T.
 *
 * @param openings aberturas com `jackStuds`/`kingStuds` resolvidos (as do `planOpenings`)
 * @returns faixas sem conflito e os avisos das que caíram em zona
 * @throws RangeError faixa dentro do RO
 */
export function teeConflicts(
  wall: Wall,
  strips: readonly TeeStrip[],
  openings: readonly Opening[],
  zones: readonly MergedZone[],
): { clear: TeeStrip[]; warnings: Warning[] } {
  const clear: TeeStrip[] = [];
  const warnings: Warning[] = [];
  for (const s of strips) {
    const x = (s.lo + s.hi) / 2;
    const who = s.wallId ?? '?';
    for (const o of openings) {
      if (s.lo < o.offset + o.roughWidth - EPS && s.hi > o.offset + EPS) {
        throw new RangeError(
          `parede ${wall.id}, abertura ${o.id}: a parede ${who} encosta em T em x=${x} ` +
            `(faixa ${s.lo}–${s.hi}), dentro do RO [${o.offset}, ${o.offset + o.roughWidth}]`,
        );
      }
    }
    let conflict = false;
    for (const z of zones) {
      if (s.lo < z.end - EPS && s.hi > z.start + EPS) {
        conflict = true;
        warnings.push({
          code: 'OPENING_AT_TEE',
          message:
            `parede ${wall.id}: a parede ${who} encosta em T em x=${x} (faixa ${s.lo}–${s.hi}), ` +
            `na zona da(s) abertura(s) ${z.openingIds.join(', ')} [${z.start}, ${z.end}] — ` +
            'kings/jacks e o ladder blocking disputam o lugar; afaste a abertura ou a parede',
        });
      }
    }
    if (!conflict) clear.push(s);
  }
  return { clear, warnings };
}

/** Centros dos blocos do ladder: 24, 48, 72… enquanto o topo do bloco não passa da base da top plate. */
export function ladderBlockCenters(height: number, plateThickness: number, blockThickness: number): number[] {
  const topPlateBottom = height - 2 * plateThickness;
  const out: number[] = [];
  for (let c = LADDER_BLOCK_SPACING; c + blockThickness / 2 <= topPlateBottom + EPS; c += LADDER_BLOCK_SPACING) {
    if (c - blockThickness / 2 < plateThickness - EPS) continue;
    out.push(c);
  }
  return out;
}

/**
 * Blocos do ladder blocking (`config.tee: 'ladder'`) de uma parede, para as faixas de T sem conflito.
 *
 * @param verticals peças de altura inteira já definidas (studs de layout, extras, kings, studs de canto):
 *                  delimitam os blocos e, dentro da faixa, os dividem
 */
export function ladderBlocks(wall: Wall, strips: readonly TeeStrip[], verticals: readonly Member[], config: Config): Member[] {
  if ((config.tee ?? 'ladder') !== 'ladder' || strips.length === 0) return [];
  const t = config.studThickness;
  const centers = ladderBlockCenters(wall.height, config.plateThickness, t);
  const spans = verticals
    .map((m) => ({ lo: m.x, hi: m.x + verticalWidth(m) }))
    .sort((a, b) => a.lo - b.lo);

  const out: Member[] = [];
  for (const s of strips) {
    const left = spans.filter((v) => v.hi <= s.lo + EPS).at(-1);
    const right = spans.find((v) => v.lo >= s.hi - EPS);
    if (left === undefined || right === undefined) {
      throw new RangeError(
        `parede ${wall.id}: faixa do T ${s.lo}–${s.hi} sem stud vizinho de um dos lados — não há onde apoiar o ladder`,
      );
    }
    // Studs dentro da faixa (ou sobre as faces) dividem o bloco.
    const splitters = spans.filter((v) => v.lo < s.hi - EPS && v.hi > s.lo + EPS && v.lo > left.lo + EPS && v.lo < right.lo - EPS);
    let cursor = left.hi;
    const gaps: { x: number; length: number }[] = [];
    for (const v of splitters) {
      if (v.lo - cursor >= MIN_BLOCK_LENGTH - EPS) gaps.push({ x: cursor, length: v.lo - cursor });
      cursor = Math.max(cursor, v.hi);
    }
    if (right.lo - cursor >= MIN_BLOCK_LENGTH - EPS) gaps.push({ x: cursor, length: right.lo - cursor });

    for (const c of centers) {
      for (const g of gaps) {
        out.push({
          role: 'block',
          section: wall.section,
          length: g.length,
          x: g.x,
          y: c - t / 2,
          orientation: 'horizontal',
        });
      }
    }
  }
  return out;
}
