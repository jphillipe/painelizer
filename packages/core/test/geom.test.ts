import { describe, expect, it } from 'vitest';
import { EPS, LENGTH_EPS, isCount } from '../src/eps';
import { overlaps, span } from '../src/geom';
import { LENGTH_TOLERANCE } from '../src/rules/precuts';

describe('span', () => {
  it('vertical em pé ocupa 1.5; flat ocupa a profundidade; horizontal ocupa o comprimento', () => {
    expect(span({ role: 'stud', section: '2x6', length: 92.625, x: 10, y: 1.5, orientation: 'vertical' })).toEqual({ lo: 10, hi: 11.5 });
    expect(span({ role: 'stud', section: '2x6', length: 92.625, x: 1.5, y: 1.5, orientation: 'vertical', flat: true })).toEqual({ lo: 1.5, hi: 7 });
    expect(
      span({ role: 'header', section: '2x10', length: 41, x: 165, y: 82.5, orientation: 'horizontal', plies: 2, headerSource: 'project' }),
    ).toEqual({ lo: 165, hi: 206 });
  });
});

describe('overlaps', () => {
  it('sobreposição com área; encostar (dentro de EPS) não conta', () => {
    expect(overlaps(0, 10, 5, 15)).toBe(true);
    expect(overlaps(5, 15, 0, 10)).toBe(true);
    expect(overlaps(0, 10, 2, 3)).toBe(true);
    expect(overlaps(0, 10, 10, 20)).toBe(false);
    expect(overlaps(0, 10, 10 - EPS / 2, 20)).toBe(false);
    expect(overlaps(0, 10, 11, 20)).toBe(false);
  });
});

describe('eps', () => {
  it('LENGTH_EPS é 1/64" e é a tolerância dos pré-cortes', () => {
    expect(LENGTH_EPS).toBe(1 / 64);
    expect(LENGTH_TOLERANCE).toBe(LENGTH_EPS);
  });

  it('isCount: inteiro ≥ 1', () => {
    expect([1, 2, 7].every(isCount)).toBe(true);
    expect([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY].some(isCount)).toBe(false);
  });
});
