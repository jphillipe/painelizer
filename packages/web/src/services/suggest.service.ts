/**
 * Sugestão de resolução por IA (S51) — a regra, só no servidor: pergunta à IA, confere a resposta contra o projeto e
 * mede o efeito com a checagem do motor antes e depois. Nada é gravado nem aplicado aqui: o resultado volta para a
 * tela, e a edição só entra no projeto com o clique do revisor.
 *
 * A chamada real (`askForFix`, de `extract/suggest`) é um parâmetro para os testes injetarem uma falsa; a chave nunca
 * sai do servidor.
 *
 * Cada clique é uma chamada paga: o pedido tem teto de tamanho, cada usuário tem um limite por janela de tempo, e
 * cada chamada deixa no log o modelo e os tokens (nunca o conteúdo).
 */

import 'server-only';
import { askForFix, SuggestError, type AskResult } from 'extract/suggest';
import {
  describeEdits,
  suggestPrompt,
  toDraftEdits,
  touchesStructural,
  toWire,
  type SuggestIssue,
} from '@/lib/ai/fix-suggestion';
import { draftFromText, textFromDraft, withoutEditorKeys, type ProjectDraft } from '@/lib/editor/draft';
import { dropRepeated, groupIssues, type IssueGroup } from '@/lib/editor/issue-groups';
import { draftIssues, idIndex, parseEngineResult } from '@/lib/editor/problems';
import { applyEdit, type DraftEdit } from '@/lib/editor/state';
import type { SuggestEffect, SuggestResult } from '@/types/panels';
import { check } from './panels.service';

export interface SuggestInput {
  /** O projeto como o editor o tem agora (o mesmo texto da checagem). */
  projectText: string;
  issue: SuggestIssue;
  /** Notas da leitura por IA dos desenhos, quando o projeto veio de uma. */
  notes?: readonly string[] | undefined;
}

export type Ask = (prompt: { system: string; user: string }) => Promise<AskResult>;

export interface SuggestOptions {
  /** Quem pede (id do usuário); sem ele, todos dividem um limite só. */
  userKey?: string | undefined;
  /** Relógio (ms) para os testes. */
  now?: () => number;
}

/** Teto do pedido (caracteres do texto que vai para a IA): ~50 mil tokens, alguns centavos; acima disso, não vai. */
export const MAX_PROMPT_CHARS = 200_000;
/** Limite por usuário: pedidos numa janela. Por instância do servidor (memória): freio, não cota contábil. */
export const RATE_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 } as const;

const recentCalls = new Map<string, number[]>();

function allowed(key: string, now: number): boolean {
  const recent = (recentCalls.get(key) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (recent.length >= RATE_LIMIT.max) {
    recentCalls.set(key, recent);
    return false;
  }
  recentCalls.set(key, [...recent, now]);
  return true;
}

/** A frase da tela para cada falha; nunca o detalhe do erro (pode citar a credencial). O log leva só código e status. */
function failureMessage(e: unknown): string {
  if (!(e instanceof SuggestError)) {
    console.error('[suggestFix] unexpected failure', e instanceof Error ? e.name : typeof e);
    return 'The AI suggestion failed. Try again.';
  }
  console.warn('[suggestFix] failed', { code: e.code, status: e.status });
  if (e.code === 'MODEL_REFUSED') return 'The AI declined to answer this one.';
  if (e.code === 'RESPONSE_INVALID') return 'The AI answer could not be read. Try again.';
  if (e.code === 'MAX_TOKENS') return 'The AI answer was cut short. Try again.';
  if (e.status === 401 || e.status === 403) return 'AI suggestions are not set up on this server.';
  if (e.status === 429 || e.status === 529) return 'The AI is busy right now. Try again in a minute.';
  return 'The AI service failed. Try again.';
}

/** As causas do projeto como o editor as mostra: as do próprio draft mais as da checagem do motor. */
function causesOf(draft: ProjectDraft): IssueGroup[] {
  const ids = idIndex(draft);
  const own = draftIssues(draft, []);
  const result = check(textFromDraft(withoutEditorKeys(draft)));
  const engine = dropRepeated(parseEngineResult(result.ok ? { warnings: result.warnings } : result, ids), own);
  return groupIssues([...own, ...engine], ids);
}

/**
 * O efeito das edições, medido pelo motor: ocorrências desta causa antes e depois, as famílias que apareceram e as de
 * problema que já existiam e cresceram — "nada novo" não pode esconder que a proposta piorou o que já estava lá.
 */
function effectOf(draft: ProjectDraft, edits: readonly DraftEdit[], family: string): SuggestEffect {
  const before = causesOf(draft);
  const after = causesOf(edits.reduce(applyEdit, draft));
  const countOf = (groups: readonly IssueGroup[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const g of groups) counts.set(g.family, (counts.get(g.family) ?? 0) + g.count);
    return counts;
  };
  const was = countOf(before);
  const is = countOf(after);
  const added = after.filter((g) => !was.has(g.family));
  const grown = after.filter(
    (g) =>
      g.tier === 'fix' &&
      g.family !== family &&
      was.has(g.family) &&
      (is.get(g.family) ?? 0) > (was.get(g.family) ?? 0),
  );
  return {
    before: was.get(family) ?? 0,
    after: is.get(family) ?? 0,
    newProblems: added.filter((g) => g.tier === 'fix').map((g) => g.title),
    grownProblems: grown.map((g) => `${g.title} (${was.get(g.family) ?? 0} → ${is.get(g.family) ?? 0})`),
    newWarnings: added.filter((g) => g.tier !== 'fix').map((g) => g.title),
  };
}

export async function suggestFix(
  input: SuggestInput,
  ask: Ask = askForFix,
  opts: SuggestOptions = {},
): Promise<SuggestResult> {
  const load = draftFromText(input.projectText);
  if (!load.ok) return { ok: false, message: 'The project could not be read.' };
  const draft = load.draft;
  const prompt = suggestPrompt(input.issue, draft, input.notes ?? []);
  if (prompt.user.length > MAX_PROMPT_CHARS)
    return { ok: false, message: 'This issue is too large to send to the AI.' };
  if (!allowed(opts.userKey ?? 'anonymous', (opts.now ?? Date.now)())) {
    return { ok: false, message: 'Too many AI suggestions in a short time. Try again in a few minutes.' };
  }
  let answer: AskResult;
  try {
    answer = await ask(prompt);
  } catch (e) {
    return { ok: false, message: failureMessage(e) };
  }
  const { suggestion } = answer;
  const { edits, rejected } = toDraftEdits(suggestion, draft);
  // o que a chamada custou, sem o conteúdo: o dono vê o gasto no log
  console.info('[suggestFix]', {
    family: input.issue.family,
    model: answer.model,
    inputTokens: answer.usage.inputTokens,
    outputTokens: answer.usage.outputTokens,
    edits: edits.length,
    rejected: rejected.length,
  });
  return {
    ok: true,
    explanation: suggestion.explanation,
    confidence: suggestion.confidence,
    needsFromHuman: suggestion.needsFromHuman,
    edits: toWire(edits),
    lines: describeEdits(edits),
    rejected,
    structural: touchesStructural(edits),
    ...(edits.length === 0 ? {} : { effect: effectOf(draft, edits, input.issue.family) }),
  };
}
