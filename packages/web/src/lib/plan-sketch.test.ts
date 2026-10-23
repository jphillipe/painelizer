import { describe, expect, it } from 'vitest';
import { planSketch, SWEEP_SECONDS } from './plan-sketch';

describe('planSketch (passo 01, 2026-10-23)', () => {
  const p = planSketch();

  it('a casa 28×40 da visão: 5 paredes, 7 aberturas, 6 quebras e 12 painéis', () => {
    expect(p.width).toBeCloseTo(576);
    expect(p.depth).toBeCloseTo(403.2);
    expect(p.walls.map((w) => w.id)).toEqual(['W03', 'W05', 'W01', 'W04', 'W02']);
    expect(p.openings).toHaveLength(7);
    expect(p.breaks).toHaveLength(6);
    expect(p.tags.map((t) => t.id)).toEqual(['1-W03-P1', '1-W03-P2', '1-W03-P3', '1-W01-P1', '1-W01-P2', '1-W01-P3', '1-W02-P1', '1-W02-P2', '1-W04-P1', '1-W04-P2', '1-W05-P1', '1-W05-P2']);
  });

  it('as paredes horizontais acendem na ordem da varredura, de cima para baixo', () => {
    const hs = p.walls.filter((w) => w.horizontal);
    expect(hs.map((w) => w.delay)).toEqual([0, (168 / 336) * SWEEP_SECONDS, SWEEP_SECONDS]);
    for (const w of p.walls.filter((w) => !w.horizontal)) expect(w.delay).toBe(0);
  });

  it('toda abertura fica sobre a parede e dentro da casa', () => {
    for (const o of p.openings) {
      expect(o.x).toBeGreaterThanOrEqual(-5);
      expect(o.x + o.w).toBeLessThanOrEqual(p.width + 5);
      expect(o.y).toBeGreaterThanOrEqual(-5);
      expect(o.y + o.h).toBeLessThanOrEqual(p.depth + 5);
    }
  });

  it('escala muda o tamanho, não a forma', () => {
    const q = planSketch(2);
    expect(q.width / p.width).toBeCloseTo(2 / 1.2);
    expect(q.walls[0]!.delay).toBe(p.walls[0]!.delay);
  });
});
