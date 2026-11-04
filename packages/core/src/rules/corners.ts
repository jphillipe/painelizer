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
 * - **Cruzamento em +** (S31, hipótese P46): os dois T de lados opostos chegam fundidos numa faixa só (`sides: 2`,
 *   `house/connections.ts`): um corte da double top, um ladder (o bloco deitado ocupa a espessura inteira, então
 *   a mesma fileira serve os dois lados) ou um par de backers. Faixas distintas no mesmo vão entre studs dividem o
 *   mesmo ladder: o vão leva uma fileira só.
 * - Faixa do T dentro do RO de uma abertura é erro (não há onde pregar a parede); na zona (kings/jacks) gera
 *   o aviso `OPENING_AT_TEE` e **nenhuma** peça de T — kings/jacks e blocos disputam o lugar.
 * - **Laps da double top plate** (R602.3.2): no canto, a double top de quem **encosta** avança `t_outra` sobre
 *   a top plate da outra (x negativo no início) e a de quem **atravessa** recua `t_outra`; no T, a de quem
 *   encosta avança `t_outra` e a da atravessada é cortada na faixa; no +, cada uma das que encostam avança
 *   `t_outra/2` (P46). Fica como `PlateOptions` para
 *   `layoutPlates`.
 */

import type { Config } from '../config';
import { EPS } from '../eps';
import { overlaps, span, type Span } from '../geom';
import type { Opening } from '../opening';
import type { FlatMember, Member } from '../panel';
import { sectionDepth } from '../sections';
import type { TeeJoint, Wall, WallJoints } from '../wall';
import type { PlateOptions } from './plates';
import { EngineError, warning, type Warning } from '../messages';
import type { MergedZone } from './zones';
import { blocksBetween } from './blocking';

/** Espaçamento vertical entre centros dos blocos do ladder (hipótese P22). */
export const LADDER_BLOCK_SPACING = 24;

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
  /** No cruzamento em + (S31), a parede do outro lado. */
  otherWallId?: string;
}

export function teeStrips(joints: WallJoints | undefined): TeeStrip[] {
  return (joints?.tees ?? []).map((t: TeeJoint) => ({
    lo: t.x - t.width / 2,
    hi: t.x + t.width / 2,
    ...(t.wallId === undefined ? {} : { wallId: t.wallId }),
    ...(t.otherWallId === undefined ? {} : { otherWallId: t.otherWallId }),
  }));
}

/** Laps e cortes da double top plate a partir das ligações da parede. */
export function plateOptionsFor(joints: WallJoints | undefined): PlateOptions {
  if (joints === undefined) return {};
  const opts: PlateOptions = {};
  for (const end of ['start', 'end'] as const) {
    const j = joints[end];
    if (j === undefined) continue;
    if (j.kind === 'panel') {
      // Junta entre painéis da mesma parede (S15, P23): o painel da esquerda avança o lap, o da direita recua.
      opts[end] = end === 'end' ? { extend: j.lap } : { recess: j.lap };
      continue;
    }
    // Quem atravessa o canto recua; quem encosta (canto ou T) avança sobre a top plate da outra.
    // No cruzamento em + (S31, P46) as duas que encostam avançam meia espessura e se encontram no eixo.
    if (j.kind === 'corner' && j.through) opts[end] = { recess: j.otherThickness };
    else opts[end] = { extend: j.kind === 'tee' && j.cross === true ? j.otherThickness / 2 : j.otherThickness };
  }
  const cuts = [
    ...(joints.tees ?? []).map((t) => ({ x: t.x - t.width / 2, width: t.width })),
    ...(joints.start?.kind === 'panel' ? joints.start.cuts ?? [] : []),
    ...(joints.end?.kind === 'panel' ? joints.end.cuts ?? [] : []),
  ];
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
      throw new EngineError('CORNER_STUD_OFF_PLATE', { wallId: wall.id }, { x: s.x, length: wall.length });
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
      if (overlaps(s.lo, s.hi, o.offset, o.offset + o.roughWidth)) {
        throw new EngineError(
          'TEE_IN_OPENING',
          { wallId: wall.id, openingId: o.id, ...(s.wallId === undefined ? {} : { alsoWalls: [s.wallId, ...(s.otherWallId === undefined ? [] : [s.otherWallId])] }) },
          { teeWallId: who, x, lo: s.lo, hi: s.hi, from: o.offset, to: o.offset + o.roughWidth },
        );
      }
    }
    let conflict = false;
    for (const z of zones) {
      if (overlaps(s.lo, s.hi, z.start, z.end)) {
        conflict = true;
        warnings.push(
          warning(
            'OPENING_AT_TEE',
            { wallId: wall.id, openingId: z.openingIds[0] },
            { teeWallId: who, x, lo: s.lo, hi: s.hi, openingIds: [...z.openingIds], start: z.start, end: z.end },
          ),
        );
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
 * Trecho de cada faixa de T entre o stud vizinho à esquerda e o vizinho à direita (`[face direita, face
 * esquerda]`): onde vão os blocos do ladder. O fire blocking (`rules/blocking.ts`) não entra nele.
 *
 * @param verticals peças de altura inteira já definidas
 * @throws EngineError `TEE_WITHOUT_STUD` faixa sem stud vizinho de um dos lados
 */
export function ladderBays(wall: Pick<Wall, 'id'>, strips: readonly TeeStrip[], verticals: readonly Member[]): Span[] {
  const spans = verticals.map(span);
  return strips.map((s) => {
    const left = spans.filter((v) => v.hi <= s.lo + EPS).sort((a, b) => a.hi - b.hi).at(-1);
    const right = spans.filter((v) => v.lo >= s.hi - EPS).sort((a, b) => a.lo - b.lo)[0];
    if (left === undefined || right === undefined) {
      throw new EngineError('TEE_WITHOUT_STUD', { wallId: wall.id }, { lo: s.lo, hi: s.hi });
    }
    return { lo: left.hi, hi: right.lo };
  });
}

/**
 * Blocos do ladder blocking (`config.tee: 'ladder'`) de uma parede, para as faixas de T sem conflito: uma fileira
 * de `blocksBetween` (`rules/blocking.ts`) em cada altura de `ladderBlockCenters`, no trecho de `ladderBays`.
 *
 * @param verticals peças de altura inteira já definidas (studs de layout, extras, kings, studs de canto):
 *                  delimitam os blocos e, dentro da faixa, os dividem
 */
export function ladderBlocks(wall: Wall, strips: readonly TeeStrip[], verticals: readonly Member[], config: Config): FlatMember[] {
  if ((config.tee ?? 'ladder') !== 'ladder' || strips.length === 0) return [];
  const t = config.studThickness;
  const centers = ladderBlockCenters(wall.height, config.plateThickness, t);
  const bays = ladderBays(wall, strips, verticals).filter(
    (b, i, all) => all.findIndex((o) => Math.abs(o.lo - b.lo) < EPS && Math.abs(o.hi - b.hi) < EPS) === i,
  );
  return bays.flatMap((bay) =>
    centers.flatMap((c) => blocksBetween(verticals, { y: c - t / 2, section: wall.section, from: bay.lo, to: bay.hi })),
  );
}
