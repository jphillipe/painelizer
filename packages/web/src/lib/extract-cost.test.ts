import { describe, expect, it } from 'vitest';
import { actualCost, estimateCost, formatUsd, outputFraction, SYSTEM_PROMPT_TOKENS } from './extract-cost';

/** Entrada sem cache da estimativa (o que a API devolve em `input_tokens`). */
const uncached = (e: { inputTokens: number }) => e.inputTokens - SYSTEM_PROMPT_TOKENS;

describe('custo da leitura (M7; preço da tabela e cache na S25)', () => {
  it('reproduz as leituras reais do Ringgold pelo preço da tabela do Opus 5.5', () => {
    expect(actualCost({ inputTokens: 20_989, outputTokens: 70_240 })).toBeCloseTo(1.49, 2);
    expect(actualCost({ inputTokens: 66_000, outputTokens: 74_000 })).toBeCloseTo(1.74, 2);
  });

  it('actualCost cobra o cache a seu preço: escrita 1,25× a entrada, leitura US$ 0,20/M', () => {
    const base = actualCost({ inputTokens: 20_989, outputTokens: 70_240 });
    expect(actualCost({ inputTokens: 20_989, outputTokens: 70_240, cacheCreationInputTokens: 6_000 }) - base).toBeCloseTo(0.03, 9);
    expect(actualCost({ inputTokens: 20_989, outputTokens: 70_240, cacheReadInputTokens: 6_000 }) - base).toBeCloseTo(0.0012, 9);
  });

  it('formata e mede o progresso pela saída, parando em 95 %', () => {
    expect(formatUsd(1.5)).toBe('US$ 1.50');
    expect(outputFraction(0)).toBe(0);
    expect(outputFraction(36_000)).toBeCloseTo(0.5, 9);
    expect(outputFraction(200_000)).toBe(0.95);
    expect(outputFraction(10, 0)).toBe(0);
  });
});

describe('estimativa com termo por densidade (S25, P43)', () => {
  it('Ringgold A-100 + A-800 (16 730 caracteres): ~21 k de entrada, como a leitura medida (20 989)', () => {
    const e = estimateCost({ pages: 2, textChars: 16_730 });
    expect(uncached(e)).toBeGreaterThan(20_989 * 0.9);
    expect(uncached(e)).toBeLessThan(20_989 * 1.1);
    expect(e.usd).toBeGreaterThan(1.3);
    expect(e.usd).toBeLessThan(1.7);
    expect(e.outputAtRisk).toBe(false);
    expect(e.low).toBeCloseTo(e.usd * 0.7, 9);
    expect(e.high).toBeCloseTo(e.usd * 1.3, 9);
  });

  it('Ringgold 9 folhas sem recortes (49 883 caracteres): ~66 k de entrada, ~74 k de saída', () => {
    const e = estimateCost({ pages: 9, textChars: 49_883 });
    expect(uncached(e)).toBeGreaterThan(66_000 * 0.9);
    expect(uncached(e)).toBeLessThan(66_000 * 1.1);
    expect(e.outputTokens).toBeGreaterThan(74_000 * 0.95);
    expect(e.outputTokens).toBeLessThan(74_000 * 1.05);
  });

  it('Horace automático (34 folhas, 500 468 caracteres, 16 recortes): passa de 500 k, perto dos 633 k medidos, e avisa da saída', () => {
    const e = estimateCost({ pages: 34, textChars: 500_468, tiles: 16 });
    expect(uncached(e)).toBeGreaterThan(500_000);
    expect(uncached(e)).toBeGreaterThan(633_000 * 0.9);
    expect(uncached(e)).toBeLessThan(633_000 * 1.1);
    expect(e.outputAtRisk).toBe(true);
    expect(e.usd).toBeGreaterThan(4);
  });

  it('a densidade pesa: mesmas páginas com 2,7× o texto custam bem mais', () => {
    expect(estimateCost({ pages: 10, textChars: 147_000 }).usd).toBeGreaterThan(estimateCost({ pages: 10, textChars: 55_000 }).usd + 0.3);
  });

  it('sem textChars (prévia antiga): 5 500 caracteres por página; imagens a 1 600', () => {
    expect(estimateCost({ pages: 2 }).inputTokens).toBe(estimateCost({ pages: 2, textChars: 11_000 }).inputTokens);
    expect(uncached(estimateCost({ pages: 0, images: 3 }))).toBe(500 + 3 * 1_600);
  });

  it('cada recorte soma 4 900 de entrada e 500 de saída', () => {
    const without = estimateCost({ pages: 2, textChars: 16_730 });
    const withTiles = estimateCost({ pages: 2, textChars: 16_730, tiles: 6 });
    expect(withTiles.inputTokens - without.inputTokens).toBe(6 * 4_900);
    expect(withTiles.outputTokens - without.outputTokens).toBe(6 * 500);
    expect(withTiles.usd - without.usd).toBeLessThan(0.2);
  });
});
