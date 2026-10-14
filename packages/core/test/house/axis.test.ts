import { describe, expect, it } from 'vitest';
import type { Opening } from '../../src/types';
import type { HouseWall } from '../../src/house/types';
import { across, along, axisOf, crossing, pointAt } from '../../src/house/axis';

const base = { height: 97.125, exterior: true, bearing: true, openings: [] as Opening[] };
const wall = (id: string, start: [number, number], end: [number, number], section: '2x4' | '2x6' = '2x6'): HouseWall => ({
  ...base,
  id,
  section,
  start: { x: start[0], y: start[1] },
  end: { x: end[0], y: end[1] },
});

describe('axisOf', () => {
  it('parede ao longo de x, sentido positivo', () => {
    const a = axisOf(wall('A', [10, 5], [154, 5]));
    expect(a).toMatchObject({ id: 'A', dir: 'x', sign: 1, length: 144, thickness: 5.5 });
  });

  it('parede ao longo de y, sentido negativo, 2x4', () => {
    const a = axisOf(wall('B', [0, 336], [0, 0], '2x4'));
    expect(a).toMatchObject({ dir: 'y', sign: -1, length: 336, thickness: 3.5 });
  });

  it('diagonal, comprimento zero ou coordenada não finita lançam RangeError com o id', () => {
    expect(() => axisOf(wall('D', [0, 0], [10, 10]))).toThrow(/parede D: fora dos eixos/);
    expect(() => axisOf(wall('Z', [3, 3], [3, 3]))).toThrow(/parede Z: start e end coincidem/);
    expect(() => axisOf(wall('N', [0, 0], [NaN, 0]))).toThrow(/parede N: end/);
  });
});

describe('along / across / pointAt / crossing', () => {
  const h = axisOf(wall('H', [100, 20], [0, 20])); // ao longo de x, sentido negativo
  const v = axisOf(wall('V', [40, 0], [40, 200]));

  it('along mede do start no sentido do end; negativo antes do start', () => {
    expect(along(h, { x: 100, y: 20 })).toBe(0);
    expect(along(h, { x: 60, y: 20 })).toBe(40);
    expect(along(h, { x: 110, y: 20 })).toBe(-10);
    expect(along(v, { x: 40, y: 50 })).toBe(50);
  });

  it('across é a distância à reta do eixo', () => {
    expect(across(h, { x: 0, y: 23 })).toBe(3);
    expect(across(v, { x: 37.5, y: 0 })).toBe(2.5);
  });

  it('pointAt inverte along', () => {
    expect(pointAt(h, 40)).toEqual({ x: 60, y: 20 });
    expect(pointAt(h, -2.75)).toEqual({ x: 102.75, y: 20 });
    expect(pointAt(v, 2.75)).toEqual({ x: 40, y: 2.75 });
  });

  it('crossing é o ponto comum das duas retas; paralelas lançam', () => {
    expect(crossing(h, v)).toEqual({ x: 40, y: 20 });
    expect(crossing(v, h)).toEqual({ x: 40, y: 20 });
    expect(() => crossing(h, axisOf(wall('H2', [0, 50], [10, 50])))).toThrow(RangeError);
  });
});
