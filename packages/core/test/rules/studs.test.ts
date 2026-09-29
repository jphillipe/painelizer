import { describe, expect, it } from 'vitest';
import { layoutStuds } from '../../src/rules/studs';

describe('layoutStuds', () => {
  it('parede 144" a 16" OC: marcas 0..128 + fechamento 142.5', () => {
    expect(layoutStuds(144, 16)).toEqual([0, 16, 32, 48, 64, 80, 96, 112, 128, 142.5]);
  });

  it('parede 16": só a marca 0 e o fechamento (a marca 16 cairia depois do fim)', () => {
    expect(layoutStuds(16, 16)).toEqual([0, 14.5]);
  });

  it('parede 15": marca 0 e fechamento 13.5', () => {
    expect(layoutStuds(15, 16)).toEqual([0, 13.5]);
  });

  it('parede 143": marca 128 e fechamento 141.5 ficam a 13.5"; ambos mantidos', () => {
    expect(layoutStuds(143, 16)).toEqual([0, 16, 32, 48, 64, 80, 96, 112, 128, 141.5]);
  });

  it('marca coincidindo com o fechamento (129.5): um stud só em 128', () => {
    expect(layoutStuds(129.5, 16)).toEqual([0, 16, 32, 48, 64, 80, 96, 112, 128]);
  });

  it('marca sobrepondo o fechamento (130 → 128 e 128.5): mantém os dois (decisão 2026-09-28)', () => {
    expect(layoutStuds(130, 16)).toEqual([0, 16, 32, 48, 64, 80, 96, 112, 128, 128.5]);
  });

  it('marca encostada no fechamento sem sobrepor (131 → 128 e 129.5): mantém os dois', () => {
    expect(layoutStuds(131, 16)).toEqual([0, 16, 32, 48, 64, 80, 96, 112, 128, 129.5]);
  });

  it('24" OC', () => {
    expect(layoutStuds(144, 24)).toEqual([0, 24, 48, 72, 96, 120, 142.5]);
  });

  it('studThickness explícito (ex.: 1.75)', () => {
    expect(layoutStuds(48, 16, 1.75)).toEqual([0, 16, 32, 46.25]);
  });

  it('parede com o comprimento exato de um stud: um stud em 0', () => {
    expect(layoutStuds(1.5, 16)).toEqual([0]);
  });

  it('último stud sempre em length − studThickness e posições crescentes', () => {
    for (const length of [1.5, 3, 10, 47.9, 48, 96, 97.5, 130, 143, 144, 192.25]) {
      const xs = layoutStuds(length, 16);
      expect(xs[xs.length - 1]).toBe(length - 1.5);
      expect(xs[0]).toBe(0);
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]!);
    }
  });

  it.each([
    [1, 16, 1.5],
    [0, 16, 1.5],
    [-10, 16, 1.5],
    [144, 0, 1.5],
    [144, -16, 1.5],
    [144, 16, 0],
    [Number.NaN, 16, 1.5],
    [Number.POSITIVE_INFINITY, 16, 1.5],
  ])('rejeita length=%s spacing=%s t=%s', (length, spacing, t) => {
    expect(() => layoutStuds(length, spacing, t)).toThrow(RangeError);
  });
});
