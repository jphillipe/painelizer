# S46 — Lista de issues por causa (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A aba Issues do editor conta e mostra uma linha por causa, em três níveis (Must fix / To review / Fine to leave), com uma frase-resumo dos valores em comum e os chips das aberturas recolhidos — na Matilda, 4 linhas em vez de 50 itens.

**Architecture:** O agrupamento já existe (`groupIssues` em `lib/editor/issue-groups.ts`, uma família = um grupo). A sessão acrescenta ao grupo o nível (`tier`), a frase-resumo (`summary`) e os tipos de abertura (`tags`); a lista (`issue-groups-list.tsx`) passa a renderizar três seções; o editor (`wall-editor.tsx`) conta causas em vez de ocorrências e tira o nível "fine" dos contadores por parede e da cor da planta. Só `packages/web`.

**Tech Stack:** TypeScript 7, React 19 / Next.js 16, vitest (+ jsdom em `*.dom.test.tsx`), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-11-12-issues-by-cause-design.md` — §1 "Lista por causa". §2–§4 são das sessões S47, S49 e S50.

## Global Constraints

- `packages/core` e `packages/cli` não mudam.
- Textos da tela em inglês. Segue `docs/10-design.md` (tokens e variantes em uso).
- Problema (`severity: 'problem'`) nunca fica recolhido nem sai da contagem.
- Um commit só, no fim, com mensagem que descreve a regra. Sem `prettier --write` no repo (arquivo que já estava formatado continua formatado).
- `pnpm check` e `pnpm --filter web build` passam antes do commit.
- O parágrafo do Supabase em `docs/04-decisoes.md` e `supabase/README.md` são de outra sessão e ficam fora do commit.
- O projeto real do cliente (Matilda) não entra no repositório.

## Review Focus

1. Ocorrências com parâmetros diferentes na mesma família (ex.: `HEADER_OUT_OF_TABLE` com `table` R602.7(1) e R602.7(2)): a frase usa só o que é comum; sem os valores de que a frase precisa, cai na genérica (`help.what`). → testes na Task 1.
2. Família só com avisos "fine" e mais nada: a aba mostra a seção recolhida, a contagem diz "1 fine to leave", nenhuma parede acende, o topo diz "Ready". → testes nas Tasks 2 e 3.
3. Grupo de abertura com 1, 6 e 7 itens: 1 = link direto (como hoje), 6 = chips à vista, 7 = recolhidos em "Show openings (7)". → teste na Task 2.
4. Abertura citada pelo aviso que não existe no draft (`OPENING_UNPLACED`): continua com o botão "Add …" e sem chip quebrado; fica em "To review". → teste na Task 2 (o caso existente da extração continua passando).
5. "Generate" e a aba inicial: com zero problemas e só avisos, "Generate" liga e a aba inicial é Walls; com um problema, a aba inicial é Issues e o chip diz "1 to fix" mesmo que sejam 10 paredes. → testes na Task 3.

---

### Task 1: Modelo — nível, valores em comum, frase-resumo e contagem por causa

**Files:**
- Modify: `packages/web/src/lib/editor/issue-groups.ts`
- Test: `packages/web/src/lib/editor/issue-groups.test.ts`

**Interfaces (Produces):**
```ts
export type IssueTier = 'fix' | 'review' | 'fine';
export function tierOf(issue: Pick<Issue, 'severity' | 'code' | 'kind'>): IssueTier; // problem → fix; aviso em FINE_TO_LEAVE → fine; senão review
export const FINE_TO_LEAVE: ReadonlySet<string>; // inicial: 'STUDS_OVERLAP'
export interface OpeningInfo { tag?: string; kind?: 'window' | 'door' }
export interface GroupContext { openings?: ReadonlyMap<string, OpeningInfo> } // por id de abertura
export function openingInfo(draft: ProjectDraft): Map<string, OpeningInfo>; // kind = o.type ?? config.openingTypes[o.tag]?.kind
export function commonParams(items: readonly Issue[]): Readonly<Record<string, unknown>>; // chaves com valor igual (JSON) em TODOS os itens; {} se algum item não tem params
export interface IssueGroup { /* campos de hoje + */ tier: IssueTier; tags: string[]; summary?: string }
export function groupIssues(issues: readonly Issue[], ids: IdIndex, context?: GroupContext): IssueGroup[];
export interface CauseCounts { fix: number; review: number; fine: number }
export function causeCounts(groups: readonly IssueGroup[]): CauseCounts;
```
- Ordem de `groupIssues`: nível (fix, review, fine); dentro do nível, grupos maiores primeiro; empate pela ordem de chegada.
- `tags`: tags das aberturas do grupo (de `context.openings`), sem repetir, em ordem alfabética.
- `summary` (ausente quando faltam os valores): sujeito = `"<N> door(s)|window(s)|opening(s)"` + `" (type A)"` / `" (types A, B, C)"` quando há tags.
  - `HEADER_OUT_OF_TABLE`, comum `why: 'width'` e `width`: `The building is 50'-0" wide, outside IRC table R602.7(1).`; sem `table` em comum: `…, outside the IRC header tables.`
  - `FLAT_HEADER_CRIPPLES`, comum `gap` e `max`: `18 doors (types A, B, C): flat header 24 1/8" below the top plate, over the 24" limit.`
  - `DOOR_RO_HEIGHT_MISMATCH`, comum `roughHeight` e `headerBase`: `18 doors (types A, B, C): RO height 6'-10 1/2", header at 6'-9 1/2".`
  - `wall.height`: `30 walls have no height.` (`1 wall has no height.`); `wall.floorsSupported`: `3 bearing walls do not say how many floors they carry.`; `opening.position`: `2 openings have no position.`
  - Medidas: `formatMeasure` (pés-pol) para largura e alturas; `formatInchesOnly` para `gap` e `max`.

- [ ] **Step 1: Testes que falham** (novos `describe` em `issue-groups.test.ts`):
  - `tierOf`: problema → `fix`; aviso `FLAT_HEADER_CRIPPLES` → `review`; aviso `STUDS_OVERLAP` → `fine`; **problema** com código de `FINE_TO_LEAVE` continua `fix`.
  - `commonParams`: três itens `{a:1,b:2}`, `{a:1,b:3}`, `{a:1}` → `{a:1}`; um item sem `params` → `{}`.
  - `groupIssues` com `context`: 3 `FLAT_HEADER_CRIPPLES` (mesmos params, portas de tags C, A, C) → `tier: 'review'`, `tags: ['A','C']`, `summary` = `3 doors (types A, C): flat header 24 1/8" below the top plate, over the 24" limit.`; 2 `DOOR_RO_HEIGHT_MISMATCH` → a frase acima com `2 doors`; `HEADER_OUT_OF_TABLE` com `table` diferente → `…outside the IRC header tables.`; com `why: 'span'` → `summary` undefined (Review Focus 1); sem `context` → sujeito `3 openings`.
  - Ordem: `[aviso fine × 4, aviso review × 2, problema × 1]` → chaves na ordem problema, review, fine.
  - `causeCounts` do caso acima → `{ fix: 1, review: 1, fine: 1 }`.
  - `openingInfo`: draft com abertura `tag: 'A'` (tipo `kind: 'door'`) e outra `type: 'window'` sem tag → `{ tag:'A', kind:'door' }` e `{ kind:'window' }`.
- [ ] **Step 2: Ver falhar** — `pnpm --filter web test -- issue-groups` (exports inexistentes / campos ausentes).
- [ ] **Step 3: Implementar** as funções acima em `issue-groups.ts`; `groupIssues` preenche `tier`, `tags`, `summary`.
- [ ] **Step 4: Ver passar** — `pnpm --filter web test -- issue-groups` → 0 falhas (os testes antigos de ordem "problemas antes de avisos, maiores primeiro" continuam valendo).

### Task 2: Lista — três seções, frase-resumo, chips recolhidos, frase de lista parcial

**Files:**
- Modify: `packages/web/src/app/app/_components/editor/issue-groups-list.tsx`
- Test: `packages/web/src/app/app/_components/editor/issue-groups-list.test.tsx`

**Interfaces:**
- Consumes: `IssueGroup.tier/summary/tags`, `causeCounts` (Task 1).
- Produces: `IssueGroupsListProps.partial?: boolean` (a checagem achou problema mas montou alguma parede).

Comportamento:
- Linha de contagem no topo: `1 to fix · 2 to review · 1 fine to leave` (só as partes ≠ 0).
- Seções com cabeçalho `Must fix`, `To review`; `Fine to leave (N)` é um `<details>` fechado. Seção vazia não aparece.
- Em cada linha: título (`× N` quando N > 1, como hoje); a frase `summary` no lugar de `help.what` quando existe; `help.fix` em negrito como hoje.
- Chips: por abertura sempre que todos os itens têm abertura (sem o limite de 12), senão por parede. Até 6 chips à vista; acima, dentro de `<details>` com `Show openings (N)` / `Show walls (N)`. Grupo de 1 item continua link direto no título, sem chip.
- `partial`: última linha da lista, `Walls with a problem are not framed yet — they may add warnings once fixed.`
- Conserto rápido, botão de ação, "Details", "Rechecking…" e o estado vazio não mudam.

- [ ] **Step 1: Testes que falham** (SSR, como os existentes):
  - Matilda em miniatura por `Notice` literais (10 `HEADER_OUT_OF_TABLE` problema em 10 paredes, 18 `FLAT_HEADER_CRIPPLES`, 18 `DOOR_RO_HEIGHT_MISMATCH`, 4 `STUDS_OVERLAP`): o HTML tem `1 to fix · 2 to review · 1 fine to leave`; os cabeçalhos `Must fix` e `To review`; `Fine to leave (1)` dentro de `<details` sem `open`; a frase `18 doors (types A, B, C): flat header …`; `Show openings (18)`; e 18 botões de abertura dentro desse `<details>`.
  - Review Focus 3: grupos de abertura com 6 itens (sem `Show openings`) e 7 (`Show openings (7)`).
  - Review Focus 2: só `STUDS_OVERLAP` → `1 fine to leave`, sem `Must fix` nem `To review`.
  - `partial` → a frase aparece; sem `partial` → não.
- [ ] **Step 2: Ver falhar** — `pnpm --filter web test -- issue-groups-list`.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver passar** — os dois testes SSR antigos continuam passando (30 chips de parede passam a estar dentro de `Show walls (30)`; ajustar só essa expectativa se ela depender da posição, registrando no ledger).

### Task 3: Fora da aba — contagem por causa no topo e no navegador; "fine" não acende parede

**Files:**
- Modify: `packages/web/src/app/app/_components/editor/wall-editor.tsx` (contexto: `groups` com `openingInfo`, `counts` por causa, `issuesByWall` sem "fine", `partial`), `editor-context.tsx` (tipo), `workspace.tsx` (selo da aba, `partial`, props do topo), `editor-top-bar.tsx` (`title` do chip), `issue-callout.tsx` (etiqueta "Fine to leave")
- Test: `wall-editor.dom.test.tsx`, `editor-top-bar.test.tsx`, novo `packages/web/src/lib/editor/issue-causes.test.ts` (projeto inventado com as quatro causas, pela checagem real)

**Interfaces:**
- `EditorContextValue.counts` continua `{ problems: number; warnings: number }`, agora **causas**: `problems = causeCounts.fix`, `warnings = causeCounts.review`. Novo `counts.problemWalls` (paredes com problema) e `partial: boolean`.
- `issuesByWall = byWall(issues.filter((i) => tierOf(i) !== 'fine'))`; o inspetor continua recebendo `issues` inteiro.
- Selo da aba Issues: `groups.length`, vermelho quando `counts.problems > 0`.
- `EditorTopBar`: nova prop `problemWalls?: number`; o chip `N to fix` ganha `title` `"<N> cause(s) in <M> wall(s)"`.
- `IssueCallout`: aviso de nível `fine` ganha a etiqueta `Fine to leave` antes do título.
- `partial` = `check.result?.ok === false && (check.result.walls ?? []).some((w) => w.breaks !== undefined)`.

- [ ] **Step 1: Testes que falham**
  - `issue-causes.test.ts`: projeto inventado (2 paredes externas portantes com janela e `building.buildingWidth: 600` → `HEADER_OUT_OF_TABLE`; 3 paredes internas não portantes de 110.125 com portas de tags A e B, `headerHeight: 81.5`, tipos com `height: 80` → `FLAT_HEADER_CRIPPLES` + `DOOR_RO_HEIGHT_MISMATCH`; 1 parede de 145.875 → `STUDS_OVERLAP`), passado por `check` + `parseEngineResult` + `groupIssues(…, openingInfo(draft))`: 4 grupos, `causeCounts` `{ fix: 1, review: 2, fine: 1 }`, e as três frases-resumo com os números do projeto.
  - `wall-editor.dom.test.tsx`: com `check` falho (1 problema em W02, 1 aviso review em W03, 1 aviso `STUDS_OVERLAP` em W04): a aba Issues mostra o selo `3`; na lista de paredes W04 não tem ponto de aviso (Review Focus 2); o chip do topo diz `1 to fix`. Com `check` ok e só o `STUDS_OVERLAP`: `Ready`, "Generate" ligado, aba inicial Walls (Review Focus 5).
  - `editor-top-bar.test.tsx`: `problems={1} problemWalls={10}` → `1 to fix` com `title="1 cause in 10 walls"`.
- [ ] **Step 2: Ver falhar** — `pnpm --filter web test -- issue-causes wall-editor.dom editor-top-bar`.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver passar** — `pnpm --filter web test` → 0 falhas.

### Task 4: Conferência na tela, docs e commit

**Files:**
- Modify: `docs/10-design.md` (§4 "Workspace do editor": Issues por causa), `docs/03-sessoes.md` (S46), `docs/04-decisoes.md` (2026-11-12)

- [ ] **Step 1: Tela** — app local sem login (porta 3001), planta salva da Matilda (cópia em `out/matilda/`, fora do git), por Chrome headless: a aba Issues mostra selo `4`, `1 to fix · 2 to review · 1 fine to leave`, as frases-resumo e os chips recolhidos; captura em `out/s46/`. Desfazer o servidor de teste, a entrada do `launch.json` e o arquivo em `public/`.
- [ ] **Step 2: Docs** — os três arquivos acima.
- [ ] **Step 3: Verificação completa** — `pnpm check` (exit 0) e `pnpm --filter web build` (exit 0).
- [ ] **Step 4: Commit** — só os arquivos desta sessão.
