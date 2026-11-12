# S51 — Sugestão de resolução por IA (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um botão "Suggest a fix" na linha da causa pede à IA uma proposta de edição; o servidor confere a proposta com a checagem do motor (antes e depois) e a tela mostra explicação, edições e efeito, com "Apply" (um passo de desfazer) e "Dismiss".

**Architecture:** `packages/extract/src/suggest.ts` faz a chamada (`client.beta.messages.parse`, `claude-opus-5-5`, saída estruturada por zod, `fallbacks: "default"`). `packages/web/src/lib/ai/fix-suggestion.ts` (puro) monta o prompt, converte a resposta em `DraftEdit` validados e descreve as edições. `packages/web/src/services/suggest.service.ts` aplica numa cópia do projeto e roda `check` antes e depois. A lista de issues ganha o botão e o cartão; "Apply" usa `applyEdits` (S49). Motor e CLI não mudam.

**Tech Stack:** TypeScript 7, `@anthropic-ai/sdk` 0.134, zod 4, React 19 / Next.js 16, vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-ai-fix-suggestion-design.md`.

## Global Constraints

- Nenhuma edição entra sem o clique do humano. O motor continua determinístico: a IA nunca roda dentro de `packages/core`.
- A chave da API nunca sai do servidor nem aparece em log. Os testes injetam um cliente / uma função falsa — nenhum teste chama a API.
- Vocabulário fechado de campos; alvo inexistente ou valor inválido é descartado e relatado.
- Toda proposta que mexe em valor estrutural é marcada na tela.
- Textos da tela em inglês. Um commit no fim; `pnpm check` e `pnpm --filter web build` antes.

## Review Focus

1. A IA cita uma abertura ou parede que não existe (id inventado): a edição é descartada, as outras valem, e a tela diz quantas foram descartadas. → teste na Task 2.
2. A proposta resolve a causa mas cria um problema novo (header grosso demais para a parede): o efeito traz a família nova e a tela avisa antes do "Apply". → teste na Task 3.
3. A API falha (sem chave, 429, recusa, resposta fora do schema): a linha mostra uma frase de erro; a lista e o editor continuam inteiros. → testes nas Tasks 1 e 3.
4. O projeto mudou entre o pedido e o "Apply" (abertura apagada): `applyEdits` ignora o alvo que sumiu; nada quebra. → coberto pela S49; teste de tela na Task 4 confere que "Apply" passa só as edições recebidas.
5. Sem edições (falta informação): o cartão mostra o que falta e não oferece "Apply". → teste na Task 4.

### Task 1: A chamada (`packages/extract`)

**Files:** Create `packages/extract/src/suggest.ts`, `packages/extract/test/suggest.test.ts`; Modify `packages/extract/package.json` (export `./suggest`)

**Interfaces (Produces):** `FixSuggestion` (schema zod: `explanation`, `confidence`, `needsFromHuman`, `edits[]` com `target`, `wallId`, `openingId`, `tag`, `field`, `value` — tudo texto, sem campos nulos), `SUGGEST_FIELDS`, `askForFix({ system, user }, opts?) → { suggestion, model, usage }`, `SuggestError` (`code`: `MODEL_REFUSED` | `RESPONSE_INVALID` | `MAX_TOKENS` | `API_ERROR`).
- [ ] Testes com cliente falso (parâmetros enviados: modelo, fallbacks, formato; sucesso; recusa; saída ausente; erro da API). Ver falhar, implementar, ver passar.

### Task 2: Prompt, validação e descrição (`packages/web/src/lib/ai`)

**Files:** Create `fix-suggestion.ts` (+ test)

**Interfaces (Produces):** `SuggestIssue`, `issueForSuggestion(group)`, `suggestPrompt(issue, draft, notes?) → { system, user }`, `toDraftEdits(suggestion, draft) → { edits: DraftEdit[]; rejected: string[] }`, `describeEdits(edits, draft) → string[]`, `touchesStructural(edits) → boolean`.
- [ ] Testes: o prompt leva a causa, só as paredes citadas e nenhuma chave `$`; conversão por tipo de campo (medida, contagem, seção, booleano, header = seção + plies juntos); id inventado, campo de outro alvo e valor inválido descartados com motivo; descrição agrupa edições iguais ("13 openings: Header → 2x12 × 3"). Ver falhar, implementar, ver passar.

### Task 3: A regra — conferir com o motor (`suggest.service.ts`) e a action

**Files:** Create `packages/web/src/services/suggest.service.ts` (+ test), `packages/web/src/schemas/suggest.ts`, `packages/web/src/app/app/_actions/suggest-fix.ts`; Modify `packages/web/src/types/panels.ts` (`SuggestResult`)

**Interfaces (Produces):** `suggestFix(input, ask?) → SuggestResult` = `{ ok: true; explanation; confidence; needsFromHuman; edits; lines; rejected; structural; effect?: { before; after; newProblems: string[]; newWarnings: string[] } } | { ok: false; message }`.
- [ ] Testes com `ask` falso e a checagem real no projeto das quatro causas: proposta boa → `before 3, after 0`; proposta que cria problema → `newProblems` com o título; `ask` que lança → `ok: false` com frase; projeto que não abre → `ok: false`. Ver falhar, implementar, ver passar.

### Task 4: Tela

**Files:** Modify `issue-groups-list.tsx` (prop `onSuggest`, botão e cartão), `workspace.tsx` (liga a action); Test `issue-groups-list.dom.test.tsx` (novo)
- [ ] Testes (jsdom, `onSuggest` falso): clique → "Asking…" → cartão com explicação, linhas e efeito; "Apply" chama `onApplyEdits` com as edições e fecha; sem edições não há "Apply" e aparece o que falta; erro vira frase; problema novo e valor estrutural aparecem como avisos. Ver falhar, implementar, ver passar.

### Task 5: Chamada real, docs e commit

- [ ] Uma chamada real (centavos) pelo serviço, no projeto das quatro causas, causa "Door RO height differs": conferir que a API aceita os parâmetros e que a proposta volta validada; registrar modelo, tokens e custo.
- [ ] Tela (app local sem login, com a chave do `.env.local`): botão → cartão → Apply na Matilda; captura em `out/s51/`.
- [ ] Docs (`10-design.md` §4 e §7, `03-sessoes.md`, `04-decisoes.md`), `pnpm check`, build, commit.
