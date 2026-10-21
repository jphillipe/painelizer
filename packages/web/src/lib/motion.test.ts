import { describe, expect, it } from 'vitest';
import { cubicBezier, easeSite, prefersReducedMotion } from './motion';

describe('motion (M4)', () => {
  it('easeSite: começa em 0, termina em 1, cresce e é "ease-out" (metade do tempo passa de metade do caminho)', () => {
    expect(easeSite(0)).toBe(0);
    expect(easeSite(1)).toBe(1);
    expect(easeSite(-1)).toBe(0);
    expect(easeSite(2)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 100; i += 1) {
      const y = easeSite(i / 100);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(y).toBeLessThanOrEqual(1 + 1e-9);
      prev = y;
    }
    expect(easeSite(0.5)).toBeGreaterThan(0.7);
  });

  it('cubicBezier linear (0,0,1,1) é a identidade', () => {
    const lin = cubicBezier(0, 0, 1, 1);
    for (const t of [0.1, 0.25, 0.5, 0.9]) expect(lin(t)).toBeCloseTo(t, 4);
  });

  it('prefersReducedMotion sem window é falso', () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});
