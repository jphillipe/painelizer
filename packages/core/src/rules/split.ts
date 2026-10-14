/**
 * Divisão da parede em painéis transportáveis, lap da double top entre painéis e emendas de plate (S15).
 *
 * Regras (docs/02-framing.md; P6 e P14 respondidas; P8, P15, P23 e P35 hipóteses):
 * - **Candidatos a quebra** (`breakCandidates`): o centro de um stud de layout do painel da parede inteira —
 *   stud comum (não flat, não extra) centrado numa marca `origin + k·spacing`, que não é o de ponta nem o de
 *   fechamento — cuja faixa de 2t (`[c − t, c + t]`, o par de studs que a junta vai receber) não toca nenhuma
 *   outra peça além das plates (king, jack, header, sill, cripple, bloco, stud extra ou de canto), nem zona de
 *   abertura, nem faixa de T, e fica a ≥ 2t das pontas da parede. Na junta o stud da marca vira dois: o de
 *   fechamento do painel i em `b − t` e o primeiro do painel i+1 em `b`.
 * - **Escolha das quebras** (`chooseBreaks`, hipótese P35 — equilibrado): o menor número de painéis em que a
 *   parede cabe (todos ≤ `maxLength` e, se houver, ≤ `maxWeight`); entre as divisões com esse número, a que
 *   minimiza o painel mais longo, preferindo só marcas múltiplas de `module` contadas da marca 0 do layout e,
 *   se com elas não há divisão, qualquer marca. Empate: quebras mais próximas da divisão em partes iguais.
 *   Sem divisão possível → `RangeError` com a parede e o trecho sem candidato.
 * - **Lap da double top** (`lapEnd`, hipótese P23): a double top do painel i avança `lap` (48") sobre o
 *   seguinte e a do i+1 começa aí. Se o fim do avanço cair dentro de um header ou de uma faixa de T, encurta
 *   para `minLap`; se ainda cair, vai até a primeira marca de layout depois do obstáculo. O avanço nunca passa
 *   da quebra seguinte (ou do fim da double top da parede).
 * - **Emenda de plate** (`splicePlates`, P14): plate mais longa que o maior `stockLengths` sai em
 *   `ceil(L / estoque)` peças cortadas sobre o centro de um stud de altura inteira do painel (cada peça apoia
 *   3/4"). Ordem: top plate (emenda defasada das pontas da double top), double top (defasada das emendas da
 *   top e das pontas da top plate), bottom (sobre stud, sem outra restrição). Defasagem preferida `lap` (48"),
 *   mínima `minLap` (24"); da esquerda, a maior peça que deixa o resto emendável.
 */

import {
  verticalWidth,
  type Config,
  type Member,
  type Panel,
  type PanelConfig,
} from '../types';
import type { TeeStrip } from './corners';
import type { OpeningZone } from './openings';

const EPS = 1e-9;

/** Resolução das comparações de comprimento (1/64"). */
const LENGTH_EPS = 1 / 64;

const PLATE_ROLES: ReadonlySet<Member['role']> = new Set(['bottomPlate', 'topPlate', 'doubleTopPlate']);

/** @throws RangeError campo não finito, ≤ 0, ou `minLap > lap` */
export function validatePanelConfig(cfg: PanelConfig): void {
  for (const key of ['maxLength', 'module', 'lap', 'minLap'] as const) {
    const v = cfg[key];
    if (!Number.isFinite(v) || v <= 0) throw new RangeError(`config.panel.${key} inválido (${v}); esperado medida > 0`);
  }
  if (cfg.maxWeight !== undefined && (!Number.isFinite(cfg.maxWeight) || cfg.maxWeight <= 0)) {
    throw new RangeError(`config.panel.maxWeight inválido (${cfg.maxWeight}); esperado peso em lb > 0`);
  }
  if (cfg.minLap > cfg.lap + EPS) {
    throw new RangeError(`config.panel.minLap (${cfg.minLap}) maior que lap (${cfg.lap})`);
  }
}

/** Faixa `[lo, hi]` que um member ocupa em x na elevação. */
export function memberSpan(m: Member): { lo: number; hi: number } {
  const width = m.orientation === 'vertical' ? verticalWidth(m) : m.length;
  return { lo: m.x, hi: m.x + width };
}

function overlaps(aLo: number, aHi: number, bLo: number, bHi: number): boolean {
  return aLo < bHi - EPS && aHi > bLo + EPS;
}

export interface BreakContext {
  /** Zonas de abertura (fundidas) da parede. */
  zones: readonly OpeningZone[];
  /** Faixas de T na parede. */
  strips: readonly TeeStrip[];
}

/**
 * Centros dos studs de layout em que a parede pode ser quebrada, em x da parede, crescentes.
 *
 * @param panel painel da parede inteira (`panelizeWall`)
 */
export function breakCandidates(
  panel: Pick<Panel, 'members' | 'length' | 'layoutOrigin'>,
  config: Config,
  ctx: BreakContext,
): number[] {
  const t = config.studThickness;
  const origin = panel.layoutOrigin ?? 0;
  const closer = panel.length - t;
  const out: number[] = [];
  for (const s of panel.members) {
    if (s.role !== 'stud' || s.flat === true || s.label !== undefined || s.orientation !== 'vertical') continue;
    if (Math.abs(s.x) < EPS || Math.abs(s.x - closer) < EPS) continue;
    const c = s.x + t / 2;
    const k = (c - origin) / config.studSpacing;
    if (Math.abs(k - Math.round(k)) > 1e-6) continue;
    const lo = c - t;
    const hi = c + t;
    if (lo < 2 * t - EPS || hi > panel.length - 2 * t + EPS) continue;
    if (ctx.zones.some((z) => overlaps(lo, hi, z.start, z.end))) continue;
    if (ctx.strips.some((z) => overlaps(lo, hi, z.lo, z.hi))) continue;
    const blocked = panel.members.some((m) => {
      if (m === s || PLATE_ROLES.has(m.role)) return false;
      const sp = memberSpan(m);
      return overlaps(lo, hi, sp.lo, sp.hi);
    });
    if (!blocked) out.push(c);
  }
  return out.sort((a, b) => a - b);
}

export interface BreakOptions {
  /** Comprimento da parede. */
  length: number;
  /** Candidatos de `breakCandidates`. */
  candidates: readonly number[];
  /** Candidato é marca múltipla do módulo (contada da marca 0 do layout). */
  isModule: (c: number) => boolean;
  /** Peso estimado do trecho `[a, b]`, lb. Ausente = sem limite de peso. */
  weightOf?: (a: number, b: number) => number;
  /** Para as mensagens de erro. */
  wallId?: string;
}

/**
 * Quebras escolhidas (x da parede, crescentes); vazio quando a parede inteira é um painel.
 *
 * @throws RangeError sem divisão possível
 */
export function chooseBreaks(opts: BreakOptions, cfg: PanelConfig): number[] {
  const { length, candidates, isModule, weightOf } = opts;
  const who = opts.wallId === undefined ? 'parede' : `parede ${opts.wallId}`;
  const segmentOk = (a: number, b: number): boolean =>
    b - a <= cfg.maxLength + EPS && (cfg.maxWeight === undefined || weightOf === undefined || weightOf(a, b) <= cfg.maxWeight + EPS);

  if (segmentOk(0, length)) return [];

  const sorted = [...candidates].sort((a, b) => a - b);
  const modules = sorted.filter(isModule);
  const pools = modules.length === sorted.length ? [sorted] : [modules, sorted];
  const nMin = Math.max(2, Math.ceil(length / cfg.maxLength - EPS));
  for (let n = nMin; n <= sorted.length + 1; n++) {
    for (const pool of pools) {
      if (pool.length < n - 1) continue;
      const found = bestDivision(pool, n, length, segmentOk);
      if (found !== undefined) return found;
    }
  }

  // Mensagem: o primeiro trecho, da esquerda, sem candidato ao alcance.
  let a = 0;
  for (;;) {
    const reach = sorted.filter((c) => c > a + EPS && segmentOk(a, c));
    if (reach.length === 0) break;
    a = reach[reach.length - 1]!;
    if (segmentOk(a, length)) break;
  }
  const limit = cfg.maxWeight === undefined ? `${cfg.maxLength}"` : `${cfg.maxLength}" / ${cfg.maxWeight} lb`;
  throw new RangeError(
    `${who}: não há como dividir ${length}" em painéis de até ${limit} — nenhum stud de layout livre ` +
      `(fora de abertura, T, canto e studs extras) entre x=${a} e x=${Math.min(length, a + cfg.maxLength)}`,
  );
}

/**
 * Melhor divisão em `n` painéis com quebras do `pool`: minimiza o painel mais longo e, em empate (1/64"),
 * a soma das distâncias das quebras aos pontos da divisão em partes iguais. `undefined` se não existe.
 */
function bestDivision(
  pool: readonly number[],
  n: number,
  length: number,
  segmentOk: (a: number, b: number) => boolean,
): number[] | undefined {
  interface Cell {
    max: number;
    dev: number;
    prev: number;
  }
  const better = (a: Cell, b: Cell | undefined): boolean =>
    b === undefined || a.max < b.max - LENGTH_EPS || (Math.abs(a.max - b.max) <= LENGTH_EPS && a.dev < b.dev - EPS);

  // dp[k][j]: k quebras colocadas, a k-ésima em pool[j].
  let prevRow: (Cell | undefined)[] = pool.map((c) =>
    segmentOk(0, c) ? { max: c, dev: Math.abs(c - length / n), prev: -1 } : undefined,
  );
  const rows: (Cell | undefined)[][] = [prevRow];
  for (let k = 2; k <= n - 1; k++) {
    const row: (Cell | undefined)[] = pool.map(() => undefined);
    for (let j = 0; j < pool.length; j++) {
      const target = (k * length) / n;
      for (let i = 0; i < j; i++) {
        const from = prevRow[i];
        if (from === undefined || !segmentOk(pool[i]!, pool[j]!)) continue;
        const cell: Cell = {
          max: Math.max(from.max, pool[j]! - pool[i]!),
          dev: from.dev + Math.abs(pool[j]! - target),
          prev: i,
        };
        if (better(cell, row[j])) row[j] = cell;
      }
    }
    rows.push(row);
    prevRow = row;
  }

  let best: (Cell & { j: number }) | undefined;
  for (let j = 0; j < pool.length; j++) {
    const cell = prevRow[j];
    if (cell === undefined || !segmentOk(pool[j]!, length)) continue;
    const full: Cell & { j: number } = { ...cell, max: Math.max(cell.max, length - pool[j]!), j };
    if (better(full, best)) best = full;
  }
  if (best === undefined) return undefined;

  const breaks: number[] = [];
  let j = best.j;
  for (let k = n - 1; k >= 1; k--) {
    breaks.unshift(pool[j]!);
    j = rows[k - 1]![j]!.prev;
  }
  return breaks;
}

/** Trecho em x que o fim do lap não pode cortar (header, faixa de T), com um nome para a mensagem. */
export interface LapObstacle {
  lo: number;
  hi: number;
  what: string;
}

/** Marcas de layout `origin + k·spacing` dentro de `[0, length]`, crescentes. */
export function layoutMarks(length: number, spacing: number, origin: number): number[] {
  const out: number[] = [];
  for (let k = Math.ceil((0 - origin) / spacing - EPS); ; k++) {
    const x = origin + k * spacing;
    if (x > length + EPS) break;
    out.push(x);
  }
  return out;
}

/**
 * x (da parede) em que a double top do painel que termina em `b` acaba — e a do seguinte começa.
 *
 * @param limit    até onde o lap pode ir: a quebra seguinte, ou o fim da double top da parede
 * @throws RangeError nenhum fim de lap possível (painel seguinte curto demais ou obstáculo até o fim)
 */
export function lapEnd(
  b: number,
  limit: number,
  cfg: PanelConfig,
  obstacles: readonly LapObstacle[],
  marks: readonly number[],
): number {
  const inside = (e: number): LapObstacle | undefined => obstacles.find((o) => e > o.lo + EPS && e < o.hi - EPS);
  const ok = (e: number): boolean => e > b + EPS && e <= limit + EPS && inside(e) === undefined;

  const full = b + cfg.lap;
  if (ok(full)) return full;
  const short = b + cfg.minLap;
  if (ok(short)) return short;
  const blocker = inside(full) ?? inside(short);
  if (blocker !== undefined) {
    for (const m of marks) {
      if (m >= blocker.hi - EPS && ok(m)) return m;
    }
  }
  const why =
    blocker === undefined
      ? `o painel seguinte acaba em x=${limit} e nem o mínimo de ${cfg.minLap}" cabe`
      : `${blocker.what} ocupa ${blocker.lo}–${blocker.hi} e não há marca livre até x=${limit}`;
  throw new RangeError(`lap da double top após a quebra em x=${b}: ${why}`);
}

/**
 * Plates mais longas que o maior comprimento comercial emendadas sobre studs (P14). Devolve um painel novo;
 * os demais members não mudam.
 *
 * @param wallId para as mensagens
 * @throws RangeError estoque inválido; sem stud onde emendar com as defasagens mínimas
 */
export function splicePlates(
  panel: Panel,
  stockLengths: readonly number[],
  cfg: PanelConfig,
  wallId: string = panel.wallId,
): Panel {
  if (stockLengths.length === 0) throw new RangeError('stockLengths: lista de comprimentos comerciais vazia');
  for (const s of stockLengths) {
    if (!Number.isFinite(s) || s <= 0) throw new RangeError(`stockLengths: comprimento comercial inválido (${s})`);
  }
  const maxStock = Math.max(...stockLengths);
  const needs = (m: Member): boolean => PLATE_ROLES.has(m.role) && m.length > maxStock + LENGTH_EPS;
  if (!panel.members.some(needs)) return panel;

  const supports = panel.members
    .filter((m) => (m.role === 'stud' || m.role === 'kingStud') && m.orientation === 'vertical' && m.flat !== true)
    .map((m) => m.x + verticalWidth(m) / 2)
    .sort((a, b) => a - b);
  const ends = (role: Member['role']): number[] =>
    panel.members.filter((m) => m.role === role).flatMap((m) => [m.x, m.x + m.length]);

  const pieces = new Map<Member, Member[]>();
  const cutsOf = (m: Member, avoid: readonly number[], prefer: boolean): number[] => {
    const cuts = pickCuts(m.x, m.x + m.length, maxStock, supports, avoid, prefer ? cfg.lap : 0, prefer ? cfg.minLap : 0, `${wallId}: ${m.role} de ${m.length}"`);
    const bounds = [m.x, ...cuts, m.x + m.length];
    pieces.set(
      m,
      bounds.slice(1).map((end, i) => ({ ...m, x: bounds[i]!, length: end - bounds[i]! })),
    );
    return cuts;
  };

  // Top plate primeiro, defasada das pontas (juntas) da double top; depois a double top, defasada das emendas
  // da top e das pontas da top plate; a bottom emenda sobre stud sem outra restrição.
  const topCuts = panel.members.filter((m) => m.role === 'topPlate' && needs(m)).flatMap((m) => cutsOf(m, ends('doubleTopPlate'), true));
  for (const m of panel.members.filter((m) => m.role === 'doubleTopPlate' && needs(m))) {
    cutsOf(m, [...topCuts, ...ends('topPlate')], true);
  }
  for (const m of panel.members.filter((m) => m.role === 'bottomPlate' && needs(m))) cutsOf(m, [], false);

  return { ...panel, members: panel.members.flatMap((m) => pieces.get(m) ?? [m]) };
}

/**
 * Posições de corte de uma plate `[x0, x1]` em `ceil(L / maxStock)` peças, sobre `supports`, cada corte a
 * ≥ `prefer` (ou, se não der, ≥ `min`) de `avoid` e dos cortes já escolhidos. Da esquerda, a maior peça que
 * deixa o resto emendável.
 */
function pickCuts(
  x0: number,
  x1: number,
  maxStock: number,
  supports: readonly number[],
  avoid: readonly number[],
  prefer: number,
  min: number,
  what: string,
): number[] {
  const count = Math.ceil((x1 - x0) / maxStock - EPS) - 1;
  const cuts: number[] = [];
  let cursor = x0;
  for (let k = 0; k < count; k++) {
    const piecesLeft = count - k;
    const feasible = supports.filter(
      (c) => c > cursor + EPS && c - cursor <= maxStock + EPS && x1 - c <= piecesLeft * maxStock + EPS && c < x1 - EPS,
    );
    const taken = [...avoid, ...cuts];
    const farFrom = (gap: number) => feasible.filter((c) => taken.every((a) => Math.abs(c - a) >= gap - EPS));
    const pick = (farFrom(prefer).at(-1) ?? farFrom(min).at(-1));
    if (pick === undefined) {
      throw new RangeError(
        `${what}: não há stud entre x=${cursor} e x=${Math.min(x1, cursor + maxStock)} para emendar a plate ` +
          `com defasagem de ${min}" das outras emendas (estoque máximo ${maxStock}")`,
      );
    }
    cuts.push(pick);
    cursor = pick;
  }
  return cuts;
}
