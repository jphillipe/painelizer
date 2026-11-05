/**
 * Blocking horizontal entre peças verticais (S31, S36): a fileira genérica (`blocksBetween`/`gapsBetween`), que o
 * ladder do T (`rules/corners.ts`), o fire blocking e as fileiras por altura usam.
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
 * - **Fileiras por altura** (S36, hipótese P44): `wall.blocking` (ou o do tipo de parede) lista fileiras
 *   `{ y, from?, to?, label? }` e ids de preset (`config.blockingPresets` somado a `BUILTIN_BLOCKING_PRESETS`). Bloco
 *   deitado da seção da parede com o **centro** em `y` (do subfloor), em todo vão entre peças de altura inteira que
 *   toca `(from, to)` (ausentes = a parede inteira). Vão em zona de abertura ou no trecho do ladder de um T é pulado
 *   com aviso `BLOCKING_SKIPPED`; vão onde já há bloco na mesma altura (fire blocking, fileira anterior) também, com
 *   o nome da fileira que ficou. A peça leva `blocking: 'backing'` e o uso em `label`; como a de fogo, não impede
 *   quebra de painel (cada painel gera a sua fileira).
 */

import { studLengthFor, type BlockingPreset, type Config } from '../config';
import { EPS } from '../eps';
import { overlaps, span, type Span } from '../geom';
import { EngineError, warning, type Warning } from '../messages';
import type { FlatMember, Member } from '../panel';
import type { WallSection } from '../sections';
import type { BlockingEntry } from '../wall';

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

// ---- fileiras por altura (S36, P44) ---------------------------------------------------------------------------

/**
 * Presets embutidos (hipótese P44): um valor por uso, o centro do bloco ao subfloor, tirados das faixas da prancha da
 * fábrica (docs/14-prancha-fabrica.md, quadros 6, 7 e 12). Faixa → um valor: bancada 34½–36" → 36; vaso 12–18" → 15;
 * papeleira/ganchos 36–42" → 39; ducha 78–80" → 79.
 */
export const BUILTIN_BLOCKING_PRESETS: Readonly<Record<string, Readonly<Required<BlockingPreset>>>> = {
  'kitchen-base': { y: 36, label: 'Base cabinets / countertop' },
  'kitchen-upper-bottom': { y: 54, label: 'Upper cabinets, bottom' },
  'kitchen-upper-top': { y: 84, label: 'Upper cabinets, top' },
  'bath-toilet': { y: 15, label: 'Toilet' },
  'bath-paper': { y: 39, label: 'Paper holder / hooks' },
  'bath-valve': { y: 42, label: 'Shower valve' },
  'bath-towel': { y: 48, label: 'Towel bar' },
  'bath-shower': { y: 79, label: 'Shower head' },
};

/** Uso de uma fileira sem `label` (nem do preset). */
export const DEFAULT_BLOCKING_LABEL = 'Blocking';
/** Nome da fileira de fire blocking (folha; aviso quando outra fileira cai em cima dela). */
export const FIRE_BLOCKING_LABEL = 'Fire blocking';

/** Os presets que valem no projeto: os embutidos e os de `config.blockingPresets` (o do projeto substitui). */
export function blockingPresetsOf(config: Pick<Config, 'blockingPresets'>): Record<string, BlockingPreset> {
  return { ...BUILTIN_BLOCKING_PRESETS, ...config.blockingPresets };
}

/** Fileira pronta para gerar: centro, trecho (opcional) e uso; `index` = posição em `wall.blocking`. */
export interface ResolvedBlockingRow {
  y: number;
  from?: number;
  to?: number;
  label: string;
  index: number;
}

/** Centros mínimo e máximo de uma fileira: o bloco (`t` de altura) entre a bottom plate e a top plate. */
export function blockingYRange(height: number, config: Pick<Config, 'plateThickness' | 'studThickness'>): { min: number; max: number } {
  const half = config.studThickness / 2;
  return { min: config.plateThickness + half, max: height - 2 * config.plateThickness - half };
}

/**
 * As fileiras da parede, com os presets trocados pela altura e pelo uso. Não olha o tipo de parede: quem completa
 * `wall.blocking` com o do tipo é `resolveWallType`.
 *
 * @throws EngineError `BLOCKING_PRESET_UNKNOWN` (id fora dos presets) ou `BLOCKING_ROW_INVALID` (centro fora da
 *                     cavidade, número não finito, trecho vazio ou fora da parede)
 */
export function resolveBlockingRows(
  wall: { id: string; length: number; height: number; blocking?: readonly BlockingEntry[] | undefined },
  config: Pick<Config, 'blockingPresets' | 'plateThickness' | 'studThickness'>,
): ResolvedBlockingRow[] {
  const entries = wall.blocking ?? [];
  if (entries.length === 0) return [];
  const presets = blockingPresetsOf(config);
  const where = { wallId: wall.id };
  const { min, max } = blockingYRange(wall.height, config);
  const badY = (y: number): boolean => !Number.isFinite(y) || y < min - EPS || y > max + EPS;
  return entries.map((e, index): ResolvedBlockingRow => {
    if (typeof e === 'string') {
      // `Object.hasOwn`: um id `constructor` não acha nada no protótipo.
      const preset = Object.hasOwn(presets, e) ? presets[e] : undefined;
      if (preset === undefined) {
        throw new EngineError('BLOCKING_PRESET_UNKNOWN', where, { index, preset: e, known: Object.keys(presets).sort() });
      }
      if (badY(preset.y)) throw new EngineError('BLOCKING_ROW_INVALID', where, { index, field: 'y', value: preset.y, min, max });
      return { y: preset.y, label: preset.label ?? e, index };
    }
    if (badY(e.y)) throw new EngineError('BLOCKING_ROW_INVALID', where, { index, field: 'y', value: e.y, min, max });
    for (const field of ['from', 'to'] as const) {
      const v = e[field];
      if (v !== undefined && !Number.isFinite(v)) throw new EngineError('BLOCKING_ROW_INVALID', where, { index, field, value: v });
    }
    const lo = e.from ?? -Infinity;
    const hi = e.to ?? Infinity;
    if (!(lo < hi - EPS) || hi <= EPS || lo >= wall.length - EPS) {
      throw new EngineError('BLOCKING_ROW_INVALID', where, {
        index,
        field: 'range',
        from: e.from ?? 'start',
        to: e.to ?? 'end',
        length: wall.length,
      });
    }
    return {
      y: e.y,
      ...(e.from === undefined ? {} : { from: e.from }),
      ...(e.to === undefined ? {} : { to: e.to }),
      label: e.label ?? DEFAULT_BLOCKING_LABEL,
      index,
    };
  });
}

/**
 * As fileiras de um trecho `[a, b]` da parede (S36, `splitWall`): o trecho de cada uma deslocado de `−a` e cortado ao
 * painel; fileira que não toca o trecho sai; fileira da parede inteira e id de preset ficam como estão.
 */
export function blockingForSegment(entries: readonly BlockingEntry[], a: number, b: number): BlockingEntry[] {
  return entries.flatMap((e): BlockingEntry[] => {
    if (typeof e === 'string' || (e.from === undefined && e.to === undefined)) return [e];
    const lo = e.from ?? -Infinity;
    const hi = e.to ?? Infinity;
    if (hi <= a + EPS || lo >= b - EPS) return [];
    const row = { ...e };
    if (e.from !== undefined) row.from = Math.max(e.from, a) - a;
    if (e.to !== undefined) row.to = Math.min(e.to, b) - a;
    return [row];
  });
}

/** Faixa onde uma fileira por altura não leva bloco: zona de abertura ou trecho do ladder de um T. */
export type BlockingSkip = Span &
  ({ reason: 'opening'; openingIds: readonly string[] } | { reason: 'tee'; teeWallId?: string | undefined });

/**
 * Blocos das fileiras por altura entre as peças de altura inteira, com os avisos dos vãos pulados. Um aviso por
 * fileira e faixa pulada; um por fileira e fileira que já estava na mesma altura.
 *
 * @param fullHeight studs, kings, extras, studs de canto e de encosto
 * @param skips      zonas de abertura e trechos do ladder
 * @param placed     blocos já colocados (ladder, fire blocking): vão com bloco na mesma altura é pulado
 */
export function heightBlocks(
  wall: { id: string; section: WallSection },
  rows: readonly ResolvedBlockingRow[],
  fullHeight: readonly Member[],
  skips: readonly BlockingSkip[],
  placed: readonly FlatMember[],
  config: Pick<Config, 'studThickness'>,
): { members: FlatMember[]; warnings: Warning[] } {
  const spans = fullHeight.map(span);
  if (rows.length === 0 || spans.length === 0) return { members: [], warnings: [] };
  const t = config.studThickness;
  const gaps = gapsBetween(spans, Math.min(...spans.map((v) => v.hi)), Math.max(...spans.map((v) => v.lo)));
  const members: FlatMember[] = [];
  const warnings: Warning[] = [];
  const all: FlatMember[] = [...placed];
  for (const row of rows) {
    const y = row.y - t / 2;
    const lo = row.from ?? -Infinity;
    const hi = row.to ?? Infinity;
    const skipped = new Set<BlockingSkip>();
    const covered = new Map<string, Span>();
    for (const g of gaps) {
      const gHi = g.x + g.length;
      if (!overlaps(g.x, gHi, lo, hi)) continue;
      const skip = skips.find((s) => overlaps(g.x, gHi, s.lo, s.hi));
      if (skip !== undefined) {
        skipped.add(skip);
        continue;
      }
      const other = all.find((m) => overlaps(g.x, gHi, m.x, m.x + m.length) && overlaps(y, y + t, m.y, m.y + t));
      if (other !== undefined) {
        const name = other.blocking === 'fire' ? FIRE_BLOCKING_LABEL : (other.label ?? DEFAULT_BLOCKING_LABEL);
        const prev = covered.get(name);
        covered.set(name, { lo: Math.min(prev?.lo ?? g.x, g.x), hi: Math.max(prev?.hi ?? gHi, gHi) });
        continue;
      }
      const block: FlatMember = {
        role: 'block',
        section: wall.section,
        length: g.length,
        x: g.x,
        y,
        orientation: 'horizontal',
        blocking: 'backing',
        label: row.label,
      };
      members.push(block);
      all.push(block);
    }
    const base = { label: row.label, y: row.y };
    for (const s of [...skipped].sort((a, b) => a.lo - b.lo)) {
      const why =
        s.reason === 'opening' ? { openingIds: [...s.openingIds] } : s.teeWallId === undefined ? {} : { teeWallId: s.teeWallId };
      warnings.push(warning('BLOCKING_SKIPPED', { wallId: wall.id }, { ...base, reason: s.reason, lo: s.lo, hi: s.hi, ...why }, 'P44'));
    }
    for (const [otherLabel, s] of covered) {
      warnings.push(warning('BLOCKING_SKIPPED', { wallId: wall.id }, { ...base, reason: 'overlap', otherLabel, lo: s.lo, hi: s.hi }, 'P44'));
    }
  }
  return { members, warnings };
}
