# S48 — O motor lista todas as aberturas com erro de header de uma parede (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando uma parede para num erro de header de uma abertura, o app e o CLI listam o erro de header de **todas** as aberturas dessa parede — no Matilda, 13 aberturas em vez de 10.

**Architecture:** O header de cada abertura é resolvido de forma independente (`resolveOpeningHeader(opening, wall, config, tables)`), mas `resolveHeaders` lança no primeiro erro. Uma função nova e pura no core, `headerErrors`, resolve cada abertura num `try` e devolve todos os `EngineError`. O CLI (`build.ts`, `panelize`) a chama só depois que a parede já falhou num erro de abertura: se o erro lançado é um dos de header, entram todos; senão fica o erro lançado, como hoje. **Nenhuma regra de framing muda**: a parede continua sem painel; só o relato fica completo.

**Tech Stack:** TypeScript 7, vitest, pnpm (`packages/core`, `packages/cli`, `packages/web`).

**Spec:** `docs/superpowers/specs/2026-11-12-issues-by-cause-design.md`, "Sessões" item 3 (fora do §1–§4; desenho próprio, este plano). Pedido do humano em 2026-11-12, que pediu para seguir sem esperar confirmação.

## Global Constraints

- Nenhuma peça, medida ou aviso de painel muda: fixtures e snapshots intactos.
- `packages/core` continua só com funções puras.
- Erros que não são de header (geometria, vizinhança, planta) continuam um por parede, como hoje.
- Um commit só, no fim. `pnpm check` e `pnpm --filter web build` passam antes.

## Review Focus

1. Parede com uma abertura com header do projeto e outra sem: só a segunda entra. → teste na Task 1.
2. Parede cujo primeiro erro NÃO é de header (aberturas coladas): continua um problema só, sem os de header somados. → teste na Task 2.
3. Erro de header que depende de dado do projeto (`HEADER_DATA_MISSING`): uma linha por abertura também, sem duplicar. → teste na Task 2.
4. Casa em planta: a parede usada é a enquadrada (`frame.wall`), com o id certo. → teste na Task 2.
5. `resolveOpeningHeader` lançando algo que não é `EngineError`: `headerErrors` não esconde `TypeError`; `RangeError` avulso é ignorado (o caminho normal já o relata). → teste na Task 1.

### Task 1: `headerErrors` no core

**Files:** Modify `packages/core/src/panelize/panelizeWall.ts`, `packages/core/src/index.ts`; Test `packages/core/test/panelize/headerErrors.test.ts`

**Interfaces (Produces):** `export function headerErrors(wall: Wall, config: Config, tables?: readonly HeaderTable[] | HeaderTables): EngineError[]` — um erro por abertura que falha, na ordem de `wall.openings`, cada um com `wallId` e `openingId`.

- [ ] **Step 1: Testes que falham** — fixture `wall-144-window-irc` com `building.buildingWidth: 600` e duas janelas → dois `HEADER_OUT_OF_TABLE` (`win1`, `win2`, `why: 'width'`); com `header` do projeto na primeira → só `win2`; fixture original → `[]`; parede não portante → `[]`.
- [ ] **Step 2: Ver falhar.** — **Step 3: Implementar.** — **Step 4: Ver passar** (`pnpm --filter core test`).

### Task 2: O CLI relata todos

**Files:** Modify `packages/cli/src/build.ts` (`panelize`); Test `packages/cli/test/build.test.ts`, `packages/web/src/services/panels.service.test.ts`

- [ ] **Step 1: Testes que falham** — projeto com uma parede portante (prédio de 600") e duas janelas: `panelizeProject(...).problems` = dois `HEADER_OUT_OF_TABLE` com as duas aberturas; o mesmo em planta (casa 28×40 com `buildingWidth: 600`): todas as aberturas das paredes portantes; o caso existente de `OPENINGS_TOO_CLOSE` continua com um problema; `check` do app devolve os dois.
- [ ] **Step 2: Ver falhar.** — **Step 3: Implementar.** — **Step 4: Ver passar** (`pnpm --filter cli test`, `pnpm --filter web test`).

### Task 3: Conferência, docs e commit

- [ ] **Step 1:** checagem do app na planta salva do Matilda (`out/matilda/draft-real.json`): 13 `HEADER_OUT_OF_TABLE`.
- [ ] **Step 2:** `docs/03-sessoes.md` (S48), `docs/04-decisoes.md`.
- [ ] **Step 3:** `pnpm check` e `pnpm --filter web build` (exit 0). — **Step 4:** commit.
