/**
 * Sheathing (OSB/plywood) por painel (S38; hipóteses P47, P48, P49, P52; P8 revista).
 *
 * Regras (docs/02-framing.md, 04-decisoes 2026-11-05):
 * - **Quem leva chapa** (`resolveSheathing`): `wall.sheathing` (`true`/`false`/objeto) ou, sem ele, o do tipo de parede
 *   (`resolveWallType` já o copiou para a parede); sem nenhum dos dois, `config.sheathing` liga as paredes de
 *   `config.sheathing.walls` (default: as externas). Sem `config.sheathing` e sem pedido da parede, nada muda no
 *   painel. O que a parede ou o tipo dão como objeto vai por cima de `config.sheathing`, que vai por cima de
 *   `DEFAULT_SHEATHING` (7/16", 48×96, face exterior, avanço de canto automático, 8d @ 6"/12").
 * - **Chapas verticais a partir da marca 0 do prédio**: as bordas das chapas caem em `layoutOrigin + k·width` — as
 *   mesmas marcas em que os studs são centrados (P19), logo a emenda vertical cai no centro de um stud. Cada coluna é
 *   cortada nas pontas da área coberta; as fileiras sobem de baixo (`y` = −`floorBottom`) com a altura da chapa e a
 *   última é cortada no topo (`height + floorTop`; hipótese P52: a sobra vira uma tira, mesmo fina).
 * - **Pontas** (hipótese P47, revista na S38): na junta de painéis da mesma parede a chapa acaba no painel (P49); na
 *   ponta livre e no T (esta parede encosta no meio da outra), na ponta da plate; no T e no + da parede atravessada a
 *   chapa é contínua (as faixas do T não a cortam). **No canto em L**, a face do ângulo de fora: a parede que
 *   **encosta** avança a chapa sobre a ponta da que atravessa (`overhang.corner`: `'auto'` = `t_outra`, lido de
 *   `wall.joints`) — é a única cuja plate para antes da quina (a da que atravessa já chega à face externa da outra,
 *   P21) e é assim que a primeira chapa começa na marca 0 (`layoutOrigin = −t_outra`); a que atravessa não avança. No
 *   canto de dentro (`EndJoint.concave`, só na parede externa com lado de fora conhecido) o ângulo de fora é a face
 *   interior. A face do ângulo de dentro nunca avança.
 * - **Linha de piso**: `floorTop` acima da double top e `floorBottom` abaixo da bottom plate, só na face exterior
 *   (Matilda: 12–24"); a folha pede "engineer to verify" quando houver avanço.
 * - **Emenda horizontal** (parede mais alta que a chapa): fileira de blocking por altura (S36) gerada aqui, com o centro
 *   na emenda (cada chapa apoia 3/4"), uso `SHEATHING_JOINT_LABEL`; emenda sobre a bottom plate ou sobre as top plates
 *   não pede bloco, e fora da parede (no avanço de piso) também não. Vão em zona de abertura ou de ladder é pulado com o
 *   aviso de sempre (`BLOCKING_SKIPPED`).
 * - **Área e peso**: área instalada = área coberta de cada face menos o RO das aberturas; peso = área ×
 *   `SHEATHING_PSF_PER_INCH` × espessura (P8 revista: 1.4 lb/pé² para 7/16"). Pedaço inteiramente dentro de um RO sai;
 *   pedaço menor que a chapa ou com vão recortado leva `cut`.
 * - Pregação (P48) é texto da folha: vai em `PanelSheathing.nailing`, nunca vira geometria.
 */

import type { Config, SheathingFace, SheathingNailing, SheathingSide, SheathingSpec, SheathingWalls } from '../config';
import { EPS } from '../eps';
import { EngineError } from '../messages';
import type { PanelOpening, PanelSheathing, SheathingOverhangs, SheathingSheet } from '../panel';
import type { EndJoint, Wall } from '../wall';
import { blockingYRange, type ResolvedBlockingRow } from './blocking';
import { SHEATHING_PSF_PER_INCH } from './weight';

/** A chapa toda resolvida: nada opcional. */
export interface ResolvedSheathing {
  thickness: number;
  sheet: { width: number; height: number };
  side: SheathingSide;
  corner: 'auto' | number;
  floorTop: number;
  floorBottom: number;
  nailing: SheathingNailing;
}

/** Defaults da chapa (P47, P48): OSB 7/16" 4×8 de pé na face exterior, avanço de canto automático, 8d @ 6"/12". */
export const DEFAULT_SHEATHING: Readonly<ResolvedSheathing> = {
  thickness: 0.4375,
  sheet: { width: 48, height: 96 },
  side: 'exterior',
  corner: 'auto',
  floorTop: 0,
  floorBottom: 0,
  nailing: { nail: '8d', edge: 6, field: 12 },
};

/** Paredes que `config.sheathing` liga sem pedido da parede: as externas (S38). */
export const DEFAULT_SHEATHING_WALLS: SheathingWalls = 'exterior';

/** Uso da fileira de blocking gerada na emenda horizontal das chapas (S38). */
export const SHEATHING_JOINT_LABEL = 'Sheathing joint';

/** As faces de um lado, exterior primeiro. */
export function sheathingFaces(side: SheathingSide): SheathingFace[] {
  return side === 'both' ? ['exterior', 'interior'] : [side];
}

/** lb por pé² da chapa de espessura `thickness` (P8 revista). */
export function sheathingPsf(thickness: number): number {
  return SHEATHING_PSF_PER_INCH * thickness;
}

/** Uma camada por cima da outra (objetos aninhados campo a campo). */
function layer(base: ResolvedSheathing, s: SheathingSpec | undefined): ResolvedSheathing {
  if (s === undefined) return base;
  return {
    thickness: s.thickness ?? base.thickness,
    sheet: { width: s.sheet?.width ?? base.sheet.width, height: s.sheet?.height ?? base.sheet.height },
    side: s.side ?? base.side,
    corner: s.overhang?.corner ?? base.corner,
    floorTop: s.overhang?.floorTop ?? base.floorTop,
    floorBottom: s.overhang?.floorBottom ?? base.floorBottom,
    nailing: {
      nail: s.nailing?.nail ?? base.nailing.nail,
      edge: s.nailing?.edge ?? base.nailing.edge,
      field: s.nailing?.field ?? base.nailing.field,
    },
  };
}

/** @throws EngineError `SHEATHING_INVALID` medida fora da faixa ou prego vazio */
function checked(r: ResolvedSheathing, wallId: string): ResolvedSheathing {
  const fail = (field: string, value: number | string): never => {
    throw new EngineError('SHEATHING_INVALID', { wallId }, { field, value });
  };
  const positive: [string, number][] = [
    ['thickness', r.thickness],
    ['sheet.width', r.sheet.width],
    ['sheet.height', r.sheet.height],
    ['nailing.edge', r.nailing.edge],
    ['nailing.field', r.nailing.field],
  ];
  for (const [field, v] of positive) if (!Number.isFinite(v) || v <= 0) fail(field, v);
  const nonNegative: [string, number][] = [
    ['overhang.floorTop', r.floorTop],
    ['overhang.floorBottom', r.floorBottom],
    ...(r.corner === 'auto' ? [] : ([['overhang.corner', r.corner]] as [string, number][])),
  ];
  for (const [field, v] of nonNegative) if (!Number.isFinite(v) || v < 0) fail(field, v);
  if (r.nailing.nail.trim() === '') fail('nailing.nail', r.nailing.nail);
  return r;
}

/**
 * A chapa da parede, ou `undefined` quando ela não leva. Não olha o tipo de parede: quem completa `wall.sheathing` com o
 * do tipo é `resolveWallType`.
 *
 * @throws EngineError `SHEATHING_INVALID`
 */
export function resolveSheathing(
  wall: Pick<Wall, 'id' | 'exterior' | 'sheathing'>,
  config: Pick<Config, 'sheathing'>,
): ResolvedSheathing | undefined {
  const own = wall.sheathing;
  if (own === false) return undefined;
  const project = config.sheathing;
  if (own === undefined) {
    if (project === undefined) return undefined;
    const walls = project.walls ?? DEFAULT_SHEATHING_WALLS;
    if (walls === 'none' || (walls === 'exterior' && !wall.exterior)) return undefined;
  }
  const merged = layer(layer({ ...DEFAULT_SHEATHING }, project), typeof own === 'object' ? own : undefined);
  return checked(merged, wall.id);
}

/** Avanço de uma ponta numa face: só o canto em L, na face do ângulo de fora, pela parede que encosta. */
function endOverhang(j: EndJoint | undefined, face: SheathingFace, spec: ResolvedSheathing): number {
  if (j?.kind !== 'corner' || j.through) return 0;
  const outerFace: SheathingFace = j.concave === true ? 'interior' : 'exterior';
  if (face !== outerFace) return 0;
  return spec.corner === 'auto' ? j.otherThickness : spec.corner;
}

/** Avanços de uma face além do contorno do painel. */
export function faceOverhangs(
  wall: Pick<Wall, 'joints'>,
  face: SheathingFace,
  spec: ResolvedSheathing,
): SheathingOverhangs {
  return {
    start: endOverhang(wall.joints?.start, face, spec),
    end: endOverhang(wall.joints?.end, face, spec),
    top: face === 'exterior' ? spec.floorTop : 0,
    bottom: face === 'exterior' ? spec.floorBottom : 0,
  };
}

/** Arredonda ruído de ponto flutuante (as medidas da obra vão a 1/16"; aqui, a 1e-6). */
const tidy = (v: number): number => Math.round(v * 1e6) / 1e6;

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** O RO de uma abertura do painel, como retângulo. */
function roRect(o: PanelOpening): Rect {
  return { x0: o.x, x1: o.x + o.width, y0: o.top - o.height, y1: o.top };
}

/** Área da interseção de dois retângulos (0 quando só encostam). */
function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > EPS && h > EPS ? w * h : 0;
}

/** Área coberta de uma face, em x/y do painel. */
function coverage(length: number, height: number, o: SheathingOverhangs): Rect {
  return { x0: -o.start, x1: length + o.end, y0: -o.bottom, y1: height + o.top };
}

/**
 * Pedaços de chapa de uma face: colunas nas marcas `origin + k·width`, fileiras de baixo para cima; da esquerda para a
 * direita e, em cada coluna, de baixo para cima.
 */
export function faceSheets(
  face: SheathingFace,
  area: Rect,
  origin: number,
  sheet: { width: number; height: number },
  openings: readonly PanelOpening[],
): SheathingSheet[] {
  const { width: W, height: H } = sheet;
  const ros = openings.map(roRect);
  const out: SheathingSheet[] = [];
  const k0 = Math.floor((area.x0 - origin) / W + EPS);
  for (let k = k0; origin + k * W < area.x1 - EPS; k++) {
    const x = Math.max(area.x0, origin + k * W);
    const xr = Math.min(area.x1, origin + (k + 1) * W);
    if (xr - x <= EPS) continue;
    for (let r = 0; area.y0 + r * H < area.y1 - EPS; r++) {
      const y = area.y0 + r * H;
      const yt = Math.min(area.y1, y + H);
      const rect: Rect = { x0: x, x1: xr, y0: y, y1: yt };
      const pieceArea = (xr - x) * (yt - y);
      const holes = ros.reduce((sum, ro) => sum + overlapArea(rect, ro), 0);
      if (holes >= pieceArea - EPS) continue;
      const cut = xr - x < W - EPS || yt - y < H - EPS || holes > EPS;
      out.push({ face, x: tidy(x), y: tidy(y), w: tidy(xr - x), h: tidy(yt - y), ...(cut ? { cut: true as const } : {}) });
    }
  }
  return out;
}

/**
 * As chapas do painel (S38): pedaços de cada face, avanços, área instalada, peso e pregação.
 *
 * @param openings aberturas do painel (`Panel.openings`): o RO sai da área e do peso
 */
export function panelSheathing(
  wall: Pick<Wall, 'length' | 'height' | 'layoutOrigin' | 'joints'>,
  spec: ResolvedSheathing,
  openings: readonly PanelOpening[],
): PanelSheathing {
  const origin = wall.layoutOrigin ?? 0;
  const sheets: SheathingSheet[] = [];
  const overhang: Partial<Record<SheathingFace, SheathingOverhangs>> = {};
  let areaSqIn = 0;
  for (const face of sheathingFaces(spec.side)) {
    const o = faceOverhangs(wall, face, spec);
    overhang[face] = o;
    const area = coverage(wall.length, wall.height, o);
    sheets.push(...faceSheets(face, area, origin, spec.sheet, openings));
    const holes = openings.reduce((sum, op) => sum + overlapArea(area, roRect(op)), 0);
    areaSqIn += (area.x1 - area.x0) * (area.y1 - area.y0) - holes;
  }
  const areaSqFt = Math.round((areaSqIn / 144) * 100) / 100;
  return {
    side: spec.side,
    thickness: spec.thickness,
    sheet: { ...spec.sheet },
    sheets,
    overhang,
    areaSqFt,
    weightLb: Math.round(areaSqFt * sheathingPsf(spec.thickness) * 10) / 10,
    nailing: { ...spec.nailing },
  };
}

/**
 * Fileiras de blocking das emendas horizontais (S38): uma por altura de emenda que cai na cavidade (entre a bottom
 * plate e as top plates), com o centro na emenda — encostado à plate quando a emenda fica a menos de meio bloco dela.
 * `index` −1: não vem de `wall.blocking` (não há erro de item a apontar).
 */
export function sheathingJointRows(
  wall: Pick<Wall, 'height' | 'joints'>,
  spec: ResolvedSheathing,
  config: Pick<Config, 'plateThickness' | 'studThickness'>,
): ResolvedBlockingRow[] {
  const { min, max } = blockingYRange(wall.height, config);
  const lo = config.plateThickness;
  const hi = wall.height - 2 * config.plateThickness;
  const centers = new Set<number>();
  for (const face of sheathingFaces(spec.side)) {
    const o = faceOverhangs(wall, face, spec);
    const y0 = -o.bottom;
    const y1 = wall.height + o.top;
    for (let k = 1; y0 + k * spec.sheet.height < y1 - EPS; k++) {
      const seam = y0 + k * spec.sheet.height;
      // Sobre a bottom plate, sobre as top plates ou fora da parede (avanço de piso): a plate ou o piso apoiam.
      if (seam <= lo + EPS || seam >= hi - EPS) continue;
      centers.add(tidy(Math.min(max, Math.max(min, seam))));
    }
  }
  return [...centers].sort((a, b) => a - b).map((y) => ({ y, label: SHEATHING_JOINT_LABEL, index: -1 }));
}
