/**
 * Avisos revisados (S50): o revisor aceitou o aviso e ele sai da lista — mas não do que o motor gera (a folha do
 * painel e o `panels.csv` continuam com ele: a fábrica vê tudo).
 *
 * A marca é por ocorrência: o mesmo aviso, na mesma parede / abertura, com as mesmas medidas. Se a medida muda ou
 * surge outra ocorrência, a chave é outra e o aviso volta a pedir revisão. As chaves ficam na raiz do arquivo do
 * projeto (`$reviewedIssues`), como o `$underlay`: o CLI ignora chaves com `$` e elas não vão para a checagem do
 * motor. Problema nunca tem chave — o que trava a geração não pode ser "revisado".
 */

import type { ProjectDraft } from './draft';
import type { Issue } from './problems';

export const REVIEWED_ISSUES_KEY = '$reviewedIssues';

/** JSON com as chaves em ordem: a mesma medida dá o mesmo texto, venha como vier do motor. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * A chave da ocorrência. O painel só entra quando o aviso não é de uma abertura: o número do painel muda quando uma
 * quebra é movida, e o aviso da abertura continua o mesmo.
 *
 * @returns `undefined` para problema e para aviso sem código nem família
 */
export function issueReviewKey(issue: Issue): string | undefined {
  const family = issue.code ?? issue.kind;
  if (issue.severity !== 'warning' || family === undefined) return undefined;
  const panel = issue.openingId === undefined ? (issue.panelId ?? '') : '';
  return [family, issue.wallId ?? '', issue.openingId ?? '', panel, stable(issue.params ?? {})].join('|');
}

/** As chaves gravadas no projeto; valor estranho no arquivo (não é lista, item que não é texto) é ignorado. */
export function reviewedIssueKeys(draft: Pick<ProjectDraft, 'extra'>): ReadonlySet<string> {
  const raw = draft.extra?.[REVIEWED_ISSUES_KEY];
  return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : []);
}

/** As issues com `reviewed: true` nos avisos que o projeto guarda como revisados; as demais passam intactas. */
export function markReviewed(issues: readonly Issue[], keys: ReadonlySet<string>): Issue[] {
  if (keys.size === 0) return [...issues];
  return issues.map((i) => {
    const key = issueReviewKey(i);
    return key !== undefined && keys.has(key) ? { ...i, reviewed: true } : i;
  });
}
