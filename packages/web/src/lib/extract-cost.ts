/**
 * Estimativa de custo de uma leitura (M7), antes de pagar. Calibrada nas duas leituras reais do Ringgold
 * (docs/03-sessoes S20.2): 2 páginas → 20 989 in / 70 240 out ≈ US$ 1,50; 9 páginas → ~66 000 in / 74 000 out
 * ≈ US$ 1,73. Daí saem o preço por token resolvido do par (≈ US$ 3,29/M entrada, US$ 20,4/M saída) e a
 * regra "6 000 tokens + 7 300 por página"; a saída varia pouco com o conjunto (~72 000). É estimativa: a tela
 * diz "about" e mostra uma faixa de ±30 %. Puro.
 */

export const USD_PER_INPUT_TOKEN = 3.29 / 1_000_000;
export const USD_PER_OUTPUT_TOKEN = 20.4 / 1_000_000;
export const BASE_INPUT_TOKENS = 6_000;
export const INPUT_TOKENS_PER_PAGE = 7_300;
export const INPUT_TOKENS_PER_IMAGE = 1_600;
export const EXPECTED_OUTPUT_TOKENS = 72_000;
export const ESTIMATE_SPREAD = 0.3;

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  usd: number;
  low: number;
  high: number;
}

export function estimateCost(pages: number, images = 0): CostEstimate {
  const inputTokens = BASE_INPUT_TOKENS + INPUT_TOKENS_PER_PAGE * pages + INPUT_TOKENS_PER_IMAGE * images;
  const outputTokens = EXPECTED_OUTPUT_TOKENS;
  const usd = inputTokens * USD_PER_INPUT_TOKEN + outputTokens * USD_PER_OUTPUT_TOKEN;
  return { inputTokens, outputTokens, usd, low: usd * (1 - ESTIMATE_SPREAD), high: usd * (1 + ESTIMATE_SPREAD) };
}

/** Custo de uma leitura feita, pelos tokens reais. */
export function actualCost(usage: { inputTokens: number; outputTokens: number }): number {
  return usage.inputTokens * USD_PER_INPUT_TOKEN + usage.outputTokens * USD_PER_OUTPUT_TOKEN;
}

export function formatUsd(usd: number): string {
  return `US$ ${usd.toFixed(2)}`;
}

/** Fração do progresso pelos tokens de saída (0–0,95): o fim é a resposta, não a conta. */
export function outputFraction(outputTokens: number, expected = EXPECTED_OUTPUT_TOKENS): number {
  if (expected <= 0) return 0;
  return Math.min(0.95, Math.max(0, outputTokens / expected));
}
