/**
 * Estimativa de custo de uma leitura (M7), antes de pagar; refeita na S25 (2026-11-04) com termo por densidade.
 *
 * Preço: a tabela do Claude Opus 5.5 (US$ 4/M entrada, US$ 20/M saída; cache: escrita 1,25× a entrada, leitura
 * US$ 0,20/M), não mais o preço "resolvido" de duas leituras. A API conta a entrada em três partes: `input_tokens`
 * (sem cache), `cache_creation_input_tokens` (o system prompt, escrito no cache) e `cache_read_input_tokens` (o
 * mesmo prompt lido do cache numa leitura até 5 min depois). Os números medidos antes eram só `input_tokens`.
 *
 * Entrada sem cache = `BASE` + `POR_PÁGINA`·páginas + `POR_CARACTERE`·caracteres do texto posicionado +
 * `POR_RECORTE`·recortes + `POR_IMAGEM`·imagens. O termo por caractere é a densidade: as folhas do Horace têm
 * ~14 700 caracteres de texto posicionado contra ~5 500 das do Ringgold, e custaram ~2,5× por folha. Ajustado em
 * três leituras reais (P43, hipótese medida):
 * - Ringgold, A-100 + A-800, sem recortes: 2 páginas, 16 730 caracteres → 20 989 medidos (estima 20 500);
 * - Ringgold, 9 folhas sem recortes: 49 883 caracteres → ~66 000 (estima 65 500);
 * - Horace automático (Architectural + Structural): 33–34 folhas, ~480 000 caracteres, 16 recortes → ~633 000
 *   (estima ~640 000).
 * O recorte vale o teto de tokens visuais da API (⌈w/28⌉·⌈h/28⌉ ≤ 4 784) mais a legenda; a página do PDF em si
 * custa pouco (~1 400, uma imagem em resolução padrão) perto do texto.
 *
 * Saída (o raciocínio conta): `SAÍDA_BASE` + `POR_PÁGINA`·páginas + `POR_RECORTE`·recortes — Ringgold 2 páginas
 * 70 240 medidos, 9 páginas ~74 000; o Horace passou de 96 000 de raciocínio sem terminar a resposta. Acima de
 * `OUTPUT_RISK_TOKENS` a leitura pode estourar o teto de 128 000 (`outputAtRisk`). É estimativa: a tela diz
 * "about" e a faixa é ±30 %. Puro.
 */

export const USD_PER_INPUT_TOKEN = 4 / 1_000_000;
export const USD_PER_OUTPUT_TOKEN = 20 / 1_000_000;
/** Escrita no cache (TTL de 5 min): 1,25× a entrada. */
export const USD_PER_CACHE_WRITE_TOKEN = 5 / 1_000_000;
export const USD_PER_CACHE_READ_TOKEN = 0.2 / 1_000_000;

/** System prompt com o JSON Schema (~19 000 caracteres): vai como escrita de cache em toda leitura isolada. */
export const SYSTEM_PROMPT_TOKENS = 6_000;
/** Instrução final e rótulos da mensagem do usuário. */
export const BASE_INPUT_TOKENS = 500;
export const INPUT_TOKENS_PER_PAGE = 1_400;
export const INPUT_TOKENS_PER_TEXT_CHAR = 1.05;
/** Caracteres de texto posicionado por página quando a prévia não os trouxe (média do Ringgold). */
export const DEFAULT_TEXT_CHARS_PER_PAGE = 5_500;
export const INPUT_TOKENS_PER_IMAGE = 1_600;
/** Recorte de planta no teto do tier de alta resolução (⌈w/28⌉·⌈h/28⌉ ≤ 4 784) mais a legenda. */
export const INPUT_TOKENS_PER_TILE = 4_900;

export const BASE_OUTPUT_TOKENS = 68_000;
export const OUTPUT_TOKENS_PER_PAGE = 700;
export const OUTPUT_TOKENS_PER_TILE = 500;
/** Saída média de uma leitura do porte do Ringgold, para a barra de progresso (a resposta chega no fim). */
export const EXPECTED_OUTPUT_TOKENS = 72_000;
/** Teto de saída da leitura (`DEFAULT_MAX_TOKENS` do extract). */
export const MAX_OUTPUT_TOKENS = 128_000;
/** Saída estimada acima disto pode estourar o teto: foi onde o Horace parou (96 000 de raciocínio). */
export const OUTPUT_RISK_TOKENS = 96_000;
export const ESTIMATE_SPREAD = 0.3;

export interface CostInput {
  pages: number;
  images?: number;
  tiles?: number;
  /** Caracteres do texto posicionado enviado (`textChars` da prévia); ausente = `DEFAULT_TEXT_CHARS_PER_PAGE` por página. */
  textChars?: number;
}

export interface CostEstimate {
  /** Entrada sem cache mais o system prompt (escrito no cache). */
  inputTokens: number;
  outputTokens: number;
  usd: number;
  low: number;
  high: number;
  /** A saída estimada passa de `OUTPUT_RISK_TOKENS`: a leitura pode acabar cortada; mande menos folhas. */
  outputAtRisk: boolean;
}

export function estimateCost({ pages, images = 0, tiles = 0, textChars }: CostInput): CostEstimate {
  const chars = textChars ?? pages * DEFAULT_TEXT_CHARS_PER_PAGE;
  const uncached = Math.round(
    BASE_INPUT_TOKENS + INPUT_TOKENS_PER_PAGE * pages + INPUT_TOKENS_PER_TEXT_CHAR * chars + INPUT_TOKENS_PER_IMAGE * images + INPUT_TOKENS_PER_TILE * tiles,
  );
  const outputTokens = BASE_OUTPUT_TOKENS + OUTPUT_TOKENS_PER_PAGE * pages + OUTPUT_TOKENS_PER_TILE * tiles;
  const usd = uncached * USD_PER_INPUT_TOKEN + SYSTEM_PROMPT_TOKENS * USD_PER_CACHE_WRITE_TOKEN + outputTokens * USD_PER_OUTPUT_TOKEN;
  return {
    inputTokens: uncached + SYSTEM_PROMPT_TOKENS,
    outputTokens,
    usd,
    low: usd * (1 - ESTIMATE_SPREAD),
    high: usd * (1 + ESTIMATE_SPREAD),
    outputAtRisk: outputTokens > OUTPUT_RISK_TOKENS,
  };
}

/** Tokens de uma leitura feita, como a API os devolve (`ExtractUsage` do extract). */
export interface UsageTokens {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

/** Custo de uma leitura feita, pelos tokens reais, com o cache a seu preço. */
export function actualCost(usage: UsageTokens): number {
  return (
    usage.inputTokens * USD_PER_INPUT_TOKEN +
    (usage.cacheCreationInputTokens ?? 0) * USD_PER_CACHE_WRITE_TOKEN +
    (usage.cacheReadInputTokens ?? 0) * USD_PER_CACHE_READ_TOKEN +
    usage.outputTokens * USD_PER_OUTPUT_TOKEN
  );
}

export function formatUsd(usd: number): string {
  return `US$ ${usd.toFixed(2)}`;
}

/** Fração do progresso pelos tokens de saída (0–0,95): o fim é a resposta, não a conta. */
export function outputFraction(outputTokens: number, expected = EXPECTED_OUTPUT_TOKENS): number {
  if (expected <= 0) return 0;
  return Math.min(0.95, Math.max(0, outputTokens / expected));
}
