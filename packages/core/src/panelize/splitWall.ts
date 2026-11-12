/**
 * Painéis transportáveis de uma parede (S15): divide, dá o lap da double top entre painéis, emenda plates
 * acima do estoque e estima o peso.
 *
 * Como funciona:
 * 1. `panelizeWall` monta a parede inteira; dela saem os candidatos a quebra (`rules/breaks.ts`), as zonas de
 *    abertura e as faixas de T.
 * 2. `chooseBreaks` escolhe as quebras (hipótese P35: menor número de painéis, depois o mais equilibrado,
 *    preferindo marcas múltiplas de `config.panel.module`); com `wall.panelBreaks` (S29) valem as do revisor,
 *    conferidas por `forcedBreaks`. Sem quebra, o painel da parede inteira é o painel.
 * 3. Cada trecho `[a, b]` vira uma `Wall` própria — comprimento `b − a`, aberturas, studs extras, posts (S37) e T
 *    deslocados de `−a` (fileiras de blocking com trecho também, cortadas ao painel; S36), `layoutOrigin = origem − a` — com a junta como ligação `{ kind: 'panel', lap }` nas
 *    pontas internas (o painel i avança o lap, o i+1 recua; `rules/corners.ts`). As ligações da parede com as
 *    vizinhas (canto, T) ficam só no primeiro e no último trecho. `panelizeWall` roda de novo por trecho: o
 *    par de studs da junta (fechamento em `b − t`, primeiro stud do seguinte em `b`), cripples, blocos,
 *    validações e avisos saem por painel, sem remendo no painel inteiro.
 * 4. `splicePlates` emenda as plates mais longas que o maior `config.stockLengths` (P14) e `panelWeight`
 *    estima o peso (P8; com a chapa, S38 — cada trecho monta as suas chapas, que acabam na junta, P49). Painel acima de `config.panel.maxWeight` só pelo peso real (a escolha das quebras usa
 *    uma estimativa por trecho) ganha o aviso `PANEL_OVERWEIGHT`.
 * 5. Divisão automática com painel que não emenda (`SPLICE_NO_STUD`) é descartada (S43): o trecho sai da escolha e
 *    `chooseBreaks` dá a divisão seguinte pelo mesmo critério — inclusive dividir a parede que cabia num painel só.
 *    Sem divisão que emende, o erro é o da emenda da primeira escolha. Quebras forçadas não são trocadas.
 *
 * Ids (S16): `{level}-{wallId}-P{n}` — pavimento (`Wall.level`, default 1), parede e ordem do painel de start
 * para end, sempre com `-P1`, mesmo em parede de um painel só (`1-W01-P1`). `Panel.wallOffset` = `a`.
 */

import { DEFAULT_PANEL_CONFIG, DEFAULT_STOCK_LENGTHS, studLengthFor, type Config, type PanelConfig } from '../config';
import { EPS, isCount } from '../eps';
import { span } from '../geom';
import { isPlateRole, type Panel } from '../panel';
import type { EndJoint, Wall, WallJoints } from '../wall';
import type { HeaderTable } from '../rules/headers';
import type { HeaderTables, ResolvedHeader } from '../rules/openingHeader';
import { blockingForSegment } from '../rules/blocking';
import { postsForSegment } from '../rules/posts';
import { teeStrips, type TeeStrip } from '../rules/corners';
import { breakCandidates, chooseBreaks, forcedBreaks, validatePanelConfig, whyNotBreak } from '../rules/breaks';
import { lapEnd, type LapObstacle } from '../rules/laps';
import { splicePlates, supportCenters } from '../rules/splice';
import { layoutMarks } from '../rules/studs';
import { memberWeightLb, panelWeight } from '../rules/weight';
import { EngineError, warning } from '../messages';
import { framePanel, nudgeWall, resolveHeaders } from './panelizeWall';

/**
 * @param tables tabelas injetadas (testes), como em `panelizeWall`
 * @throws RangeError os de `panelizeWall`; sem divisão possível; lap sem lugar; plate sem stud para emendar
 */
export function splitWall(given: Wall, config: Config, tables?: readonly HeaderTable[] | HeaderTables): Panel[] {
  return splitWallWithCandidates(given, config, tables).panels;
}

/** Painéis de `splitWall` e os candidatos a quebra que a divisão usou (S29). */
export interface WallSplit {
  panels: Panel[];
  /** Os de `wallBreakCandidates`, em x da parede, crescentes — do mesmo painel inteiro que a divisão montou. */
  candidates: number[];
}

/**
 * `splitWall` mais os candidatos a quebra, sem montar a parede inteira de novo (o editor mostra os dois a cada
 * checagem). Os painéis são os mesmos de `splitWall`.
 *
 * @throws RangeError os de `splitWall`
 */
export function splitWallWithCandidates(given: Wall, config: Config, tables?: readonly HeaderTable[] | HeaderTables): WallSplit {
  // O header não depende da posição da abertura: resolvido uma vez, vale no deslocamento, na parede inteira e
  // em cada trecho (na ordem de `wall.openings`, que nenhum passo reordena).
  const headers = resolveHeaders(given, config, tables);
  const nudged = nudgeWall(given, config, tables, headers);
  const { panels, candidates } = splitNudged(nudged.wall, config, tables, headers);
  // Aviso do deslocamento (P40) no painel que ficou com a abertura.
  for (const { offset, warning } of nudged.warnings) {
    const p = panels.find((q) => offset >= q.wallOffset - EPS && offset < q.wallOffset + q.length - EPS) ?? panels[0]!;
    p.warnings.unshift(warning);
  }
  return { panels, candidates };
}

function splitNudged(
  wall: Wall,
  config: Config,
  tables: readonly HeaderTable[] | HeaderTables | undefined,
  headers: readonly ResolvedHeader[],
): WallSplit {
  const cfg = config.panel ?? DEFAULT_PANEL_CONFIG;
  validatePanelConfig(cfg);
  const stock = config.stockLengths ?? DEFAULT_STOCK_LENGTHS;
  const level = wall.level ?? 1;
  if (!isCount(level)) {
    throw new EngineError('VALUE_NOT_COUNT', { wallId: wall.id }, { field: 'level', value: level });
  }

  const { panel: whole, plan } = framePanel(wall, config, tables, headers);
  const strips = teeStrips(wall.joints);
  const origin = wall.layoutOrigin ?? 0;
  const ctx = { zones: plan.zones, strips };
  const candidates = breakCandidates(whole, config, ctx);
  if (wall.panelBreaks !== undefined) {
    const forced = forcedBreaks(
      wall.panelBreaks,
      { length: wall.length, reject: (x) => whyNotBreak(x, whole, config, ctx), wallId: wall.id },
      cfg,
    );
    // A lista do revisor não é trocada: trecho que não emenda é o erro da emenda.
    try {
      return { panels: panelsAt(forced, wall, whole, config, tables, headers, strips, stock, level, cfg), candidates };
    } catch (e) {
      throw e instanceof UnspliceableSegment ? e.error : e;
    }
  }
  const isModule = (c: number): boolean => {
    const k = (c - origin) / cfg.module;
    return Math.abs(k - Math.round(k)) < 1e-6;
  };
  // Divisão com painel que não emenda é descartada (S43): o trecho sai da escolha e vale a divisão seguinte pelo
  // mesmo critério. Cada volta descarta um trecho novo, logo termina.
  const rejected: [number, number][] = [];
  let firstError: EngineError | undefined;
  for (;;) {
    let breaks: number[];
    try {
      breaks = chooseBreaks(
        {
          length: wall.length,
          candidates,
          isModule,
          wallId: wall.id,
          ...(cfg.maxWeight === undefined ? {} : { weightOf: (a: number, b: number) => estimateWeight(whole, a, b, config, cfg) }),
          ...(rejected.length === 0
            ? {}
            : { rejected: (a: number, b: number) => rejected.some(([x, y]) => Math.abs(x - a) < EPS && Math.abs(y - b) < EPS) }),
        },
        cfg,
      );
    } catch (e) {
      // Nenhuma divisão emenda: o erro que o revisor resolve é o da emenda (estoque maior ou quebra à mão).
      if (firstError !== undefined && e instanceof EngineError && e.code === 'CANNOT_SPLIT') throw firstError;
      throw e;
    }
    try {
      return { panels: panelsAt(breaks, wall, whole, config, tables, headers, strips, stock, level, cfg), candidates };
    } catch (e) {
      if (!(e instanceof UnspliceableSegment)) throw e;
      firstError ??= e.error;
      rejected.push([e.a, e.b]);
    }
  }
}

/** O trecho `[a, b]` da parede tem plate acima do estoque sem stud onde emendar (`SPLICE_NO_STUD`). */
class UnspliceableSegment extends Error {
  readonly a: number;
  readonly b: number;
  readonly error: EngineError;
  constructor(a: number, b: number, error: EngineError) {
    super(error.message);
    this.a = a;
    this.b = b;
    this.error = error;
  }
}

/** Os painéis da parede com as quebras dadas: lap da double top em cada junta, trechos, emendas e peso. */
function panelsAt(
  breaks: readonly number[],
  wall: Wall,
  whole: Panel,
  config: Config,
  tables: readonly HeaderTable[] | HeaderTables | undefined,
  headers: readonly ResolvedHeader[],
  strips: readonly TeeStrip[],
  stock: readonly number[],
  level: number,
  cfg: PanelConfig,
): Panel[] {
  const origin = wall.layoutOrigin ?? 0;
  // Emenda impossível sai com o trecho, para a escolha automática descartar a divisão (S43).
  const finishAt = (panel: Panel, a: number, b: number): Panel => {
    try {
      return finish(panel, wall.id, a, stock, cfg);
    } catch (e) {
      if (e instanceof EngineError && e.code === 'SPLICE_NO_STUD') throw new UnspliceableSegment(a, b, e);
      throw e;
    }
  };
  if (breaks.length === 0) return [finishAt({ ...whole, id: panelId(level, wall.id, 1), level }, 0, wall.length)];

  const marks = [...new Set([...layoutMarks(wall.length, config.studSpacing, origin), ...supportCenters(whole.members)])].sort(
    (a, b) => a - b,
  );
  const obstacles: LapObstacle[] = [
    ...whole.members
      .filter((m) => m.role === 'header')
      .map((m) => ({ ...span(m), kind: 'header' as const, x: m.x })),
    ...strips.map((s) => ({ lo: s.lo, hi: s.hi, kind: 'tee' as const, ...(s.wallId === undefined ? {} : { wallId: s.wallId }) })),
  ];
  const doubleTopEnd = Math.max(...whole.members.filter((m) => m.role === 'doubleTopPlate').map((m) => m.x + m.length));
  const lapEnds = breaks.map((b, i) => lapEnd(b, i + 1 < breaks.length ? breaks[i + 1]! : doubleTopEnd, cfg, obstacles, marks));

  const bounds = [0, ...breaks, wall.length];
  const n = breaks.length + 1;
  const ids = bounds.slice(1).map((_, i) => panelId(level, wall.id, i + 1));
  return bounds.slice(1).map((b, i) => {
    const a = bounds[i]!;
    const segment = segmentWall(wall, headers, a, b, {
      first: i === 0,
      last: i === n - 1,
      lapIn: i === 0 ? undefined : lapEnds[i - 1]! - a,
      lapOut: i === n - 1 ? undefined : lapEnds[i]! - b,
      prevId: ids[i - 1],
      nextId: ids[i + 1],
      strips,
    });
    const { panel } = framePanel(segment.wall, config, tables, segment.headers);
    return finishAt({ ...panel, id: ids[i]!, wallId: wall.id, level }, a, b);
  });
}

/** Id do painel `n` (1-based, de start para end) da parede `wallId` no pavimento `level`: `1-W01-P2`. */
export function panelId(level: number, wallId: string, n: number): string {
  return `${level}-${wallId}-P${n}`;
}

interface SegmentOptions {
  first: boolean;
  last: boolean;
  /** Recuo da double top no início (lap do painel anterior), em x do trecho. */
  lapIn: number | undefined;
  /** Avanço da double top no fim, além de `b`. */
  lapOut: number | undefined;
  prevId: string | undefined;
  nextId: string | undefined;
  strips: readonly TeeStrip[];
}

/** A `Wall` do trecho `[a, b]` da parede, com os headers das aberturas que ficaram nele (mesma ordem). */
function segmentWall(
  wall: Wall,
  headers: readonly ResolvedHeader[],
  a: number,
  b: number,
  o: SegmentOptions,
): { wall: Wall; headers: ResolvedHeader[] } {
  const inside = (x: number): boolean => x >= a - EPS && x < b - EPS;
  const kept = wall.openings.flatMap((op, i) => (inside(op.offset) ? [i] : []));
  const openings = kept.map((i) => ({ ...wall.openings[i]!, offset: wall.openings[i]!.offset - a }));
  const segment: Wall = {
    ...wall,
    length: b - a,
    openings,
    layoutOrigin: (wall.layoutOrigin ?? 0) - a,
  };
  delete segment.panelBreaks;
  if (wall.extraStuds !== undefined) {
    segment.extraStuds = wall.extraStuds.filter((e) => inside(e.x)).map((e) => ({ ...e, x: e.x - a }));
  }
  // Posts (S37): nunca atravessam a quebra (são peça na faixa da junta), logo cada um fica inteiro num trecho.
  if (wall.posts !== undefined) segment.posts = postsForSegment(wall.posts, a, b);
  // Fileiras por altura (S36): trecho deslocado e cortado ao painel; cada painel gera a sua fileira.
  if (wall.blocking !== undefined) segment.blocking = blockingForSegment(wall.blocking, a, b);

  const joints: WallJoints = {};
  const start: EndJoint | undefined = o.first
    ? wall.joints?.start
    : { kind: 'panel', lap: o.lapIn!, ...(o.prevId === undefined ? {} : { panelId: o.prevId }) };
  let end: EndJoint | undefined = o.last ? wall.joints?.end : undefined;
  if (!o.last) {
    // Faixas de T do painel seguinte que caem no trecho avançado da double top: o vão é cortado aqui.
    const lapHi = b + o.lapOut!;
    const cuts = o.strips
      .filter((s) => s.lo >= b - EPS && s.hi <= lapHi + EPS)
      .map((s) => ({ x: s.lo - a, width: s.hi - s.lo }));
    end = {
      kind: 'panel',
      lap: o.lapOut!,
      ...(cuts.length > 0 ? { cuts } : {}),
      ...(o.nextId === undefined ? {} : { panelId: o.nextId }),
    };
  }
  if (start !== undefined) joints.start = start;
  if (end !== undefined) joints.end = end;
  const tees = (wall.joints?.tees ?? []).filter((t) => inside(t.x)).map((t) => ({ ...t, x: t.x - a }));
  if (tees.length > 0) joints.tees = tees;
  if (Object.keys(joints).length > 0) segment.joints = joints;
  else delete segment.joints;
  return { wall: segment, headers: kept.map((i) => headers[i]!) };
}

/** Emendas, peso, offset e aviso de peso. */
function finish(panel: Panel, wallId: string, wallOffset: number, stock: readonly number[], cfg: PanelConfig): Panel {
  const spliced = splicePlates(panel, stock, cfg, wallId);
  const weightLb = panelWeight(spliced);
  const warnings = [...spliced.warnings];
  if (cfg.maxWeight !== undefined && weightLb > cfg.maxWeight + EPS) {
    warnings.push(warning('PANEL_OVERWEIGHT', { wallId }, { panelId: panel.id, weight: weightLb, max: cfg.maxWeight }));
  }
  return { ...spliced, warnings, wallOffset, weightLb };
}

/**
 * Peso estimado do trecho `[a, b]` do painel da parede inteira, para escolher as quebras: peças verticais e
 * horizontais curtas pelo centro; plates pela fração dentro do trecho; mais o stud extra da junta e o lap da
 * double top (que o trecho da esquerda ganha e o da direita perde). Só difere do peso real quando o lap é
 * encurtado por um obstáculo (o painel seguinte fica com mais double top) — daí o aviso `PANEL_OVERWEIGHT`.
 */
function estimateWeight(whole: Panel, a: number, b: number, config: Config, cfg: PanelConfig): number {
  let total = 0;
  for (const m of whole.members) {
    const { lo, hi } = span(m);
    if (isPlateRole(m.role)) {
      const inside = Math.min(hi, b) - Math.max(lo, a);
      if (inside > EPS) total += memberWeightLb(m) * (inside / (hi - lo));
    } else {
      const c = (lo + hi) / 2;
      if (c >= a - EPS && c < b - EPS) total += memberWeightLb(m);
    }
  }
  const lapWeight = memberWeightLb({ section: whole.section, length: cfg.lap });
  const studWeight = memberWeightLb({ section: whole.section, length: studLengthFor(whole, config) });
  if (b < whole.length - EPS) total += studWeight + lapWeight;
  // Chapa (S38): pela fração do comprimento (o avanço de canto é pequeno perto do painel).
  if (whole.sheathing !== undefined) total += whole.sheathing.weightLb * ((b - a) / whole.length);
  if (a > EPS) total -= lapWeight;
  return total;
}

/**
 * Candidatos a quebra da parede (S29), em x da parede, crescentes — o que o editor oferece para arrastar a
 * quebra. Mesmo cálculo de `splitWall` (deslocamento P40, painel inteiro, zonas e faixas de T); quem também
 * divide a parede usa `splitWallWithCandidates`, que não monta a parede inteira duas vezes. Este serve quando a
 * divisão falha (a quebra forçada recusada continua corrigível).
 *
 * @throws RangeError os de `panelizeWall`
 */
export function wallBreakCandidates(given: Wall, config: Config, tables?: readonly HeaderTable[] | HeaderTables): number[] {
  const headers = resolveHeaders(given, config, tables);
  const { wall } = nudgeWall(given, config, tables, headers);
  const { panel, plan } = framePanel(wall, config, tables, headers);
  return breakCandidates(panel, config, { zones: plan.zones, strips: teeStrips(wall.joints) });
}
