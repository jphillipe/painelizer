/**
 * Geometria da planta para o canvas do editor (S21.2), sem painéis: cada parede como o motor a enquadra —
 * plates medidas pelo `frameWalls` do core (quem atravessa e quem encosta no canto, T) — e as aberturas como
 * vãos ao longo do eixo. Quando o core recusa a casa (paredes cruzadas, três pontas num ponto, fora do eixo),
 * a planta não some: cada parede cai no retângulo do próprio eixo ± t/2 (`framed: false`), e, com `lastGood`,
 * as paredes não citadas no erro mantêm as plates da última geometria válida (anti-flicker no arraste, S21.3).
 *
 * Coordenadas em polegadas de planta, y para cima. `Rect` é o canto mínimo mais largura e altura.
 * Única camada do cliente que importa `core` (com os demais módulos de `lib/editor`).
 */

import { axisOf, frameWalls, pointAt, sectionDepth, type Axis, type HouseWall, type Opening, type WallFrame } from 'core';
import { draftFormat, isPlanWall, type DraftFormat, type DraftOpening, type DraftWall, type Point, type ProjectDraft, type WallSection } from './draft';
import { idIndex, wallIdsIn, type IdIndex, type Issue } from './problems';
import { configFromDraft, resolveDraftOpening } from './resolve';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OpeningGeom {
  openingId: string;
  type: 'window' | 'door' | undefined;
  /** Borda esquerda e direita do RO ao longo do eixo, do `start` da parede. */
  s0: number;
  s1: number;
  /** Retângulo em planta (espessura da parede); ausente quando não há posição. */
  rect: Rect | undefined;
  /** Resolvida pelo core (tag, RO, posição). Falsa = desenhada tracejada com o que se sabe. */
  resolved: boolean;
  error?: string;
  form: 'center' | 'offset' | 'none';
}

export interface WallGeom {
  wallId: string;
  level: number;
  exterior: boolean;
  bearing: boolean;
  section: WallSection;
  thickness: number;
  dir: 'x' | 'y';
  sign: 1 | -1;
  start: Point;
  end: Point;
  /** Entre `start` e `end`. */
  length: number;
  /** Pontas da plate em planta: do `frameWalls` quando a casa fecha; senão = `start`/`end`. */
  plateStart: Point;
  plateEnd: Point;
  plateLength: number;
  rect: Rect;
  framed: boolean;
  openings: OpeningGeom[];
}

/** Parede que nem tem eixo (fora dos eixos, pontas coincidentes): desenhada como linha de erro. */
export interface BrokenWall {
  wallId: string;
  start: Point;
  end: Point;
  error: string;
}

export interface PlanGeometry {
  format: DraftFormat;
  walls: WallGeom[];
  broken: BrokenWall[];
  /** Caixa de tudo que se desenha; ausente sem paredes em planta. */
  bounds: Rect | undefined;
  /** Mensagem do core quando a casa não fecha (`frameWalls` lançou). */
  houseError: string | undefined;
  /** Paredes citadas em `houseError`. */
  houseErrorWalls: string[];
  levels: number[];
}

const DEFAULT_HEIGHT = 97.125;
const DEFAULT_RO_WIDTH = 36;

/** Geometria de toda a planta do draft. `lastGood` = geometria anterior, para manter plates no fallback. */
export function planGeometry(draft: ProjectDraft, lastGood?: PlanGeometry): PlanGeometry {
  const format = draftFormat(draft);
  const config = configFromDraft(draft);
  const axes = new Map<string, Axis>();
  const broken: BrokenWall[] = [];
  const houseWalls: HouseWall[] = [];
  const openingGeoms = new Map<string, OpeningGeom[]>();

  for (const w of draft.walls) {
    if (!isPlanWall(w) || w.start === undefined || w.end === undefined) continue;
    const resolved: Opening[] = [];
    const geoms: OpeningGeom[] = [];
    for (const o of w.openings) {
      const r = resolveDraftOpening(draft, o, config);
      if (r.ok) {
        resolved.push(r.opening);
        geoms.push({ openingId: o.id, type: r.opening.type, s0: r.opening.offset, s1: r.opening.offset + r.opening.roughWidth, rect: undefined, resolved: true, form: formOf(o) });
      } else {
        const width = o.roughWidth ?? DEFAULT_RO_WIDTH;
        const s0 = o.offset ?? (o.center === undefined ? undefined : o.center - width / 2);
        geoms.push({ openingId: o.id, type: o.type, s0: s0 ?? 0, s1: (s0 ?? 0) + width, rect: undefined, resolved: false, error: r.message, form: s0 === undefined ? 'none' : formOf(o) });
      }
    }
    const hw = toHouseWall(w, w.start, w.end, resolved);
    try {
      axes.set(w.id, axisOf(hw));
    } catch (e) {
      broken.push({ wallId: w.id, start: w.start, end: w.end, error: (e as Error).message });
      continue;
    }
    houseWalls.push(hw);
    openingGeoms.set(w.id, geoms);
  }

  let frames: Map<string, WallFrame> | undefined;
  let houseError: string | undefined;
  if (broken.length === 0) {
    try {
      frames = new Map(frameWalls({ walls: houseWalls }).map((f) => [f.wallId, f]));
    } catch (e) {
      houseError = (e as Error).message;
    }
  } else {
    houseError = broken[0]!.error;
  }
  const ids = idIndex(draft);
  const houseErrorWalls = houseError === undefined ? [] : wallIdsIn(houseError, ids);
  const lastByWall = new Map((lastGood?.walls ?? []).map((g) => [g.wallId, g]));

  const walls: WallGeom[] = houseWalls.map((hw) => {
    const axis = axes.get(hw.id)!;
    const frame = frames?.get(hw.id);
    let plateStart = hw.start;
    let plateEnd = hw.end;
    let framed = false;
    if (frame !== undefined) {
      plateStart = frame.plateStart;
      plateEnd = frame.plateEnd;
      framed = true;
    } else {
      const prev = lastByWall.get(hw.id);
      if (prev !== undefined && !houseErrorWalls.includes(hw.id) && samePoint(prev.start, hw.start) && samePoint(prev.end, hw.end) && prev.section === hw.section) {
        plateStart = prev.plateStart;
        plateEnd = prev.plateEnd;
        framed = prev.framed;
      }
    }
    const thickness = axis.thickness;
    const openings = (openingGeoms.get(hw.id) ?? []).map((g) => (g.form === 'none' ? g : { ...g, rect: segmentRect(pointAt(axis, g.s0), pointAt(axis, g.s1), thickness) }));
    return {
      wallId: hw.id,
      level: hw.level ?? 1,
      exterior: hw.exterior,
      bearing: hw.bearing,
      section: hw.section,
      thickness,
      dir: axis.dir,
      sign: axis.sign,
      start: hw.start,
      end: hw.end,
      length: axis.length,
      plateStart,
      plateEnd,
      plateLength: Math.hypot(plateEnd.x - plateStart.x, plateEnd.y - plateStart.y),
      rect: segmentRect(plateStart, plateEnd, thickness),
      framed,
      openings,
    };
  });

  const rects = [...walls.map((w) => w.rect), ...broken.map((b) => segmentRect(b.start, b.end, 1))];
  const levels = [...new Set(walls.map((w) => w.level))].sort((a, b) => a - b);
  return { format, walls, broken, bounds: union(rects), houseError, houseErrorWalls, levels };
}

function formOf(o: DraftOpening): 'center' | 'offset' | 'none' {
  return o.center !== undefined ? 'center' : o.offset !== undefined ? 'offset' : 'none';
}

/** `HouseWall` do core com defaults onde o draft está incompleto (altura e papel não mudam a planta). */
function toHouseWall(w: DraftWall, start: Point, end: Point, openings: Opening[]): HouseWall {
  const hw: HouseWall = {
    id: w.id,
    start,
    end,
    height: w.height ?? DEFAULT_HEIGHT,
    section: w.section ?? '2x4',
    exterior: w.exterior ?? false,
    bearing: w.bearing ?? false,
    openings,
  };
  if (w.ends !== undefined) hw.ends = w.ends;
  if (w.level !== undefined) hw.level = w.level;
  return hw;
}

/** Retângulo de um trecho de eixo (paralelo a x ou y) com a espessura centrada no eixo. */
export function segmentRect(a: Point, b: Point, thickness: number): Rect {
  const half = thickness / 2;
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return maxX - minX >= maxY - minY ? { x: minX, y: minY - half, w: maxX - minX, h: thickness } : { x: minX - half, y: minY, w: thickness, h: maxY - minY };
}

export function union(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Posição de um ponto da planta ao longo do eixo da parede, do `start` (negativa antes dele). */
export function alongFromStart(w: WallGeom, p: Point): number {
  return w.dir === 'x' ? (p.x - w.start.x) * w.sign : (p.y - w.start.y) * w.sign;
}

/** Ponto do eixo a `s` do `start`. */
export function pointAlong(w: WallGeom, s: number): Point {
  return w.dir === 'x' ? { x: w.start.x + w.sign * s, y: w.start.y } : { x: w.start.x, y: w.start.y + w.sign * s };
}

/** Ponto onde a ponta `end` ficaria se seguisse o ponteiro `p` só ao longo do próprio eixo. */
export function endpointOnAxis(w: WallGeom, end: 'start' | 'end', p: Point): Point {
  const fixed = end === 'start' ? w.end : w.start;
  return w.dir === 'x' ? { x: p.x, y: fixed.y } : { x: fixed.x, y: p.y };
}

/** Problemas que só a geometria vê: casa que não fecha e paredes sem eixo. */
export function geometryIssues(g: PlanGeometry, ids: IdIndex): Issue[] {
  const issues: Issue[] = [];
  for (const b of g.broken) issues.push({ severity: 'problem', source: 'geometry', text: b.error, wallId: b.wallId });
  if (g.houseError !== undefined && g.broken.length === 0) {
    const [wallId, ...alsoWalls] = wallIdsIn(g.houseError, ids);
    const issue: Issue = { severity: 'problem', source: 'geometry', text: g.houseError };
    if (wallId !== undefined) issue.wallId = wallId;
    if (alsoWalls.length > 0) issue.alsoWalls = alsoWalls;
    issues.push(issue);
  }
  return issues;
}

export const sectionThickness = sectionDepth;
