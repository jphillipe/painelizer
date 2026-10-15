/**
 * Chamada à API do Claude (S18): PDF recortado + texto posicionado → `ExtractionOutput` validado pelo
 * schema zod (structured outputs) → JSON do CLI + relatório de revisão. Este é o único módulo do
 * repositório que fala com a rede, e só quando chamado: os testes injetam um cliente falso.
 *
 * Credencial: `new Anthropic()` lê `ANTHROPIC_API_KEY` (ou o perfil do `ant auth login`); nada é
 * gravado nem registrado aqui. O PDF vai inteiro na requisição, só as páginas pedidas.
 *
 * Usa `messages.create` (não `messages.parse`) para ficar com o texto cru quando a resposta não bate
 * com o schema: o `parse` do SDK lança sem devolver o texto, e o texto é o que o humano precisa ver.
 */

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { convert, reviewReport, type ConvertOptions, type Converted } from './convert';
import { readPageText, subsetPdf } from './pdf';
import { buildUserContent, SYSTEM_PROMPT, type ExtractHints } from './prompt';
import { ExtractionOutput } from './schema';

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const DEFAULT_MAX_TOKENS = 32000;

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ExtractRequest {
  /** O PDF inteiro do projeto. */
  pdf: Uint8Array;
  /** Páginas (1-based) a enviar: planta e, se houver, schedule. */
  pages: readonly number[];
  hints?: ExtractHints;
  convert?: ConvertOptions;
}

export interface ExtractOptions {
  client?: Anthropic;
  model?: string;
  effort?: Effort;
  maxTokens?: number;
}

export interface ExtractResult {
  output: ExtractionOutput;
  project: Converted['project'];
  problems: Converted['problems'];
  warnings: Converted['warnings'];
  report: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export class ExtractError extends Error {
  constructor(
    message: string,
    public readonly rawText?: string,
  ) {
    super(message);
    this.name = 'ExtractError';
  }
}

/** Parâmetros da requisição, separados para teste e para `countTokens`. */
export async function buildRequest(req: ExtractRequest, opts: ExtractOptions = {}) {
  if (req.pages.length === 0) throw new RangeError('extractWalls: informe ao menos uma página');
  const pdf = await subsetPdf(req.pdf, req.pages);
  const pages = [];
  for (const p of req.pages) pages.push(await readPageText(req.pdf, p));
  return {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: [{ type: 'text' as const, text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } }],
    messages: [
      {
        role: 'user' as const,
        content: buildUserContent({ pdf, pages, ...(req.hints === undefined ? {} : { hints: req.hints }) }),
      },
    ],
    output_config: {
      format: zodOutputFormat(ExtractionOutput),
      effort: opts.effort ?? 'high',
    },
  } satisfies Anthropic.MessageCreateParamsNonStreaming;
}

export async function extractWalls(req: ExtractRequest, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const client = opts.client ?? new Anthropic();
  const params = await buildRequest(req, opts);
  const response = await client.messages.create(params);
  const text = textOf(response);

  if (response.stop_reason === 'refusal') {
    const why = response.stop_details?.type === 'refusal' ? response.stop_details.explanation : undefined;
    throw new ExtractError(`o modelo recusou a extração${why ? `: ${why}` : ''}`, text);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ExtractError(`resposta cortada em ${params.max_tokens} tokens; aumente maxTokens`, text);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ExtractError(`a resposta não é JSON: ${(e as Error).message}`, text);
  }
  return finish(raw, req.convert, response.model, {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });
}

/** Mesmo pós-processamento da chamada real, para respostas gravadas (fixtures) e para o CLI. */
export function finish(
  raw: unknown,
  convertOpts: ConvertOptions | undefined,
  model: string,
  usage: ExtractResult['usage'],
): ExtractResult {
  const parsed = ExtractionOutput.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ExtractError(`resposta fora do schema: ${issues.join('; ')}`, JSON.stringify(raw));
  }
  const converted = convert(parsed.data, convertOpts);
  return {
    output: parsed.data,
    project: converted.project,
    problems: converted.problems,
    warnings: converted.warnings,
    report: reviewReport(parsed.data, converted),
    model,
    usage,
  };
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
