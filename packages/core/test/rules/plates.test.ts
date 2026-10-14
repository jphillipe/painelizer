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

describe('layoutPlates — laps e cortes da double top plate (S14, R602.3.2)', () => {
  it('extend no início: a double top começa em x negativo e cresce; bottom e top não mudam', () => {
    const plates = layoutPlates(117.25, 97.125, '2x6', 1.5, { start: { extend: 5.5 } });
    expectSameMembers(plates, [
      { role: 'bottomPlate', section: '2x6', length: 117.25, x: 0, y: 0 },
      { role: 'topPlate', section: '2x6', length: 117.25, x: 0, y: 94.125 },
      { role: 'doubleTopPlate', section: '2x6', length: 122.75, x: -5.5, y: 95.625 },
    ]);
  });

  it('recess no início e extend no fim', () => {
    const [, , dt] = layoutPlates(146.75, 97.125, '2x6', 1.5, { start: { recess: 5.5 }, end: { extend: 3.5 } });
    expect(dt).toMatchObject({ role: 'doubleTopPlate', x: 5.5, length: 146.75 - 5.5 + 3.5 });
  });

  it('corte abre um vão: duas peças, da esquerda para a direita', () => {
    const plates = layoutPlates(192, 97.125, '2x6', 1.5, { cuts: [{ x: 70.25, width: 3.5 }] });
    expect(plates.filter((p) => p.role === 'doubleTopPlate')).toEqual([
      { role: 'doubleTopPlate', section: '2x6', length: 70.25, x: 0, y: 95.625, orientation: 'horizontal' },
      { role: 'doubleTopPlate', section: '2x6', length: 118.25, x: 73.75, y: 95.625, orientation: 'horizontal' },
    ]);
    expect(plates).toHaveLength(4);
  });

  it('cortes fora de ordem são ordenados; corte encostado na ponta não deixa pedaço vazio', () => {
    const dts = layoutPlates(100, 97.125, '2x4', 1.5, { cuts: [{ x: 60, width: 10 }, { x: 0, width: 10 }] }).filter(
      (p) => p.role === 'doubleTopPlate',
    );
    expect(dts.map((p) => [p.x, p.length])).toEqual([
      [10, 50],
      [70, 30],
    ]);
  });

  it('rejeita lap negativo, extend e recess juntos, corte fora da peça, cortes sobrepostos e peça consumida', () => {
    expect(() => layoutPlates(100, 97.125, '2x4', 1.5, { start: { extend: -1 } })).toThrow(RangeError);
    expect(() => layoutPlates(100, 97.125, '2x4', 1.5, { end: { extend: 2, recess: 2 } })).toThrow(/extend e recess/);
    expect(() => layoutPlates(100, 97.125, '2x4', 1.5, { cuts: [{ x: 95, width: 10 }] })).toThrow(/sai da double top/);
    expect(() => layoutPlates(100, 97.125, '2x4', 1.5, { cuts: [{ x: 10, width: 10 }, { x: 15, width: 10 }] })).toThrow(/sobrepõe/);
    expect(() => layoutPlates(100, 97.125, '2x4', 1.5, { cuts: [{ x: 0, width: 100 }] })).toThrow(/inteira/);
    expect(() => layoutPlates(100, 97.125, '2x4', 1.5, { start: { recess: 60 }, end: { recess: 60 } })).toThrow(/sem comprimento/);
  });
});
