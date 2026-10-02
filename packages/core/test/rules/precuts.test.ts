import { describe, expect, it } from 'vitest';
import { DEFAULT_PRECUTS, matchPrecut } from '../../src/rules/precuts';

describe('matchPrecut', () => {
  it("default é 92 5/8\" (8') e 104 5/8\" (9') — P7", () => {
    expect(DEFAULT_PRECUTS).toEqual([92.625, 104.625]);
  });

  it('stud de 8\' e de 9\' coincidem com o pré-corte correspondente', () => {
    expect(matchPrecut(92.625, DEFAULT_PRECUTS)).toBe(92.625);
    expect(matchPrecut(104.625, DEFAULT_PRECUTS)).toBe(104.625);
  });

  it('peça mais curta ou mais longa não sai de pré-corte', () => {
    expect(matchPrecut(81, DEFAULT_PRECUTS)).toBeUndefined();
    expect(matchPrecut(98.625, DEFAULT_PRECUTS)).toBeUndefined();
    expect(matchPrecut(96, DEFAULT_PRECUTS)).toBeUndefined();
  });

  it('coincide abaixo de 1/64" (ruído de ponto flutuante); a partir de 1/64" é outro comprimento', () => {
    expect(matchPrecut(92.625 - 1e-9, DEFAULT_PRECUTS)).toBe(92.625);
    expect(matchPrecut(92.625 + 1 / 128, DEFAULT_PRECUTS)).toBe(92.625);
    expect(matchPrecut(92.625 + 1 / 64, DEFAULT_PRECUTS)).toBeUndefined();
    expect(matchPrecut(92.625 - 1 / 64, DEFAULT_PRECUTS)).toBeUndefined();
  });

  it('lista vazia: nenhum pré-corte', () => {
    expect(matchPrecut(92.625, [])).toBeUndefined();
  });

  it.each([[[0]], [[92.625, -1]], [[Number.NaN]]])('pré-corte inválido %j lança RangeError', (list) => {
    expect(() => matchPrecut(92.625, list)).toThrow(RangeError);
  });
});
