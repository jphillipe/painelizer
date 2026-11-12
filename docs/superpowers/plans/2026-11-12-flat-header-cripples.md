# S44 — Peça deitada a mais de 24" da top plate: cripples + aviso (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abertura em parede não portante cuja peça deitada (R602.7.4) fica a mais de 24" da top plate deixa de ser erro: o painel sai com a peça deitada, cripples acima e um aviso para a fábrica revisar.

**Architecture:** A decisão mora em `rules/openings.ts` (`framingForOpening`): `openingGeometry` para de lançar `FLAT_HEADER_GAP`, `openingCripples` passa a pôr cripples sobre a peça deitada quando o vão passa de 24", e `framingForOpening` acrescenta o aviso `FLAT_HEADER_CRIPPLES` (hipótese P55). O erro `FLAT_HEADER_GAP` deixa de existir. A folha marca a linha da abertura com ▲; o app ganha frase, título e ajuda do aviso.

**Tech Stack:** TypeScript 7, vitest, pnpm workspaces (`packages/core`, `packages/web`).

**Spec:** desenho aprovado pelo humano na conversa de 2026-11-12 (registrado em `docs/04-decisoes.md` na Task 4):
1. Vão ≤ 24" entre o topo da peça deitada e a top plate: nada muda (sem cripples, sem aviso).
2. Vão > 24": mantém a peça deitada e acrescenta cripples acima, nas marcas de layout, até a top plate.
3. A abertura ganha um aviso no lugar do erro: "…framed with cripples above; factory to review".
4. Abertura com `header` do projeto: como hoje, sem aviso.
5. RO > 96": continua `FLAT_HEADER_SPAN`.
6. O aviso aparece no app (lista de avisos), no `panels.csv` e na folha (linha da abertura com ▲).
7. Hipótese nova P55 em `docs/05-pendencias.md`.

## Global Constraints

- Unidades em polegadas decimais; `packages/core` sem React/DOM/fs/rede; só funções puras.
- Toda função de `src/rules/` tem teste em `test/rules/`.
- Fixtures existentes não mudam. O fixture novo é calculado à mão e leva `$comment` com "not confirmed by the human — review".
- Textos que chegam ao usuário em inglês (motor e app).
- Um commit só, no fim (regra do projeto: uma sessão = um item), com mensagem que descreve a regra. Sem `prettier --write`.
- `pnpm check` e `pnpm --filter web build` passam antes do commit.

## Review Focus

1. Janela (não porta) não portante com vão > 24": cripples acima **e** abaixo da sill, um aviso só. → teste na Task 1.
2. Vão exatamente 24": sem cripples, sem aviso (fronteira). → teste na Task 1.
3. RO estreito sem marca de layout dentro (ex.: 14"): sem cripple possível, mas o aviso sai mesmo assim. → teste na Task 1.
4. Parede dividida em painéis: o aviso fica só no painel que tem a abertura. → teste na Task 1 (`splitWall`).
5. Duas aberturas que compartilham king (zona fundida), as duas com vão > 24": um aviso por abertura, cripples nas duas. → teste na Task 1 (`panelizeWall`).

---

### Task 1: Regra no motor (peça deitada + cripples + aviso)

**Files:**
- Create: `packages/core/test/fixtures/wall-120-door-nonbearing-tall.json`
- Modify: `packages/core/src/rules/openings.ts` (doc do topo, `framingForOpening`, `openingGeometry`, `openingCripples`)
- Modify: `packages/core/src/messages.ts` (`WARNING_CODES` +`FLAT_HEADER_CRIPPLES`, 15 avisos; `ENGINE_ERROR_CODES` −`FLAT_HEADER_GAP`; frases)
- Modify: `packages/core/src/rules/openingHeader.ts` (só o comentário do item 3 e de `FLAT_HEADER_MAX_GAP`)
- Test: `packages/core/test/rules/openings.test.ts`, `packages/core/test/panelize/panelizeWall.test.ts`, `packages/core/test/panelize/splitWall.test.ts`, `packages/core/test/messages.test.ts`, `packages/cli/test/schema.test.ts` (contagem de fixtures, se o novo for registrado lá)

**Interfaces:**
- Produces: aviso `{ code: 'FLAT_HEADER_CRIPPLES', wallId, openingId, params: { top, gap, topPlate, max }, hypothesis: 'P55' }` em `OpeningFraming.warnings` (e daí em `Panel.warnings`).
- Frase do motor: `flat header (R602.7.4) with its top at ${inch(top)} sits ${inch(gap)} below the top plate (${inch(topPlate)}), over the ${inch(max)} limit — framed with cripples above; factory to review` (prefixada por `at(w, …)` como as outras).

**Fixture `wall-120-door-nonbearing-tall.json`** (a porta interna do Matilda Pines): config `{ studSpacing 16, studThickness 1.5, plateThickness 1.5, studLength [105.625], headerHeight 81.5 }`; parede `W-door-nonbearing-tall`, 120 × 110.125, 2x4, interna, não portante; porta `door1` offset 40, RO 38 × 81.5. Esperado, 16 peças:
- bottomPlate 120 em y 0; topPlate 120 em y 107.125; doubleTopPlate 120 em y 108.625;
- studs 105.625 em x 0, 15.25, 31.25, 95.25, 111.25, 118.5 (y 1.5);
- kings 105.625 em x 37 e 79.5; jacks 80 em x 38.5 e 78;
- header 2x4 deitado, 41, x 38.5, y 81.5, plies 1, `flat: true`;
- cripples 24.125 em x 47.25 e 63.25, y 83;
- fieldCuts: bottomPlate door1 x 40 length 38; warnings: `[{ "code": "FLAT_HEADER_CRIPPLES" }]`;
- `expected.header`: `{ section '2x4', plies 1, jackStuds 1, kingStuds 1, source 'R602.7.4', flat true }`.

- [ ] **Step 1: Testes que falham**
  - `openings.test.ts`: o caso 'topo da peça a exatamente 24"…; a mais, Error' vira: em 68.625 não lança, sem cripple acima e sem aviso; em 68.5 não lança, `warnings` = um `FLAT_HEADER_CRIPPLES` com `params.gap` 24.125 e `hypothesis` 'P55', cripples acima em y 70 com length 24.125 **e** os de baixo da sill continuam (Review Focus 1 e 2). Com header do projeto: sem aviso.
  - `openings.test.ts`: fixture novo — 16 peças, 2 cripples acima, corte na obra, um aviso.
  - `openings.test.ts`: RO de 14" sem marca dentro e vão > 24": zero cripples, um aviso (Review Focus 3).
  - `panelizeWall.test.ts`: fixture novo passa exatamente (16 peças, `warnings` com o código); duas portas com king compartilhado e vão > 24": dois avisos, cripples nas duas (Review Focus 5).
  - `splitWall.test.ts`: parede de 300" × 110.125 não portante com uma porta: o aviso está só no painel da porta (Review Focus 4).
  - `messages.test.ts`: 15 avisos.
- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter core test` → falhas com `FLAT_HEADER_GAP` lançado / fixture / contagem 14.
- [ ] **Step 3: Implementar**
  - `openingGeometry`: remover o `throw FLAT_HEADER_GAP`.
  - `openingCripples`: cripples acima quando `!header.flat || above > FLAT_HEADER_MAX_GAP + EPS` (mesmas marcas de `crippleMarks`, `y = headerTop`, `length = above`).
  - `framingForOpening`: quando `header.flat && g.topPlateY − g.headerTop > FLAT_HEADER_MAX_GAP + EPS`, `warnings.push(warning('FLAT_HEADER_CRIPPLES', { wallId, openingId }, { top, gap, topPlate, max }, 'P55'))`.
  - `messages.ts`: código e frase novos; remover `FLAT_HEADER_GAP`; comentário "Os 15 avisos".
  - Comentários das regras (topo de `openings.ts`, item 3 de `openingHeader.ts`) dizendo a regra nova e citando P55.
- [ ] **Step 4: Rodar e ver passar** — `pnpm --filter core test` e `pnpm --filter cli test` → 0 falhas.

### Task 2: Folha — linha da abertura com ▲

**Files:**
- Modify: `packages/core/src/output/sheet/content.ts` (grupo `openings` de `wallContentGroups`)
- Test: o teste existente do bloco "Wall content" em `packages/core/test/output/` (o que cobre `wallContentGroups`)

**Interfaces:**
- Consumes: `Panel.warnings` com `FLAT_HEADER_CRIPPLES` (Task 1).
- Produces: `ContentLine.hypothesis = 'P55'` na linha da abertura que tem esse aviso (o rodapé "▲ engineer to verify (hypotheses …)" já junta as hipóteses das linhas).

- [ ] **Step 1: Teste que falha** — painel do fixture novo: a linha de `door1` no grupo `openings` tem `hypothesis: 'P55'`; o painel de `wall-120-door-nonbearing` (vão de 10.125") não tem.
- [ ] **Step 2: Ver falhar.**
- [ ] **Step 3: Implementar** — em `wallContentGroups`, a linha de cada abertura leva `hypothesis` do aviso `FLAT_HEADER_CRIPPLES` cujo `openingId` é o dela. O aviso em si já sai na folha por `warningLine` (`svg.ts`).
- [ ] **Step 4: Ver passar**; snapshots SVG existentes não mudam.

### Task 3: App — frase, título e ajuda do aviso

**Files:**
- Modify: `packages/web/src/lib/messages.en.ts` (`ENGINE_WARNINGS` +`FLAT_HEADER_CRIPPLES`; `ENGINE_ERRORS` −`FLAT_HEADER_GAP`)
- Modify: `packages/web/src/lib/editor/issue-groups.ts` (`ISSUE_TITLES`: −`FLAT_HEADER_GAP`, +`FLAT_HEADER_CRIPPLES: 'Flat header framed with cripples — factory to review'`)
- Modify: `packages/web/src/lib/editor/issue-help.ts` (`ISSUE_HELP.FLAT_HEADER_CRIPPLES`)
- Test: `packages/web/src/lib/messages.en.test.ts` (já exige frase para todo código de `WARNING_CODES`)

**Interfaces:**
- Consumes: código e params da Task 1.
- Frase do app: `the flat header (R602.7.4) tops out at ${top}, ${gap} below the top plate (${topPlate}) — over the ${max} limit. The panel is framed with cripples above it; factory to review.`
- Ajuda: `what: 'A non-bearing opening whose flat header sits more than 24" below the top plate. The panel keeps the flat header and adds cripples above it.'`, `fix: 'Have the factory review it, or select the opening and specify a header.'`

- [ ] **Step 1: Ver falhar** — `pnpm --filter web test` depois da Task 1: `messages.en.test.ts` acusa código sem frase.
- [ ] **Step 2: Implementar** os três mapas.
- [ ] **Step 3: Ver passar** — `pnpm --filter web test`.

### Task 4: Conferência na planta real, docs e commit

**Files:**
- Modify: `docs/02-framing.md` (regra do header deitado, dois trechos), `docs/03-sessoes.md` (S44 em "Planta real"), `docs/04-decisoes.md` (2026-11-12), `docs/05-pendencias.md` (P55 nova; nota na P17b/P18), `docs/08-revisar.md` (via `pnpm hipoteses`)

- [ ] **Step 1: Matilda** — `pnpm panelizer build` na planta salva (largura 50'): nenhum `FLAT_HEADER_*` entre os problemas; os avisos `FLAT_HEADER_CRIPPLES` somam 15; os problemas que restam são só os headers portantes fora da tabela.
- [ ] **Step 2: Docs** — os cinco arquivos acima; P55: "Peça deitada a mais de 24" da top plate: a fábrica monta peça deitada com cripples ou header de pé? — hipótese: peça deitada + cripples nas marcas, com aviso".
- [ ] **Step 3: Verificação completa** — `pnpm check` (exit 0) e `pnpm --filter web build` (exit 0).
- [ ] **Step 4: Commit** — só os arquivos desta sessão (o parágrafo do Supabase em `04-decisoes.md` e `supabase/README.md` são de outra sessão e ficam fora).
