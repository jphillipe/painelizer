import { describe, expect, it } from 'vitest';
import { layoutPlates } from '../../src/rules/plates';
import { expectSameMembers } from '../helpers/members';

describe('layoutPlates', () => {
  it('parede 144 × 97.125 2x6: bottom em 0, top em 94.125, double top em 95.625', () => {
    expect(layoutPlates(144, 97.125, '2x6')).toEqual([
      { role: 'bottomPlate', section: '2x6', length: 144, x: 0, y: 0, orientation: 'horizontal' },
      { role: 'topPlate', section: '2x6', length: 144, x: 0, y: 94.125, orientation: 'horizontal' },
      { role: 'doubleTopPlate', section: '2x6', length: 144, x: 0, y: 95.625, orientation: 'horizontal' },
    ]);
  });

  it("parede 2x4 de 9' (109.125): plates seguem a altura", () => {
    const plates = layoutPlates(120, 109.125, '2x4');
    expectSameMembers(plates, [
      { role: 'bottomPlate', section: '2x4', length: 120, x: 0, y: 0 },
      { role: 'topPlate', section: '2x4', length: 120, x: 0, y: 106.125 },
      { role: 'doubleTopPlate', section: '2x4', length: 120, x: 0, y: 107.625 },
    ]);
    for (const p of plates) expect(p.orientation).toBe('horizontal');
  });

  it('plateThickness explícito (ex.: 1.75)', () => {
    const ys = layoutPlates(100, 100, '2x4', 1.75).map((p) => p.y);
    expect(ys).toEqual([0, 96.5, 98.25]);
  });

  it('sempre 3 plates com comprimento = length e x = 0', () => {
    for (const length of [1.5, 16, 96, 143, 192.25]) {
      const plates = layoutPlates(length, 97.125, '2x6');
      expect(plates).toHaveLength(3);
      for (const p of plates) {
        expect(p.length).toBe(length);
        expect(p.x).toBe(0);
      }
    }
  });

  it.each([
    [0, 97.125, 1.5],
    [-10, 97.125, 1.5],
    [144, 4.5, 1.5],
    [144, 3, 1.5],
    [144, 97.125, 0],
    [Number.NaN, 97.125, 1.5],
    [144, Number.POSITIVE_INFINITY, 1.5],
  ])('rejeita length=%s height=%s t=%s', (length, height, t) => {
    expect(() => layoutPlates(length, height, '2x6', t)).toThrow(RangeError);
  });
});
