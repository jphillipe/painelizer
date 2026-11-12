# S50 — "Mark as reviewed" (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um aviso que o revisor aceitou sai da lista: "Mark as reviewed" manda a linha para a seção recolhida "Reviewed (N)", a marca grava com o projeto e o aviso deixa de acender parede e de contar — mas continua na folha do painel e no `panels.csv`.

**Architecture:** A marca é por ocorrência: uma chave `família|parede|abertura|painel|parâmetros` (`lib/editor/reviewed-issues.ts`), guardada na chave `$reviewedIssues` da raiz do arquivo do projeto (o CLI ignora chaves com `$`, e elas não vão para a checagem do motor). O editor marca as issues com `reviewed: true` antes de agrupar; `tierOf` devolve o nível novo `reviewed`; os grupos revisados ficam à parte (`reviewed:<família>`). Só `packages/web`.

**Tech Stack:** TypeScript 7, React 19 / Next.js 16, vitest (+ jsdom), pnpm.

**Spec:** `docs/superpowers/specs/2026-11-12-issues-by-cause-design.md` — §4 "Mark as reviewed".

## Global Constraints

- Só aviso pode ser revisado; problema nunca (nem sai da contagem, nem fica recolhido).
- A marca não muda nada do que o motor gera: folhas e `panels.csv` continuam com o aviso.
- Marcar e desmarcar são desfazíveis (Ctrl+Z) e gravam com o projeto.
- `packages/core` e `packages/cli` não mudam. Textos da tela em inglês. Um commit no fim; `pnpm check` e `pnpm --filter web build` antes.

## Review Focus

1. A medida do aviso muda depois de revisado (o vão passa de 24 1/8" para 25"): a chave muda, o aviso volta para "To review". → teste na Task 1.
2. Surge uma ocorrência nova da mesma família (uma porta a mais): a linha volta para "To review" só com a nova e diz "+ 17 reviewed". → teste na Task 2.
3. Um problema com a mesma chave de um aviso revisado (ou marcado à força): continua "Must fix". → testes nas Tasks 1 e 2.
4. O painel da abertura muda de número (quebra de painel movida): o aviso da abertura continua revisado (a chave não leva o painel quando há abertura). → teste na Task 1.
5. Arquivo de projeto salvo e reaberto: as marcas voltam; o texto que vai para o motor é o mesmo com e sem marcas. → teste na Task 1.

---

### Task 1: Chave, armazenamento e ação

**Files:** Create `packages/web/src/lib/editor/reviewed-issues.ts` (+ test); Modify `problems.ts` (`Issue.reviewed?`), `state.ts` (ação); Test `state.test.ts`

**Interfaces (Produces):**
```ts
export const REVIEWED_ISSUES_KEY = '$reviewedIssues';
export function issueReviewKey(issue: Issue): string | undefined; // undefined: problema, ou sem código/família
export function reviewedIssueKeys(draft: Pick<ProjectDraft, 'extra'>): ReadonlySet<string>;
export function markReviewed(issues: readonly Issue[], keys: ReadonlySet<string>): Issue[]; // põe reviewed: true nos avisos com chave marcada
// EditorAction: { type: 'setIssuesReviewed'; keys: readonly string[]; reviewed: boolean }
```
- [ ] Testes que falham, implementar, ver passar.

### Task 2: Nível "reviewed" nos grupos

**Files:** Modify `packages/web/src/lib/editor/issue-groups.ts`; Test `issue-groups.test.ts`

**Interfaces (Produces):** `IssueTier` + `'reviewed'`; `tierOf` (aviso com `reviewed: true` → `reviewed`); `IssueGroup.family` (a chave da família) e `reviewedCount` (ocorrências revisadas da mesma família, nos grupos não revisados); grupos revisados com `key: 'reviewed:<família>'`, por último; `CauseCounts.reviewed`.
- [ ] Testes que falham, implementar, ver passar.

### Task 3: Tela

**Files:** Modify `issue-groups-list.tsx` (botões "Mark as reviewed" / "Undo review", seção "Reviewed (N)", nota "+ N reviewed"), `issue-callout.tsx` (etiqueta "Reviewed", "Undo review" / "Mark as reviewed"), `opening-properties.tsx`, `wall-properties.tsx`, `wall-editor.tsx` (marca as issues; `issuesByWall` sem revisadas), `workspace.tsx` (selo sem revisadas; `onReview`); Test `issue-groups-list.test.tsx`, `issue-callout.test.tsx`, `wall-editor.dom.test.tsx`
- [ ] Testes que falham (lista SSR; inspetor; editor de verdade: marcar tira a linha de "To review", a parede apaga na lista, o topo fica "Ready" sem "to review"; "Undo review" devolve), implementar, ver passar.

### Task 4: Conferência na tela, docs e commit

- [ ] Matilda (app local sem login): marcar os dois avisos de porta → 2 linhas e "Reviewed (2)"; captura em `out/s50/`. Docs (`10-design.md` §4, `03-sessoes.md`, `04-decisoes.md`), `pnpm check`, build, commit.
