/**
 * Chamada à API do Claude (S18, S20.2): arquivos do projeto (PDFs recortados + texto posicionado, imagens)
 * → `ExtractionOutput` validado pelo schema zod (structured outputs) → JSON do CLI + relatório de revisão.
 * Este é o único módulo do repositório que fala com a rede, e só quando chamado: os testes injetam um
 * cliente falso.
 *
 * Credencial: `new Anthropic()` lê `ANTHROPIC_API_KEY` (ou o perfil do `ant auth login`); nada é
 * gravado nem registrado aqui. De cada PDF vão só as páginas pedidas.
 *
 * Sem structured outputs: a API recusou o schema (33 campos nullable; depois "gramática grande demais" mesmo
 * sem uniões), então o JSON Schema vai no system prompt e o zod valida a resposta em `finish`. Streaming
 * porque o SDK recusa chamadas sem stream que possam passar de 10 minutos; o texto cru fica no `ExtractError`.
 */

import Anthropic from '@anthropic-ai/sdk';
import { convert, reviewReport, type ConvertOptions, type Converted } from './convert';
import { listSheets, pageCount, pickPages, readPageText, subsetPdf, type PageText } from './pdf';
import { buildUserContent, FULL_SYSTEM_PROMPT, type ExtractHints, type ImageMediaType, type PdfInput, type ImageInput } from './prompt';
import { ExtractionOutput } from './schema';

export const DEFAULT_MODEL = 'claude-opus-5-5';
/**
 * O raciocínio adaptativo conta no `max_tokens`: com effort alto e uma planta inteira, 32 000 acabaram antes
 * de o modelo escrever um byte de resposta (2026-10-15). 96 000 deixa folga; streaming permite até 128 000.
 */
export const DEFAULT_MAX_TOKENS = 96000;
/** Sem `pages` e sem folha reconhecível pelo carimbo, vão no máximo estas páginas do PDF. */
export const MAX_AUTO_PAGES = 20;

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type ExtractSource =
  | {
      kind: 'pdf';
      name: string;
      data: Uint8Array;
      /** Páginas (1-based). Ausente: planta A-1xx + schedule A-8xx pelo carimbo; sem eles, todas (até `MAX_AUTO_PAGES`). */
      pages?: readonly number[];
    }
  | { kind: 'image'; name: string; data: Uint8Array; mediaType: ImageMediaType };

export interface ExtractRequest {
  /** Arquivos do projeto: PDFs e/ou imagens, na ordem em que o modelo deve lê-los. */
  sources?: readonly ExtractSource[];
  /** Atalho de um PDF só (S18/S19): equivale a `sources: [{ kind: 'pdf', data: pdf, pages }]`. */
  pdf?: Uint8Array;
  pages?: readonly number[];
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
  /** Páginas efetivamente enviadas de cada PDF, na ordem de `sources`. */
  pagesSent: { name: string; pages: number[] }[];
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

export function normalizeSources(req: ExtractRequest): ExtractSource[] {
  const out: ExtractSource[] = [];
  if (req.pdf !== undefined) {
    out.push({ kind: 'pdf', name: 'planta.pdf', data: req.pdf, ...(req.pages === undefined ? {} : { pages: req.pages }) });
  }
  for (const s of req.sources ?? []) out.push(s);
  if (out.length === 0) throw new RangeError('extractWalls: informe ao menos um PDF ou imagem');
  return out;
}

/** Páginas de um PDF quando não foram pedidas: carimbo (A-1xx, A-8xx) ou todas até o limite. */
export async function autoPages(data: Uint8Array): Promise<number[]> {
  const picked = pickPages(await listSheets(data));
  if (picked.plan !== undefined) return picked.schedule === undefined ? [picked.plan] : [picked.plan, picked.schedule];
  const n = await pageCount(data);
  return Array.from({ length: Math.min(n, MAX_AUTO_PAGES) }, (_, i) => i + 1);
}

/** Parâmetros da requisição, separados para teste e para `countTokens`. */
export async function buildRequest(req: ExtractRequest, opts: ExtractOptions = {}) {
  const sources = normalizeSources(req);
  const pdfs: PdfInput[] = [];
  const images: ImageInput[] = [];
  const pagesSent: ExtractResult['pagesSent'] = [];
  for (const s of sources) {
    if (s.kind === 'image') {
      images.push({ name: s.name, data: s.data, mediaType: s.mediaType });
      continue;
    }
    const pages = s.pages === undefined ? await autoPages(s.data) : [...s.pages];
    if (pages.length === 0) throw new RangeError(`${s.name}: nenhuma página pedida`);
    const texts: PageText[] = [];
    for (const p of pages) texts.push(await readPageText(s.data, p));
    pdfs.push({ name: s.name, pdf: await subsetPdf(s.data, pages), pages: texts });
    pagesSent.push({ name: s.name, pages });
  }
  const params = {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    system: [{ type: 'text' as const, text: FULL_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } }],
    messages: [
      {
        role: 'user' as const,
        content: buildUserContent({ pdfs, images, ...(req.hints === undefined ? {} : { hints: req.hints }) }),
      },
    ],
    // Sem `output_config.format`: a API recusa a gramática deste schema; o formato vai no system prompt.
    output_config: { effort: opts.effort ?? 'high' },
  } satisfies Anthropic.MessageCreateParamsNonStreaming;
  return { params, pagesSent };
}

export async function extractWalls(req: ExtractRequest, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const client = opts.client ?? new Anthropic();
  const { params, pagesSent } = await buildRequest(req, opts);
  // Streaming: o SDK exige para respostas longas (max_tokens alto); `finalMessage` junta tudo.
  const response = await client.messages.stream(params).finalMessage();
  const text = stripFences(textOf(response));

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
  return {
    ...finish(raw, req.convert, response.model, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    }),
    pagesSent,
  };
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
  const output = parsed.data;
  const converted = convert(output, convertOpts);
  return {
    output,
    project: converted.project,
    problems: converted.problems,
    warnings: converted.warnings,
    report: reviewReport(output, converted),
    model,
    usage,
    pagesSent: [],
  };
}

/**
 * Erro da API da Anthropic (autenticação, limite, 5xx…) em forma neutra, para quem chama não precisar
 * depender do SDK. `undefined` para qualquer outro erro.
 */
export function apiErrorInfo(e: unknown): { status: number | undefined; message: string; authentication: boolean } | undefined {
  if (!(e instanceof Anthropic.APIError)) return undefined;
  return { status: e.status, message: e.message, authentication: e instanceof Anthropic.AuthenticationError };
}

/** Tira uma cerca de código (```json … ```) se o modelo a puser apesar da instrução. */
export function stripFences(text: string): string {
  const m = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(text);
  return m?.[1] ?? text.trim();
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
