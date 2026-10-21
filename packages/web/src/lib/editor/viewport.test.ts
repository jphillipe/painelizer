import { describe, expect, it } from 'vitest';
import { centerOn, fitViewport, gridStep, lerpViewport, panBy, scaleBar, planToScreen, rectToScreen, rectVisible, screenToPlan, snap, zoomAt, ZOOM_LIMITS, type Viewport } from './viewport';

describe('viewport', () => {
  const v: Viewport = { scale: 2, tx: 100, ty: 500 };

  it('planta ↔ tela com y invertido, ida e volta', () => {
    expect(planToScreen(v, { x: 10, y: 20 })).toEqual({ x: 120, y: 460 });
    expect(screenToPlan(v, { x: 120, y: 460 })).toEqual({ x: 10, y: 20 });
    for (const p of [{ x: -33.5, y: 7.25 }, { x: 0, y: 0 }, { x: 480, y: 336 }]) {
      const back = screenToPlan(v, planToScreen(v, p));
      expect(back.x).toBeCloseTo(p.x);
      expect(back.y).toBeCloseTo(p.y);
    }
    expect(rectToScreen(v, { x: 0, y: 0, w: 10, h: 5 })).toEqual({ x: 100, y: 490, w: 20, h: 10 });
  });

  it('fitViewport centra a caixa e respeita a margem; caixa degenerada não divide por zero', () => {
    const f = fitViewport({ x: 0, y: 0, w: 480, h: 336 }, { width: 1000, height: 700 }, 50);
    expect(f.scale).toBeCloseTo(Math.min(900 / 480, 600 / 336));
    const c = planToScreen(f, { x: 240, y: 168 });
    expect(c.x).toBeCloseTo(500);
    expect(c.y).toBeCloseTo(350);
    const top = planToScreen(f, { x: 0, y: 336 });
    expect(top.y).toBeGreaterThanOrEqual(50 - 1e-9);
    const z = fitViewport({ x: 5, y: 5, w: 0, h: 0 }, { width: 200, height: 200 });
    expect(Number.isFinite(z.scale)).toBe(true);
    expect(z.scale).toBeLessThanOrEqual(ZOOM_LIMITS.max);
  });

  it('zoomAt mantém a âncora fixa e respeita os limites', () => {
    const anchor = { x: 300, y: 200 };
    const plan = screenToPlan(v, anchor);
    const z = zoomAt(v, anchor, 1.5);
    expect(z.scale).toBe(3);
    const again = planToScreen(z, plan);
    expect(again.x).toBeCloseTo(anchor.x);
    expect(again.y).toBeCloseTo(anchor.y);
    expect(zoomAt(v, anchor, 1000).scale).toBe(ZOOM_LIMITS.max);
    expect(zoomAt(v, anchor, 0.0001).scale).toBe(ZOOM_LIMITS.min);
  });

  it('rectVisible e centerOn: centraliza mantendo a escala; só reduz quando a parede não cabe', () => {
    const size = { width: 1000, height: 700 };
    const r = { x: 300, y: 0, w: 100, h: 5.5 };
    expect(rectVisible(v, { x: 10, y: 10, w: 20, h: 20 }, size)).toBe(true);
    expect(rectVisible(v, { x: 10, y: 10, w: 20, h: 20 }, { width: 150, height: 100 })).toBe(false);
    expect(rectVisible(v, r, size)).toBe(true);
    const c = centerOn(v, r, size);
    expect(c.scale).toBe(v.scale);
    const mid = planToScreen(c, { x: 350, y: 2.75 });
    expect(mid.x).toBeCloseTo(500);
    expect(mid.y).toBeCloseTo(350);
    expect(rectVisible(c, r, size)).toBe(true);
    const big = centerOn(v, { x: 0, y: 0, w: 2000, h: 10 }, size);
    expect(big.scale).toBeLessThan(v.scale);
    expect(big.scale).toBeCloseTo(fitViewport({ x: 0, y: 0, w: 2000, h: 10 }, size).scale);
    expect(centerOn({ scale: 0.1, tx: 0, ty: 0 }, { x: 0, y: 0, w: 2000, h: 10 }, size).scale).toBe(0.1);
  });

  it('panBy e snap', () => {
    expect(panBy(v, 10, -5)).toEqual({ scale: 2, tx: 110, ty: 495 });
    expect(snap(10.4, 1)).toBe(10);
    expect(snap(10.6, 1)).toBe(11);
    expect(snap(-3.44, 0.125)).toBe(-3.5);
    expect(snap(0.3, 1)).toBe(0);
    expect(Object.is(snap(-0.3, 1), 0)).toBe(true);
    expect(snap(7.3, 0)).toBe(7.3);
  });
});

describe('lerpViewport (M4)', () => {
  it('interpola escala e deslocamento; t fora de [0, 1] é cortado', () => {
    const a: Viewport = { scale: 1, tx: 0, ty: 0 };
    const b: Viewport = { scale: 3, tx: 100, ty: -40 };
    expect(lerpViewport(a, b, 0)).toEqual(a);
    expect(lerpViewport(a, b, 1)).toEqual(b);
    expect(lerpViewport(a, b, 0.5)).toEqual({ scale: 2, tx: 50, ty: -20 });
    expect(lerpViewport(a, b, -1)).toEqual(a);
    expect(lerpViewport(a, b, 2)).toEqual(b);
  });
});

describe('barra de escala e grade (M5)', () => {
  it('scaleBar: maior comprimento redondo que cabe', () => {
    expect(scaleBar(2)).toEqual({ inches: 48, px: 96 });
    expect(scaleBar(0.5)).toEqual({ inches: 192, px: 96 });
    expect(scaleBar(20)).toEqual({ inches: 6, px: 120 });
    expect(scaleBar(400).inches).toBe(1);
  });
  it('gridStep: 12" com ≥ 1 px/pol, 48" acima de 0,25, senão nada', () => {
    expect(gridStep(2)).toBe(12);
    expect(gridStep(0.5)).toBe(48);
    expect(gridStep(0.1)).toBeUndefined();
  });
});
