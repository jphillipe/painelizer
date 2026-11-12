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
 * A chave da ocorrência: um JSON `[família, parede, abertura, painel, parâmetros, abertura citada?]`. É um
 * formato gravado no arquivo do projeto e legível de volta — `pruneReviewedIssues` precisa saber de que parede e
 * abertura é cada marca. O painel só entra quando o aviso não é de uma abertura: o número do painel muda quando uma
 * quebra é movida, e o aviso da abertura continua o mesmo. A abertura citada (a que a leitura não posicionou e não
 * existe no projeto) distingue dois avisos iguais na mesma parede.
 *
 * @returns `undefined` para problema e para aviso sem código nem família
 */
export function issueReviewKey(issue: Issue): string | undefined {
  const family = issue.code ?? issue.kind;
  if (issue.severity !== 'warning' || family === undefined) return undefined;
  const panel = issue.openingId === undefined ? (issue.panelId ?? '') : '';
  const cited = issue.openingId === undefined ? issue.cited?.openingId : undefined;
  return JSON.stringify([
    family,
    issue.wallId ?? '',
    issue.openingId ?? '',
    panel,
    stable(issue.params ?? {}),
    ...(cited === undefined ? [] : [cited]),
  ]);
}

/** Parede e abertura de uma chave; `undefined` quando a chave não se lê (arquivo editado à mão, formato antigo). */
function targetOfKey(key: string): { wallId: string; openingId: string } | undefined {
  try {
    const parts: unknown = JSON.parse(key);
    if (!Array.isArray(parts) || typeof parts[1] !== 'string' || typeof parts[2] !== 'string') return undefined;
    return { wallId: parts[1], openingId: parts[2] };
  } catch {
    return undefined;
  }
}

/**
 * Tira do projeto as marcas cuja parede ou abertura não existe mais (apagada ou renomeada) e as que não se leem.
 * Sem isto a marca ficaria órfã e uma abertura nova que reusasse o id nasceria "revisada" sem ninguém ter visto
 * (os ids são reaproveitados: `<parede>-O1`, o id que a leitura deu). Roda em todo commit do editor; o undo devolve
 * o projeto anterior com as marcas dele.
 *
 * @returns o MESMO draft quando não há nada a tirar
 */
export function pruneReviewedIssues<T extends Pick<ProjectDraft, 'extra' | 'walls'>>(draft: T): T {
  const raw = draft.extra?.[REVIEWED_ISSUES_KEY];
  if (raw === undefined) return draft;
  const keys = [...reviewedIssueKeys(draft)];
  const openingsOf = new Map(draft.walls.map((w) => [w.id, new Set(w.openings.map((o) => o.id))]));
  const kept = keys.filter((key) => {
    const target = targetOfKey(key);
    if (target === undefined) return false;
    if (target.wallId === '') return true;
    const openings = openingsOf.get(target.wallId);
    return openings !== undefined && (target.openingId === '' || openings.has(target.openingId));
  });
  if (Array.isArray(raw) && kept.length === raw.length) return draft;
  const extra = { ...(draft.extra ?? {}) };
  if (kept.length === 0) delete extra[REVIEWED_ISSUES_KEY];
  else extra[REVIEWED_ISSUES_KEY] = kept.sort();
  const { extra: _dropped, ...rest } = draft;
  return (Object.keys(extra).length === 0 ? rest : { ...draft, extra }) as T;
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
