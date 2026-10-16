/**
 * Painéis transportáveis de uma parede (S15): divide, dá o lap da double top entre painéis, emenda plates
 * acima do estoque e estima o peso.
 *
 * Como funciona:
 * 1. `panelizeWall` monta a parede inteira; dela saem os candidatos a quebra (`rules/split.ts`), as zonas de
 *    abertura e as faixas de T.
 * 2. `chooseBreaks` escolhe as quebras (hipótese P35: menor número de painéis, depois o mais equilibrado,
 *    preferindo marcas múltiplas de `config.panel.module`). Sem quebra, o painel da parede inteira é o painel.
 * 3. Cada trecho `[a, b]` vira uma `Wall` própria — comprimento `b − a`, aberturas, studs extras e T
 *    deslocados de `−a`, `layoutOrigin = origem − a` — com a junta como ligação `{ kind: 'panel', lap }` nas
 *    pontas internas (o painel i avança o lap, o i+1 recua; `rules/corners.ts`). As ligações da parede com as
 *    vizinhas (canto, T) ficam só no primeiro e no último trecho. `panelizeWall` roda de novo por trecho: o
 *    par de studs da junta (fechamento em `b − t`, primeiro stud do seguinte em `b`), cripples, blocos,
 *    validações e avisos saem por painel, sem remendo no painel inteiro.
 * 4. `splicePlates` emenda as plates mais longas que o maior `config.stockLengths` (P14) e `panelWeight`
 *    estima o peso (P8). Painel acima de `config.panel.maxWeight` só pelo peso real (a escolha das quebras usa
 *    uma estimativa por trecho) ganha o aviso `PANEL_OVERWEIGHT`.
 *
 * Ids (S16): `{level}-{wallId}-P{n}` — pavimento (`Wall.level`, default 1), parede e ordem do painel de start
 * para end, sempre com `-P1`, mesmo em parede de um painel só (`1-W01-P1`). `Panel.wallOffset` = `a`.
 */

import {
  DEFAULT_PANEL_CONFIG,
  DEFAULT_STOCK_LENGTHS,
  type Config,
  type EndJoint,
  type Member,
  type Panel,
  type PanelConfig,
  type Wall,
  type WallJoints,
} from '../types';
import type { HeaderTable } from '../rules/headers';
import type { HeaderTables } from '../rules/openingHeader';
import { teeStrips, type TeeStrip } from '../rules/corners';
import {
  breakCandidates,
  chooseBreaks,
  lapEnd,
  layoutMarks,
  memberSpan,
  splicePlates,
  supportCenters,
  validatePanelConfig,
  type LapObstacle,
} from '../rules/split';
import { memberWeightLb, panelWeight } from '../rules/weight';
import { nudgeWall, panelizeWall, planOpenings } from './panelizeWall';

const EPS = 1e-9;

/**
 * @param tables tabelas injetadas (testes), como em `panelizeWall`
 * @throws RangeError os de `panelizeWall`; sem divisão possível; lap sem lugar; plate sem stud para emendar
 */
export function splitWall(given: Wall, config: Config, tables?: readonly HeaderTable[] | HeaderTables): Panel[] {
  const nudged = nudgeWall(given, config, tables);
  const panels = splitNudged(nudged.wall, config, tables);
  // Aviso do deslocamento (P40) no painel que ficou com a abertura.
  for (const { offset, warning } of nudged.warnings) {
    const p = panels.find((q) => offset >= (q.wallOffset ?? 0) - EPS && offset < (q.wallOffset ?? 0) + q.length - EPS) ?? panels[0]!;
    p.warnings.unshift(warning);
  }
  return panels;
}

function splitNudged(wall: Wall, config: Config, tables?: readonly HeaderTable[] | HeaderTables): Panel[] {
  const cfg = config.panel ?? DEFAULT_PANEL_CONFIG;
  validatePanelConfig(cfg);
  const stock = config.stockLengths ?? DEFAULT_STOCK_LENGTHS;
  const level = wall.level ?? 1;
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`parede ${wall.id}: level deve ser inteiro ≥ 1 (recebido ${level})`);
  }

  const whole = panelizeWall(wall, config, tables);
  const { plan } = planOpenings(wall, config, tables);
  const strips = teeStrips(wall.joints);
  const origin = wall.layoutOrigin ?? 0;
  const candidates = breakCandidates(whole, config, { zones: plan.zones, strips });
  const isModule = (c: number): boolean => {
    const k = (c - origin) / cfg.module;
    return Math.abs(k - Math.round(k)) < 1e-6;
  };
  const breaks = chooseBreaks(
    {
      length: wall.length,
      candidates,
      isModule,
      wallId: wall.id,
      ...(cfg.maxWeight === undefined ? {} : { weightOf: (a: number, b: number) => estimateWeight(whole, a, b, config, cfg) }),
    },
    cfg,
  );

  if (breaks.length === 0) return [finish({ ...whole, id: panelId(level, wall.id, 1), level }, wall.id, 0, stock, cfg)];

  const marks = [...new Set([...layoutMarks(wall.length, config.studSpacing, origin), ...supportCenters(whole.members)])].sort(
    (a, b) => a - b,
  );
  const obstacles: LapObstacle[] = [
    ...whole.members
      .filter((m) => m.role === 'header')
      .map((m) => ({ ...memberSpan(m), what: `o header em x=${m.x}` })),
    ...strips.map((s) => ({ lo: s.lo, hi: s.hi, what: `a faixa do T${s.wallId === undefined ? '' : ` da parede ${s.wallId}`}` })),
  ];
  const doubleTopEnd = Math.max(...whole.members.filter((m) => m.role === 'doubleTopPlate').map((m) => m.x + m.length));
  const lapEnds = breaks.map((b, i) => lapEnd(b, i + 1 < breaks.length ? breaks[i + 1]! : doubleTopEnd, cfg, obstacles, marks));

  const bounds = [0, ...breaks, wall.length];
  const n = breaks.length + 1;
  const ids = bounds.slice(1).map((_, i) => panelId(level, wall.id, i + 1));
  return bounds.slice(1).map((b, i) => {
    const a = bounds[i]!;
    const segment = segmentWall(wall, a, b, {
      first: i === 0,
      last: i === n - 1,
      lapIn: i === 0 ? undefined : lapEnds[i - 1]! - a,
      lapOut: i === n - 1 ? undefined : lapEnds[i]! - b,
      prevId: ids[i - 1],
      nextId: ids[i + 1],
      strips,
    });
    const panel = panelizeWall(segment, config, tables);
    return finish({ ...panel, id: ids[i]!, wallId: wall.id, level }, wall.id, a, stock, cfg);
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

/** A `Wall` do trecho `[a, b]` da parede. */
function segmentWall(wall: Wall, a: number, b: number, o: SegmentOptions): Wall {
  const inside = (x: number): boolean => x >= a - EPS && x < b - EPS;
  const openings = wall.openings.filter((op) => inside(op.offset)).map((op) => ({ ...op, offset: op.offset - a }));
  const segment: Wall = {
    ...wall,
    length: b - a,
    openings,
    layoutOrigin: (wall.layoutOrigin ?? 0) - a,
  };
  if (wall.extraStuds !== undefined) {
    segment.extraStuds = wall.extraStuds.filter((e) => inside(e.x)).map((e) => ({ ...e, x: e.x - a }));
  }

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
  return segment;
}

/** Emendas, peso, offset e aviso de peso. */
function finish(panel: Panel, wallId: string, wallOffset: number, stock: readonly number[], cfg: PanelConfig): Panel {
  const spliced = splicePlates(panel, stock, cfg, wallId);
  const weightLb = panelWeight(spliced);
  const warnings = [...spliced.warnings];
  if (cfg.maxWeight !== undefined && weightLb > cfg.maxWeight + EPS) {
    warnings.push({
      code: 'PANEL_OVERWEIGHT',
      message:
        `painel ${panel.id}: peso estimado de ${weightLb} lb passa do máximo de ${cfg.maxWeight} lb ` +
        '(config.panel.maxWeight) e não há quebra que resolva — confira com a fábrica',
    });
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
    const { lo, hi } = memberSpan(m);
    if (isPlate(m)) {
      const inside = Math.min(hi, b) - Math.max(lo, a);
      if (inside > EPS) total += memberWeightLb(m) * (inside / (hi - lo));
    } else {
      const c = (lo + hi) / 2;
      if (c >= a - EPS && c < b - EPS) total += memberWeightLb(m);
    }
  }
  const lapWeight = memberWeightLb({ section: whole.section, length: cfg.lap });
  const studWeight = memberWeightLb({ section: whole.section, length: whole.height - 3 * config.plateThickness });
  if (b < whole.length - EPS) total += studWeight + lapWeight;
  if (a > EPS) total -= lapWeight;
  return total;
}

function isPlate(m: Member): boolean {
  return m.role === 'bottomPlate' || m.role === 'topPlate' || m.role === 'doubleTopPlate';
}
