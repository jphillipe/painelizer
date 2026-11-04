/**
 * Onde quebrar a parede em painéis transportáveis (S15). O lap da double top entre painéis está em `laps.ts`
 * e a emenda de plates acima do estoque em `splice.ts`.
 *
 * Regras (docs/02-framing.md; P6 respondida; P8, P15 e P35 hipóteses):
 * - **Candidatos a quebra** (`breakCandidates`): o centro de um stud de layout do painel da parede inteira —
 *   stud comum (não flat, não extra) centrado numa marca `origin + k·spacing`, que não é o de ponta nem o de
 *   fechamento — cuja faixa de 2t (`[c − t, c + t]`, o par de studs que a junta vai receber) não toca nenhuma
 *   outra peça além das plates (king, jack, header, sill, cripple, bloco, stud extra ou de canto), nem zona de
 *   abertura, nem faixa de T, e fica a ≥ 2t das pontas da parede. Bloco de fire blocking (S31) não conta: a
 *   fileira é refeita em cada painel. Na junta o stud da marca vira dois: o de
 *   fechamento do painel i em `b − t` e o primeiro do painel i+1 em `b`.
 * - **Escolha das quebras** (`chooseBreaks`, hipótese P35 — equilibrado): o menor número de painéis em que a
 *   parede cabe (todos ≤ `maxLength` e, se houver, ≤ `maxWeight`); entre as divisões com esse número, a que
 *   minimiza o painel mais longo, preferindo só marcas múltiplas de `module` contadas da marca 0 do layout e,
 *   se com elas não há divisão, qualquer marca. Empate: quebras mais próximas da divisão em partes iguais.
 *   Sem divisão possível → `RangeError` com a parede e o trecho sem candidato.
 * - **Quebras forçadas** (`forcedBreaks`, S29): `wall.panelBreaks` é a lista completa — o motor não escolhe nem
 *   acrescenta. Cada uma tem de ser candidata (`whyNotBreak` diz por que não é: ordem, ponta, marca, abertura,
 *   T ou peça) e nenhum trecho pode passar de `maxLength`; peso acima de `maxWeight` continua só aviso.
 */

import type { Config, PanelConfig } from '../config';
import { EPS, LENGTH_EPS } from '../eps';
import { overlaps, span } from '../geom';
import { isPlateRole, type Panel } from '../panel';
import type { TeeStrip } from './corners';
import { EngineError } from '../messages';
import type { OpeningZone } from './openings';

/** @throws RangeError campo não finito, ≤ 0, ou `minLap > lap` */
export function validatePanelConfig(cfg: PanelConfig): void {
  for (const key of ['maxLength', 'module', 'lap', 'minLap'] as const) {
    const v = cfg[key];
    if (!Number.isFinite(v) || v <= 0) throw new EngineError('CONFIG_INVALID', {}, { field: `config.panel.${key}`, value: v, expected: 'measure' });
  }
  if (cfg.maxWeight !== undefined && (!Number.isFinite(cfg.maxWeight) || cfg.maxWeight <= 0)) {
    throw new EngineError('CONFIG_INVALID', {}, { field: 'config.panel.maxWeight', value: cfg.maxWeight, expected: 'weight' });
  }
  if (cfg.minLap > cfg.lap + EPS) {
    throw new EngineError('PANEL_MIN_LAP_ABOVE_LAP', {}, { minLap: cfg.minLap, lap: cfg.lap });
  }
}

export interface BreakContext {
  /** Zonas de abertura (fundidas) da parede; `openingIds` entra na mensagem da quebra forçada. */
  zones: readonly (OpeningZone & { openingIds?: readonly string[] })[];
  /** Faixas de T na parede. */
  strips: readonly TeeStrip[];
}

/** Por que `x` não pode ser quebra de painel (S29). Na ordem em que `whyNotBreak` confere. */
export type BreakRejection =
  | { reason: 'end'; min: number; length: number }
  | { reason: 'opening'; openingIds: readonly string[]; start: number; end: number }
  | { reason: 'tee'; lo: number; hi: number; teeWallId?: string }
  | { reason: 'mark'; spacing: number }
  | { reason: 'member'; role: string; memberX: number };

/** Stud de layout comum (não flat, não extra), o único que vira par de studs na junta. */
function isLayoutStud(m: Panel['members'][number]): boolean {
  return m.role === 'stud' && m.flat !== true && m.label === undefined;
}

/**
 * `undefined` se a parede pode ser quebrada em `x` (o critério de `breakCandidates`); senão o motivo. A faixa
 * da junta é `[x − t, x + t]` (os dois studs que ela recebe).
 *
 * @param panel painel da parede inteira (`panelizeWall`)
 */
export function whyNotBreak(
  x: number,
  panel: Pick<Panel, 'members' | 'length' | 'layoutOrigin'>,
  config: Config,
  ctx: BreakContext,
): BreakRejection | undefined {
  const t = config.studThickness;
  const lo = x - t;
  const hi = x + t;
  if (!(lo >= 2 * t - EPS && hi <= panel.length - 2 * t + EPS)) return { reason: 'end', min: 3 * t, length: panel.length };
  const zone = ctx.zones.find((z) => overlaps(lo, hi, z.start, z.end));
  if (zone !== undefined) return { reason: 'opening', openingIds: zone.openingIds ?? [], start: zone.start, end: zone.end };
  const strip = ctx.strips.find((z) => overlaps(lo, hi, z.lo, z.hi));
  if (strip !== undefined) return { reason: 'tee', lo: strip.lo, hi: strip.hi, ...(strip.wallId === undefined ? {} : { teeWallId: strip.wallId }) };
  const k = (x - panel.layoutOrigin) / config.studSpacing;
  if (Math.abs(k - Math.round(k)) > 1e-6) return { reason: 'mark', spacing: config.studSpacing };
  const own = panel.members.find((m) => isLayoutStud(m) && Math.abs(m.x + t / 2 - x) < EPS);
  const blocker = panel.members.find((m) => {
    // Bloco de fogo (S31) não segura a quebra: cada painel gera a sua fileira entre os próprios studs.
    if (m === own || isPlateRole(m.role) || (m.role === 'block' && m.blocking === 'fire')) return false;
    const sp = span(m);
    return overlaps(lo, hi, sp.lo, sp.hi);
  });
  if (blocker !== undefined) return { reason: 'member', role: blocker.role, memberX: blocker.x };
  // Marca sem stud de layout e sem peça na faixa não acontece (o stud só sai por sobreposição); guarda.
  if (own === undefined) return { reason: 'mark', spacing: config.studSpacing };
  return undefined;
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
  const out: number[] = [];
  for (const s of panel.members) {
    if (!isLayoutStud(s)) continue;
    const c = s.x + t / 2;
    if (whyNotBreak(c, panel, config, ctx) === undefined) out.push(c);
  }
  return out.sort((a, b) => a - b);
}

export interface ForcedBreakOptions {
  /** Comprimento da parede. */
  length: number;
  /** Motivo de recusa de cada quebra (`whyNotBreak` sobre o painel da parede inteira). */
  reject: (x: number) => BreakRejection | undefined;
  /** Para as mensagens de erro. */
  wallId?: string;
}

/**
 * As quebras forçadas (`wall.panelBreaks`), conferidas: crescentes e sem repetição, cada uma candidata e
 * nenhum trecho acima de `maxLength`. Devolve a lista como veio.
 *
 * @throws EngineError `VALUE_INVALID` (não finita), `PANEL_BREAK_INVALID` (com `reason`), `PANEL_TOO_LONG`
 */
export function forcedBreaks(forced: readonly number[], opts: ForcedBreakOptions, cfg: PanelConfig): number[] {
  const where = { wallId: opts.wallId };
  forced.forEach((x, i) => {
    if (!Number.isFinite(x)) throw new EngineError('VALUE_INVALID', where, { field: 'panelBreaks', value: x });
    if (i > 0 && x <= forced[i - 1]! + EPS) throw new EngineError('PANEL_BREAK_INVALID', where, { at: x, reason: 'order' });
  });
  for (const x of forced) {
    const why = opts.reject(x);
    if (why !== undefined) {
      const { reason, ...rest } = why;
      throw new EngineError('PANEL_BREAK_INVALID', where, { at: x, reason, ...rest });
    }
  }
  const bounds = [0, ...forced, opts.length];
  for (let i = 1; i < bounds.length; i++) {
    const a = bounds[i - 1]!;
    const b = bounds[i]!;
    if (b - a > cfg.maxLength + EPS) {
      throw new EngineError('PANEL_TOO_LONG', where, { from: a, to: b, length: b - a, maxLength: cfg.maxLength });
    }
  }
  return [...forced];
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
  throw new EngineError(
    'CANNOT_SPLIT',
    { wallId: opts.wallId },
    { length, maxLength: cfg.maxLength, maxWeight: cfg.maxWeight, from: a, to: Math.min(length, a + cfg.maxLength) },
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
