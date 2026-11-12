/**
 * Sugestão de resolução de uma issue (S51): uma chamada pequena à API do Claude, só texto, com a resposta presa a
 * um schema. Fica neste pacote porque ele é o único do repositório que fala com a rede (`client.ts` faz a leitura dos
 * desenhos). O prompt, a validação das edições contra o projeto e a conferência pelo motor são do app
 * (`packages/web`); aqui só se pergunta e se devolve a resposta validada pelo schema.
 *
 * A IA não entra no motor: ela propõe edições do projeto, o humano aprova, e quem diz se a proposta resolve é a
 * checagem determinística, rodada antes e depois.
 *
 * Credencial: `new Anthropic()` lê `ANTHROPIC_API_KEY`; nada é gravado nem registrado aqui. Os testes injetam um
 * cliente falso.
 */

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

export const SUGGEST_MODEL = 'claude-opus-5-5';
/** A resposta é curta (uma explicação e uma lista de edições); o teto cobre o raciocínio adaptativo. */
export const SUGGEST_MAX_TOKENS = 16000;
/**
 * Uma sugestão que demora mais que isto não vale a espera do revisor — e, sem nova tentativa, não segura a fila: o
 * Next roda as server actions de um cliente uma por vez, então enquanto a IA responde a checagem do motor e a
 * gravação do editor esperam.
 */
export const SUGGEST_TIMEOUT_MS = 60 * 1000;

/** O que uma edição pode mirar. `project` = as configurações do projeto (config e dados do prédio). */
export const SUGGEST_TARGETS = ['opening', 'wall', 'openingType', 'project'] as const;

/**
 * Vocabulário fechado de campos. Quais valem para cada alvo, e o tipo de cada valor, é conferido no app
 * (`toDraftEdits`): aqui o schema fica plano de propósito — sem união nem campo nulo — para a gramática da saída
 * estruturada ser pequena (a leitura dos desenhos teve o schema recusado por ter campos nulos demais).
 */
export const SUGGEST_FIELDS = [
  'center',
  'offset',
  'roughWidth',
  'roughHeight',
  'sillHeight',
  'headerHeight',
  'jackStuds',
  'kingStuds',
  'headerSection',
  'headerPlies',
  'height',
  'section',
  'exterior',
  'bearing',
  'floorsSupported',
  'width',
  'studSpacing',
  'groundSnowLoad',
  'buildingWidth',
  'windSpeed',
] as const;

export const FixSuggestion = z.object({
  explanation: z
    .string()
    .describe('One to three plain sentences for the reviewer: what is wrong and what the edits do.'),
  confidence: z.enum(['high', 'medium', 'low']),
  needsFromHuman: z
    .string()
    .describe('What information is missing and where to find it; empty string when nothing is missing.'),
  edits: z.array(
    z.object({
      target: z.enum(SUGGEST_TARGETS),
      wallId: z.string().describe('Wall id for target "opening" or "wall"; empty string otherwise.'),
      openingId: z.string().describe('Opening id for target "opening"; empty string otherwise.'),
      tag: z.string().describe('Opening type tag for target "openingType"; empty string otherwise.'),
      field: z.enum(SUGGEST_FIELDS),
      value: z
        .string()
        .describe(
          'The new value as text: decimal inches for measures, a whole number for counts, "true"/"false", a lumber section; empty string clears an optional field.',
        ),
    }),
  ),
});
export type FixSuggestion = z.infer<typeof FixSuggestion>;

export type SuggestErrorCode = 'MODEL_REFUSED' | 'RESPONSE_INVALID' | 'MAX_TOKENS' | 'API_ERROR';

/** A sugestão não veio. `code` para a tela escolher a frase; `status` quando a API respondeu com erro. */
export class SuggestError extends Error {
  readonly code: SuggestErrorCode;
  readonly status: number | undefined;
  constructor(code: SuggestErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'SuggestError';
    this.code = code;
    this.status = status;
  }
}

export interface AskOptions {
  client?: Anthropic;
  model?: string;
  signal?: AbortSignal;
}

export interface AskResult {
  suggestion: FixSuggestion;
  /** O modelo que respondeu (pode ser o de fallback). */
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Pergunta à IA como resolver uma issue. `system` são as regras e o vocabulário (estável: vai com cache);
 * `user` é a issue e o trecho do projeto.
 *
 * @throws SuggestError recusa, teto de tokens, resposta fora do schema ou erro da API
 */
export async function askForFix(prompt: { system: string; user: string }, opts: AskOptions = {}): Promise<AskResult> {
  const client = opts.client ?? new Anthropic({ timeout: SUGGEST_TIMEOUT_MS, maxRetries: 0 });
  let response;
  try {
    response = await client.beta.messages.parse(
      {
        model: opts.model ?? SUGGEST_MODEL,
        max_tokens: SUGGEST_MAX_TOKENS,
        // Recusa por classificador de segurança: o servidor refaz o pedido no modelo de fallback, na mesma chamada.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium', format: betaZodOutputFormat(FixSuggestion) },
        system: [{ type: 'text', text: prompt.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: prompt.user }],
      },
      { timeout: SUGGEST_TIMEOUT_MS, maxRetries: 0, ...(opts.signal === undefined ? {} : { signal: opts.signal }) },
    );
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new SuggestError('API_ERROR', e.message, e.status);
    throw e;
  }
  if (response.stop_reason === 'refusal') throw new SuggestError('MODEL_REFUSED', 'the model declined to answer');
  if (response.stop_reason === 'max_tokens')
    throw new SuggestError('MAX_TOKENS', 'the answer did not fit the output limit');
  const parsed = FixSuggestion.safeParse(response.parsed_output);
  if (!parsed.success) throw new SuggestError('RESPONSE_INVALID', 'the answer does not match the expected format');
  return {
    suggestion: parsed.data,
    model: response.model,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}
