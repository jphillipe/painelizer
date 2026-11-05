/**
 * Blocking horizontal entre peças verticais (S31): a fileira genérica (`blocksBetween`), que o ladder do T
 * (`rules/corners.ts`) e o fire blocking usam, e que a S36 vai reusar nas fileiras por altura (P44).
 *
 * Regras (docs/02-framing.md; P11 respondida, P50 hipótese):
 * - **Fileira**: um bloco `role: 'block'` da seção da parede, deitado (1.5" de altura, ocupa a espessura inteira da
 *   parede), em cada vão entre peças verticais vizinhas dentro de `[from, to]`. Vão menor que 1.5" não leva bloco;
 *   vão que toca uma faixa de `skip` (zona de abertura, trecho do ladder) é pulado.
 * - **Fire blocking** (R302.11): cavidade contínua `height − 3·plateThickness` acima de `config.fireBlockAt`
 *   (default 120", P11) leva o menor número de fileiras que deixa cada trecho da cavidade com no máximo
 *   `fireBlockAt`, igualmente espaçadas — uma fileira, no meio da cavidade, até 241.5" (hipótese P50). Os blocos
 *   vão entre as peças de altura inteira (studs, kings, extras, de canto e de encosto), fora das zonas de
 *   abertura (header, sill e cripples já fecham a cavidade ali) e fora do trecho do ladder de um T (os blocos a
 *   24" já a fecham). A peça leva `blocking: 'fire'`: não impede quebra de painel (cada painel gera os seus).
 */

import { studLengthFor, type Config } from '../config';
import { EPS } from '../eps';
import { overlaps, span, type Span } from '../geom';
import type { FlatMember, Member } from '../panel';
import type { WallSection } from '../sections';

/** Cavidade contínua acima disto leva fire blocking (R302.11; P11). */
export const DEFAULT_FIRE_BLOCK_AT = 120;

/** Pedaço de bloco mais curto que isto não é cortado. */
export const MIN_BLOCK_LENGTH = 1.5;

/** Vão `[x, x + length]` entre duas peças verticais. */
export interface BlockGap {
  x: number;
  length: number;
}

/**
 * Vãos entre as peças verticais vizinhas de `[from, to]` (bordas de peças; `from` é a face direita da peça da
 * esquerda, `to` a face esquerda da da direita). Peças que se sobrepõem contam como uma; vão < 1.5" sai.
 */
export function gapsBetween(spans: readonly Span[], from: number, to: number): BlockGap[] {
  const inside = spans.filter((v) => v.hi > from + EPS && v.lo < to - EPS).sort((a, b) => a.lo - b.lo);
  const gaps: BlockGap[] = [];
  let cursor = from;
  for (const v of inside) {
    if (v.lo - cursor >= MIN_BLOCK_LENGTH - EPS) gaps.push({ x: cursor, length: v.lo - cursor });
    cursor = Math.max(cursor, v.hi);
  }
  if (to - cursor >= MIN_BLOCK_LENGTH - EPS) gaps.push({ x: cursor, length: to - cursor });
  return gaps;
}

export interface BlockRowOptions {
  /** y da base dos blocos. */
  y: number;
  section: WallSection;
  /** Trecho em x; ausente = da primeira à última peça vertical. */
  from?: number;
  to?: number;
  /** Faixas em x cujos vãos não levam bloco (zona de abertura, trecho do ladder). */
  skip?: readonly Span[];
  /** Uso da fileira, gravado na peça (ausente no ladder). */
  blocking?: FlatMember['blocking'];
}

/** Uma fileira de blocos entre as peças verticais dadas. */
export function blocksBetween(verticals: readonly Member[], opts: BlockRowOptions): FlatMember[] {
  const spans = verticals.map(span);
  if (spans.length === 0) return [];
  const from = opts.from ?? Math.min(...spans.map((s) => s.hi));
  const to = opts.to ?? Math.max(...spans.map((s) => s.lo));
  const skip = opts.skip ?? [];
  return gapsBetween(spans, from, to)
    .filter((g) => !skip.some((s) => overlaps(g.x, g.x + g.length, s.lo, s.hi)))
    .map((g) => ({
      role: 'block',
      section: opts.section,
      length: g.length,
      x: g.x,
      y: opts.y,
      orientation: 'horizontal',
      ...(opts.blocking === undefined ? {} : { blocking: opts.blocking }),
    }));
}

/**
 * y da base de cada fileira de fire blocking: o menor `n` com `(cavidade − n·t)/(n + 1) ≤ limite`, trechos iguais.
 * Vazio quando a cavidade não passa do limite.
 *
 * @throws RangeError limite não positivo
 */
export function fireBlockRows(cavity: number, limit: number, plateThickness: number, thickness: number): number[] {
  if (!Number.isFinite(limit) || limit <= 0) throw new RangeError(`fireBlockAt must be > 0 (got ${limit})`);
  if (cavity <= limit + EPS) return [];
  let n = 1;
  while ((cavity - n * thickness) / (n + 1) > limit + EPS) n++;
  const segment = (cavity - n * thickness) / (n + 1);
  return Array.from({ length: n }, (_, i) => plateThickness + (i + 1) * segment + i * thickness);
}

/**
 * Fire blocking da parede: fileiras entre as peças de altura inteira, fora das zonas de abertura e do ladder.
 *
 * @param fullHeight studs, kings, extras, studs de canto e de encosto
 * @param skip       zonas de abertura e trechos do ladder do T
 */
export function fireBlocks(
  wall: { height: number; section: WallSection },
  fullHeight: readonly Member[],
  skip: readonly Span[],
  config: Config,
): FlatMember[] {
  const rows = fireBlockRows(
    studLengthFor(wall, config),
    config.fireBlockAt ?? DEFAULT_FIRE_BLOCK_AT,
    config.plateThickness,
    config.studThickness,
  );
  return rows.flatMap((y) => blocksBetween(fullHeight, { y, section: wall.section, skip, blocking: 'fire' }));
}
