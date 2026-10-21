/**
 * Planta do arquiteto por baixo das paredes (M6): uma página do PDF (ou uma imagem) desenhada atrás da planta do
 * editor, para conferir a leitura da IA contra o desenho. Guardada no draft em `$underlay` (chave com `$`: o CLI
 * ignora, a serialização preserva, o arquivo de projeto e a sessão levam junto; `withoutUnderlay` tira antes de
 * mandar ao motor). Transformação: pixel da imagem (u, v; v para baixo) → planta (polegadas, y para cima):
 * `plan = origin + R(rotation) · (u·scale, −v·scale)`. Puro.
 */

import type { Point, ProjectDraft } from './draft';
import type { Rect } from './geometry';
import { planToScreen, type Viewport } from './viewport';

export const UNDERLAY_KEY = '$underlay';
export const UNDERLAY_VERSION = 1;
export const DEFAULT_UNDERLAY_OPACITY = 0.35;

export type Rotation = 0 | 90 | 180 | 270;

export interface Underlay {
  version: 1;
  /** De onde veio, para o humano (nome do arquivo e página). */
  source: { name: string; page?: number };
  /** Data URL (JPEG/PNG) e tamanho em pixels. */
  image: string;
  width: number;
  height: number;
  /** Polegadas por pixel da imagem. */
  scale: number;
  /** Onde o pixel (0, 0) da imagem cai na planta, depois da rotação. */
  origin: Point;
  rotation: Rotation;
  opacity: number;
  visible: boolean;
}

/** `$underlay` do draft, validado; qualquer coisa fora do formato = sem underlay. */
export function underlayOf(d: Pick<ProjectDraft, 'extra'>): Underlay | undefined {
  const raw = d.extra?.[UNDERLAY_KEY];
  if (raw === null || typeof raw !== 'object') return undefined;
  const u = raw as Partial<Underlay>;
  if (u.version !== UNDERLAY_VERSION || typeof u.image !== 'string' || typeof u.width !== 'number' || typeof u.height !== 'number') return undefined;
  if (typeof u.scale !== 'number' || !(u.scale > 0) || u.origin === undefined || typeof u.origin.x !== 'number' || typeof u.origin.y !== 'number') return undefined;
  const rotation = u.rotation === 90 || u.rotation === 180 || u.rotation === 270 ? u.rotation : 0;
  return {
    version: 1,
    source: u.source !== undefined && typeof u.source.name === 'string' ? (u.source.page === undefined ? { name: u.source.name } : { name: u.source.name, page: u.source.page }) : { name: 'drawing' },
    image: u.image,
    width: u.width,
    height: u.height,
    scale: u.scale,
    origin: { x: u.origin.x, y: u.origin.y },
    rotation,
    opacity: typeof u.opacity === 'number' ? Math.min(1, Math.max(0.05, u.opacity)) : DEFAULT_UNDERLAY_OPACITY,
    visible: u.visible !== false,
  };
}

/** Draft sem o underlay (para o motor e a checagem: a imagem pesa centenas de KB e o motor não a lê). */
export function withoutUnderlay<T extends Pick<ProjectDraft, 'extra'>>(d: T): T {
  if (d.extra?.[UNDERLAY_KEY] === undefined) return d;
  const extra = { ...d.extra };
  delete extra[UNDERLAY_KEY];
  return Object.keys(extra).length === 0 ? (({ ...d, extra: undefined }) as T) : { ...d, extra };
}

function rot(p: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
    default:
      return p;
  }
}

function unrot(p: Point, rotation: Rotation): Point {
  return rot(p, ((360 - rotation) % 360) as Rotation);
}

/** Pixel da imagem → planta. */
export function imageToPlan(u: Pick<Underlay, 'scale' | 'origin' | 'rotation'>, px: Point): Point {
  const r = rot({ x: px.x * u.scale, y: -px.y * u.scale }, u.rotation);
  return { x: u.origin.x + r.x, y: u.origin.y + r.y };
}

/** Planta → pixel da imagem. */
export function planToImage(u: Pick<Underlay, 'scale' | 'origin' | 'rotation'>, p: Point): Point {
  const r = unrot({ x: p.x - u.origin.x, y: p.y - u.origin.y }, u.rotation);
  return { x: r.x / u.scale, y: -r.y / u.scale };
}

/**
 * Transformação inicial ao escolher a imagem: cabe na caixa das paredes (ou em 40' quando não há paredes),
 * centrada nela, sem rotação. Daí o humano calibra.
 */
export function initialTransform(width: number, height: number, bounds: Rect | undefined): Pick<Underlay, 'scale' | 'origin' | 'rotation'> {
  const target = bounds ?? { x: 0, y: 0, w: 480, h: 480 };
  const scale = Math.max(target.w / width, target.h / height);
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  // Centro da imagem (w/2, h/2) deve cair em (cx, cy): origin = centro − (w/2·s, −h/2·s).
  return { scale, origin: { x: cx - (width / 2) * scale, y: cy + (height / 2) * scale }, rotation: 0 };
}

/** Escala a partir de dois pixels da imagem e da distância real entre eles, em polegadas. */
export function scaleFromPoints(a: Point, b: Point, inches: number): number | undefined {
  const px = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(px > 0) || !(inches > 0)) return undefined;
  return inches / px;
}

/** Muda a escala mantendo o pixel `anchor` no mesmo ponto da planta (o desenho não "foge" ao calibrar). */
export function withScale(u: Underlay, scale: number, anchor: Point): Underlay {
  const fixed = imageToPlan(u, anchor);
  const next = { ...u, scale };
  const moved = imageToPlan(next, anchor);
  return { ...next, origin: { x: u.origin.x + (fixed.x - moved.x), y: u.origin.y + (fixed.y - moved.y) } };
}

/** O pixel `px` passa a cair no ponto `plan` (ex.: a origem 0,0 do projeto). */
export function withPixelAt(u: Underlay, px: Point, plan: Point): Underlay {
  const now = imageToPlan(u, px);
  return { ...u, origin: { x: u.origin.x + (plan.x - now.x), y: u.origin.y + (plan.y - now.y) } };
}

/** Gira 90° em torno do centro da imagem (o centro fica onde está). */
export function rotated(u: Underlay, delta: 90 | -90): Underlay {
  const center = { x: u.width / 2, y: u.height / 2 };
  const fixed = imageToPlan(u, center);
  const rotation = (((u.rotation + delta) % 360) + 360) % 360 as Rotation;
  const next = { ...u, rotation };
  const moved = imageToPlan(next, center);
  return { ...next, origin: { x: u.origin.x + (fixed.x - moved.x), y: u.origin.y + (fixed.y - moved.y) } };
}

/**
 * `transform="matrix(a b c d e f)"` do `<image>` no SVG: leva pixels da imagem a px de tela pelo viewport
 * (afim: basta onde caem (0,0), (1,0) e (0,1)).
 */
export function svgMatrix(u: Pick<Underlay, 'scale' | 'origin' | 'rotation'>, v: Viewport): string {
  const s0 = planToScreen(v, imageToPlan(u, { x: 0, y: 0 }));
  const s1 = planToScreen(v, imageToPlan(u, { x: 1, y: 0 }));
  const s2 = planToScreen(v, imageToPlan(u, { x: 0, y: 1 }));
  const n = (x: number): string => (Math.abs(x) < 1e-9 ? '0' : String(Math.round(x * 1e6) / 1e6));
  return `matrix(${n(s1.x - s0.x)} ${n(s1.y - s0.y)} ${n(s2.x - s0.x)} ${n(s2.y - s0.y)} ${n(s0.x)} ${n(s0.y)})`;
}

/** Tamanho aproximado do data URL em KB, para avisar quando a imagem pesa. */
export function underlayKb(u: Pick<Underlay, 'image'>): number {
  return Math.round((u.image.length * 3) / 4 / 1024);
}
