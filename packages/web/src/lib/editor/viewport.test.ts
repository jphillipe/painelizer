import { describe, expect, it } from 'vitest';
import { fitViewport, panBy, planToScreen, rectToScreen, screenToPlan, snap, zoomAt, ZOOM_LIMITS, type Viewport } from './viewport';

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
