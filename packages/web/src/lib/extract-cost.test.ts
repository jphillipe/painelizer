import { describe, expect, it } from 'vitest';
import { actualCost, estimateCost, formatUsd, outputFraction } from './extract-cost';

describe('custo da leitura (M7)', () => {
  it('reproduz as duas leituras reais do Ringgold dentro de poucos centavos', () => {
    expect(actualCost({ inputTokens: 20_989, outputTokens: 70_240 })).toBeCloseTo(1.5, 1);
    expect(actualCost({ inputTokens: 66_000, outputTokens: 74_000 })).toBeCloseTo(1.73, 1);
  });

  it('estimativa por páginas: cresce com as páginas, com faixa de ±30 %', () => {
    const two = estimateCost(2);
    const nine = estimateCost(9);
    expect(two.inputTokens).toBe(6_000 + 2 * 7_300);
    expect(nine.usd).toBeGreaterThan(two.usd);
    expect(two.usd).toBeGreaterThan(1.3);
    expect(two.usd).toBeLessThan(1.8);
    expect(two.low).toBeCloseTo(two.usd * 0.7, 9);
    expect(two.high).toBeCloseTo(two.usd * 1.3, 9);
    expect(estimateCost(0, 3).inputTokens).toBe(6_000 + 3 * 1_600);
  });

  it('formata e mede o progresso pela saída, parando em 95 %', () => {
    expect(formatUsd(1.5)).toBe('US$ 1.50');
    expect(outputFraction(0)).toBe(0);
    expect(outputFraction(36_000)).toBeCloseTo(0.5, 9);
    expect(outputFraction(200_000)).toBe(0.95);
    expect(outputFraction(10, 0)).toBe(0);
  });
});
