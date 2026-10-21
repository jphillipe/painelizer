/**
 * Viewport do canvas (S21.2): planta (polegadas, y para cima) ↔ tela (px, y para baixo). Sem `transform` CSS —
 * cada ponto é convertido em JS, para rótulos ficarem em pé e traços em px. `scale` é px por polegada.
 */

import type { Point } from './draft';
import type { Rect } from './geometry';

export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
}

export interface Size {
  width: number;
  height: number;
}

export const ZOOM_LIMITS = { min: 0.05, max: 40 } as const;
/** Snap do arraste (S21.3): 1" normal, 1/8" com Shift. */
export const SNAP_COARSE = 1;
export const SNAP_FINE = 0.125;

export function planToScreen(v: Viewport, p: Point): Point {
  return { x: p.x * v.scale + v.tx, y: -p.y * v.scale + v.ty };
}

export function screenToPlan(v: Viewport, p: Point): Point {
  return { x: (p.x - v.tx) / v.scale, y: (v.ty - p.y) / v.scale };
}

/** Retângulo de planta em tela: canto superior esquerdo, largura e altura em px. */
export function rectToScreen(v: Viewport, r: Rect): { x: number; y: number; w: number; h: number } {
  const tl = planToScreen(v, { x: r.x, y: r.y + r.h });
  return { x: tl.x, y: tl.y, w: r.w * v.scale, h: r.h * v.scale };
}

/** Enquadra `bounds` em `size` com `paddingPx` de margem, centrado. Caixa degenerada vira 1" para não dividir por zero. */
export function fitViewport(bounds: Rect, size: Size, paddingPx = 48): Viewport {
  const w = Math.max(bounds.w, 1);
  const h = Math.max(bounds.h, 1);
  const availW = Math.max(size.width - 2 * paddingPx, 1);
  const availH = Math.max(size.height - 2 * paddingPx, 1);
  const scale = clamp(Math.min(availW / w, availH / h), ZOOM_LIMITS.min, ZOOM_LIMITS.max);
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  return { scale, tx: size.width / 2 - cx * scale, ty: size.height / 2 + cy * scale };
}

/** Zoom por `factor` mantendo o ponto de tela `anchor` sobre o mesmo ponto da planta. */
export function zoomAt(v: Viewport, anchor: Point, factor: number, limits: { min: number; max: number } = ZOOM_LIMITS): Viewport {
  const scale = clamp(v.scale * factor, limits.min, limits.max);
  const k = scale / v.scale;
  return { scale, tx: anchor.x - (anchor.x - v.tx) * k, ty: anchor.y - (anchor.y - v.ty) * k };
}

export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, tx: v.tx + dx, ty: v.ty + dy };
}

/** O retângulo de planta está inteiro na tela, com `marginPx` de folga? (S21.4: a lista só centraliza se não está.) */
export function rectVisible(v: Viewport, r: Rect, size: Size, marginPx = 24): boolean {
  const s = rectToScreen(v, r);
  return s.x >= marginPx && s.y >= marginPx && s.x + s.w <= size.width - marginPx && s.y + s.h <= size.height - marginPx;
}

/**
 * Centraliza `r` na tela mantendo a escala; se não cabe nessa escala, enquadra (`fitViewport`) sem passar da
 * escala atual — a lista nunca aproxima, só traz a parede para a vista.
 */
export function centerOn(v: Viewport, r: Rect, size: Size, paddingPx = 48): Viewport {
  const fitsW = r.w * v.scale <= Math.max(size.width - 2 * paddingPx, 1);
  const fitsH = r.h * v.scale <= Math.max(size.height - 2 * paddingPx, 1);
  const scale = fitsW && fitsH ? v.scale : Math.min(v.scale, fitViewport(r, size, paddingPx).scale);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return { scale, tx: size.width / 2 - cx * scale, ty: size.height / 2 + cy * scale };
}

/** Viewport entre `a` (t = 0) e `b` (t = 1), para Fit e centralização animados (M4). */
export function lerpViewport(a: Viewport, b: Viewport, t: number): Viewport {
  const k = clamp(t, 0, 1);
  return { scale: a.scale + (b.scale - a.scale) * k, tx: a.tx + (b.tx - a.tx) * k, ty: a.ty + (b.ty - a.ty) * k };
}

/** Arredonda ao múltiplo de `step` mais próximo (negativos inclusive). */
export function snap(value: number, step: number): number {
  if (!(step > 0)) return value;
  const r = Math.round(value / step) * step;
  return r === 0 ? 0 : r;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
