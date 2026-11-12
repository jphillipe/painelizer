/**
 * Sugestão de resolução por IA (S51) — a regra, só no servidor: pergunta à IA, confere a resposta contra o projeto e
 * mede o efeito com a checagem do motor antes e depois. Nada é gravado nem aplicado aqui: o resultado volta para a
 * tela, e a edição só entra no projeto com o clique do revisor.
 *
 * A chamada real (`askForFix`, de `extract/suggest`) é um parâmetro para os testes injetarem uma falsa; a chave nunca
 * sai do servidor.
 */

import 'server-only';
import { askForFix, SuggestError, type AskResult } from 'extract/suggest';
import {
  describeEdits,
  suggestPrompt,
  toDraftEdits,
  touchesStructural,
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

/** A frase da tela para cada falha; nunca o detalhe do erro (pode citar a credencial). */
function failureMessage(e: unknown): string {
  if (!(e instanceof SuggestError)) {
    console.error('[suggestFix] unexpected failure', e instanceof Error ? e.name : typeof e);
    return 'The AI suggestion failed. Try again.';
  }
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

/** O efeito das edições, medido pelo motor: ocorrências desta causa antes e depois, e as famílias que apareceram. */
function effectOf(draft: ProjectDraft, edits: readonly DraftEdit[], family: string): SuggestEffect {
  const before = causesOf(draft);
  const after = causesOf(edits.reduce(applyEdit, draft));
  const count = (groups: readonly IssueGroup[]): number =>
    groups.filter((g) => g.family === family).reduce((n, g) => n + g.count, 0);
  const seen = new Set(before.map((g) => g.family));
  const added = after.filter((g) => !seen.has(g.family));
  return {
    before: count(before),
    after: count(after),
    newProblems: added.filter((g) => g.tier === 'fix').map((g) => g.title),
    newWarnings: added.filter((g) => g.tier !== 'fix').map((g) => g.title),
  };
}

export async function suggestFix(input: SuggestInput, ask: Ask = askForFix): Promise<SuggestResult> {
  const load = draftFromText(input.projectText);
  if (!load.ok) return { ok: false, message: 'The project could not be read.' };
  const draft = load.draft;
  let answer: AskResult;
  try {
    answer = await ask(suggestPrompt(input.issue, draft, input.notes ?? []));
  } catch (e) {
    return { ok: false, message: failureMessage(e) };
  }
  const { suggestion } = answer;
  const { edits, rejected } = toDraftEdits(suggestion, draft);
  return {
    ok: true,
    explanation: suggestion.explanation,
    confidence: suggestion.confidence,
    needsFromHuman: suggestion.needsFromHuman,
    edits,
    lines: describeEdits(edits),
    rejected,
    structural: touchesStructural(edits),
    ...(edits.length === 0 ? {} : { effect: effectOf(draft, edits, input.issue.family) }),
  };
}
