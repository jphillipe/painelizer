# S47 — Clique que leva ao campo e "como resolver" para toda família (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicar numa issue (chip, título ou linha de "Details") seleciona a parede/abertura, abre a seção do inspetor que tem o campo que resolve, rola até ele, põe o cursor nele e o destaca. Toda família de issue passa a ter "o que é" e "como resolver".

**Architecture:** Um mapa família → campo em `lib/editor/issue-targets.ts` devolve a seleção e os `id` de DOM candidatos (os campos do inspetor já têm `id`: `o-<abertura>-hby`, `w-<parede>-height`, `b-wind`…). A ação `select` do editor ganha `focus` (lista de ids); o workspace reage num efeito que chama `revealField` (`lib/editor/field-focus.ts`): abre os `<details>` ancestrais, rola, foca e marca `data-field-focus` por um instante. Só `packages/web`.

**Tech Stack:** TypeScript 7, React 19 / Next.js 16, vitest (+ jsdom), pnpm.

**Spec:** `docs/superpowers/specs/2026-11-12-issues-by-cause-design.md` — §2 "Clique que leva ao campo".

## Global Constraints

- `packages/core` e `packages/cli` não mudam. Textos da tela em inglês.
- O clique nunca edita nada: só seleciona e foca.
- Família sem alvo conhecido: seleciona a parede/abertura como hoje.
- Um commit só, no fim. Sem `prettier --write` no repo (arquivo que estava formatado continua formatado).
- `pnpm check` e `pnpm --filter web build` passam antes do commit. O parágrafo do Supabase em `docs/04-decisoes.md` e `supabase/README.md` ficam fora do commit.

## Review Focus

1. Abertura posicionada por borda (`offset`) e não por eixo: o alvo "posição" cai no campo que existe (`-offset`), não num id ausente. → teste na Task 1 (dois ids candidatos) e na Task 3 (o primeiro que existir).
2. Campo dentro de seção recolhida ("Header and studs", "Framing"): a seção abre. → teste na Task 3.
3. Mesmo clique duas vezes seguidas: foca de novo (o usuário rolou a tela entre um e outro). → teste na Task 2 (objeto `focus` novo a cada `select`).
4. Issue de projeto (vento, neve, precuts): o botão "Open project settings" abre o diálogo com o campo focado; chip de parede de uma issue de projeto continua selecionando a parede. → testes nas Tasks 1 e 3.
5. Campo que não existe na tela (id errado, seção que não renderiza): nada quebra, a seleção acontece e o efeito desiste depois de algumas tentativas. → teste na Task 3.

---

### Task 1: Mapa família → campo

**Files:** Create `packages/web/src/lib/editor/issue-targets.ts`; Test `packages/web/src/lib/editor/issue-targets.test.ts`

**Interfaces (Produces):**
```ts
export interface IssueFocus { selection: Selection; fieldIds: string[] }
/** Onde o clique numa issue leva. `undefined`: família sem alvo, ou issue sem a parede/abertura que o alvo pede. */
export function focusFor(issue: Issue): IssueFocus | undefined;
```
- Alvo de abertura (precisa de `issue.wallId` e `issue.openingId`) → `{ kind: 'opening', … }` + `o-<id>-<campo>`:
  `hby` — `HEADER_OUT_OF_TABLE`, `FLAT_HEADER_CRIPPLES`, `FLAT_HEADER_SPAN`, `HEADER_TOO_THICK`, `HEADER_MARK_UNKNOWN`, `opening.headerMark`;
  `hh` — `DOOR_RO_HEIGHT_MISMATCH`, `HEADER_ABOVE_TOP_PLATE`, `HEADER_NO_ROOM_FOR_JACK`; `sill` — `SILL_NO_ROOM`; `rh` — `DOOR_RO_HEIGHT_ASSUMED`;
  posição (`center`, depois `offset`) — `OPENING_NEAR_CORNER`, `OPENING_AT_TEE`, `OPENING_NUDGED`, `OPENINGS_TOO_CLOSE`, `OPENING_OFF_PLATE`, `OPENING_OUT_OF_WALL`, `OPENING_ESTIMATED`, `OPENING_POSITION_MISSING`, `opening.position`;
  `size` — `OPENING_TAG_UNKNOWN`, `opening.tag`; `rw` — `OPENING_SIZE_MISSING`, `opening.size`; `type` — `OPENING_TYPE_MISSING`, `opening.type`;
  `jacks` — `HEADER_JACKS_BELOW_TABLE`; `kings` — `HEADER_KINGS_BELOW_TABLE`, `KINGS_OUT_OF_TABLE`; `id` — `opening.duplicateId`.
- Alvo de parede (precisa de `issue.wallId`) → `{ kind: 'wall', … }` + `w-<id>-<campo>`:
  `height` — `wall.height`, `STUD_LENGTH_MISMATCH`, `STUD_HEIGHT_ABOVE_LIMIT`; `section` — `wall.section`; `ext` — `wall.exterior`; `bearing` — `wall.bearing`; `type` — `wall.wallType`, `WALL_TYPE_MISMATCH`; `floors` — `wall.floorsSupported`; `len` — `wall.length`; `id` — `wall.duplicateId`; `sx` — `wall.ends`, `wall.noAxis`, `WALL_OFF_AXIS`, `WALL_ZERO_LENGTH`.
- Alvo de projeto → `{ kind: 'project' }` + id: `b-wind` — `WIND_SPEED_MISSING`; `b-snow` — `config.building`, `HEADER_DATA_MISSING`; `c-spacing` — `config.studSpacing`; `c-precuts` — `config.studLength`; `c-hh` — `DEFAULT_HEADER_HEIGHT`; `pn-weight` — `PANEL_OVERWEIGHT`; `c-stock` — `PIECE_OVER_STOCK`.
- A chave é `issue.kind ?? issue.code` (a mesma do grupo).

- [ ] **Step 1: Testes que falham** — um caso por linha acima (tabela `it.each`), mais: issue de abertura sem `openingId` → `undefined`; família sem alvo (`STUDS_OVERLAP`) → `undefined`; posição devolve os dois ids, `center` primeiro (Review Focus 1); projeto devolve `{ kind: 'project' }` (Review Focus 4).
- [ ] **Step 2: Ver falhar** — `pnpm --filter web test -- issue-targets`.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Ver passar.**

### Task 2: A seleção carrega o campo a focar

**Files:** Modify `packages/web/src/lib/editor/state.ts`; Test `packages/web/src/lib/editor/state.test.ts`

**Interfaces (Produces):**
- `EditorAction` `{ type: 'select'; selection: Selection; focus?: readonly string[] }`.
- `EditorState.focus?: { fieldIds: string[] }` — objeto **novo** a cada `select` com `focus`; `undefined` em `select` sem `focus`, `load` e `reset`. Editar não mexe nele.

- [ ] **Step 1: Testes que falham** — `select` com `focus` grava os ids; dois `select` iguais seguidos dão objetos `focus` diferentes (Review Focus 3); `select` sem `focus` limpa; `updateOpening` mantém o mesmo objeto.
- [ ] **Step 2: Ver falhar.** — **Step 3: Implementar.** — **Step 4: Ver passar.**

### Task 3: O clique revela o campo

**Files:**
- Create: `packages/web/src/lib/editor/field-focus.ts` (`revealField(el: HTMLElement): void`), test `field-focus.dom.test.ts`
- Modify: `fields.tsx` (`Field` ganha `data-field`), `issue-groups-list.tsx` (`onSelect(selection, focus?)`, `onAction(action, focus?)`), `workspace.tsx` (repasse do `focus`; efeito que procura o primeiro id existente, com novas tentativas curtas, e chama `revealField`), `app/globals.css` (destaque `[data-field-focus]`, sem animação em `prefers-reduced-motion`)
- Test: `issue-groups-list.test.tsx` não cobre clique (SSR) → `wall-editor.dom.test.tsx`

**Interfaces:**
- `revealField`: abre todo `<details>` ancestral, `scrollIntoView({ block: 'center' })` quando existe, `focus({ preventScroll: true })`, põe `data-field-focus` no `[data-field]` mais próximo (ou no próprio elemento) e tira depois de 1800 ms.
- `IssueGroupsListProps.onSelect: (selection: Selection, focus?: readonly string[]) => void`; `onAction: (action, focus?: readonly string[]) => void`.

- [ ] **Step 1: Testes que falham**
  - `field-focus.dom.test.ts`: elemento dentro de dois `<details>` fechados → os dois abrem, o elemento fica focado, o `[data-field]` ganha e depois perde `data-field-focus` (timers falsos).
  - `wall-editor.dom.test.tsx`: com `check` falho (`HEADER_OUT_OF_TABLE` em W02/J2 e em W01/J1), clicar no chip `J2` → `document.activeElement.id === 'o-J2-hby'` e o `<details>` "Header and studs" aberto (Review Focus 2); clicar de novo depois de tirar o foco → foca de novo (Review Focus 3). Issue de família sem alvo → a parede é selecionada e nada quebra (Review Focus 5).
- [ ] **Step 2: Ver falhar.** — **Step 3: Implementar.** — **Step 4: Ver passar** — `pnpm --filter web test`.

### Task 4: "Como resolver" para toda família

**Files:** Modify `packages/web/src/lib/editor/issue-help.ts`; Test `packages/web/src/lib/editor/issue-help.test.ts` (criar se não existir)

- [ ] **Step 1: Teste que falha** — toda chave de `ISSUE_TITLES` (`issue-groups.ts`) e todo código de `WARNING_CODES` (core) tem `ISSUE_HELP` com `what` e `fix` não vazios.
- [ ] **Step 2: Ver falhar** (lista das ~60 que faltam). — **Step 3: Escrever** `what`/`fix` de cada uma, citando o campo pelo nome da tela. — **Step 4: Ver passar.**

### Task 5: Conferência na tela, docs e commit

- [ ] **Step 1: Tela** — app local sem login, planta da Matilda (`out/matilda/`), Chrome headless: clicar no chip `W1-E2-1` → captura com a seção "Header and studs" aberta e o campo "Header" destacado (`out/s47/`).
- [ ] **Step 2: Docs** — `docs/10-design.md` §4, `docs/03-sessoes.md` (S47), `docs/04-decisoes.md`.
- [ ] **Step 3:** `pnpm check` e `pnpm --filter web build` (exit 0). — **Step 4: Commit.**
