# S45 — Avisos aparecem na lista de issues mesmo com erro (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lista de issues do editor mostra os avisos das paredes que o motor conseguiu montar também quando outra parede dá erro — o revisor resolve um aviso (ex.: `FLAT_HEADER_CRIPPLES`) antes de gerar os painéis.

**Architecture:** O motor já devolve os painéis das paredes boas junto com os problemas (`panelizeProject` em `cli/build`). Quem descarta os avisos é a checagem do app: `check` (`services/panels.service.ts`) devolve só `problems`, e o editor (`wall-editor.tsx`) só lê `problems` quando `ok: false`. A mudança é nesses dois pontos e no tipo `CheckResult`. Motor e CLI não mudam.

**Tech Stack:** TypeScript 7, Next.js 16, vitest (+ jsdom nos testes `*.dom.test.tsx`), pnpm workspaces (`packages/web`).

**Spec:** desenho aprovado pelo humano na conversa de 2026-11-12 (registrado em `docs/04-decisoes.md` na Task 3):
1. A checagem devolve erros e avisos juntos; a lista mostra os dois, erros em cima (a ordem de `groupIssues` já é essa).
2. Parede com erro não é montada: os avisos dela só aparecem depois que o erro dela for resolvido.
3. Só o app muda. "Generate" continua bloqueado enquanto houver erro.
4. Mostrar todas as aberturas com erro de uma parede (hoje só a primeira) fica fora — exige mudar o motor.

## Global Constraints

- `packages/core` e `packages/cli` não mudam.
- Textos que chegam ao usuário em inglês.
- Um commit só, no fim (uma sessão = um item), com mensagem que descreve a regra. Sem `prettier --write`.
- `pnpm check` e `pnpm --filter web build` passam antes do commit.
- O parágrafo do Supabase em `docs/04-decisoes.md` e `supabase/README.md` são de outra sessão e ficam fora do commit.

## Review Focus

1. Arquivo que nem abre (JSON inválido, projeto inválido): `check` continua igual ao `generate` — sem chave `warnings`, sem exceção. → teste existente 'problemas iguais aos do generate' continua passando (Task 1).
2. Planta que não fecha (`frameWalls` lança): nenhum painel, `warnings` vazio, só o problema da planta. → teste na Task 1.
3. Erro numa parede e aviso em outra: a contagem por parede (`byWall`) dá problema numa e aviso na outra; "Generate" continua desabilitado. → teste na Task 2.
4. Checagem `ok: true`: nada muda (mesmos avisos de antes). → teste existente 'mesmos painéis e avisos do generate' (Task 1).
5. Aviso de parede boa não some nem duplica quando o draft também aponta um problema próprio (`dropRepeated` só tira issue com `kind`). → teste na Task 2.

---

### Task 1: A checagem devolve os avisos junto com os problemas

**Files:**
- Modify: `packages/web/src/types/panels.ts` (`CheckResult`, variante `ok: false`: `warnings?: Notice[]`)
- Modify: `packages/web/src/services/panels.service.ts` (`check`)
- Test: `packages/web/src/services/panels.service.test.ts`

**Interfaces:**
- Produces: `CheckResult = … | { ok: false; problems: Notice[]; warnings?: Notice[]; walls?: WallBreaks[] }`. `warnings` presente (pode ser `[]`) sempre que a painelização rodou; ausente quando o arquivo não abriu.

- [ ] **Step 1: Testes que falham** em `describe('panels.service.check')`:
  - `'S45: erro numa parede não esconde os avisos das outras'` — projeto com duas paredes soltas, `config: { studSpacing: 16, studLength: [92.625], headerHeight: 82.5, building: { groundSnowLoad: 50, buildingWidth: 336 } }`: `W1` (240 × 97.125, 2x6, externa, portante, `floorsSupported: 2`, janela `J` offset 48 RO 144 × 48 → `HEADER_OUT_OF_TABLE`) e `W2` (120 × 97.125, 2x4, interna, não portante, porta `D1` offset 40 RO 38 × 68 com `headerHeight: 68` → peça deitada com topo em 69.5, a 24.625" da top plate). Esperado: `ok: false`; `problems` = um `HEADER_OUT_OF_TABLE` de `W1`/`J`; `warnings` = `[objectContaining({ source: 'engine', code: 'FLAT_HEADER_CRIPPLES', wallId: 'W2', openingId: 'D1', panelId: stringContaining('W2') })]`.
  - `'S45: planta que não fecha: só o problema da planta, avisos vazios'` — duas paredes em planta que se cruzam (`WALLS_CROSS`): `ok: false`, `warnings` igual a `[]`.
- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter web test -- panels.service` → `warnings` undefined.
- [ ] **Step 3: Implementar** — em `check`, no ramo `problems.length > 0`, acrescentar `warnings: summarize(panels).warnings`; tipo com `warnings?: Notice[]`.
- [ ] **Step 4: Rodar e ver passar** — `pnpm --filter web test -- panels.service` → 0 falhas (os dois testes existentes do `check` inclusive).

### Task 2: O editor lista erros e avisos juntos

**Files:**
- Modify: `packages/web/src/app/app/_components/editor/wall-editor.tsx` (memo `issues`)
- Test: `packages/web/src/app/app/_components/editor/wall-editor.dom.test.tsx`

**Interfaces:**
- Consumes: `CheckResult` da Task 1. `parseEngineResult` (`lib/editor/problems.ts`) já aceita `{ problems?, warnings? }` — passa a receber os dois.

- [ ] **Step 1: Teste que falha** — `describe('WallEditor: avisos junto com erros (S45)')`: carrega um exemplo solto (`EXAMPLES`), renderiza com `check = { status: 'done', revision: 0, stale: false, result: { ok: false, problems: [HEADER_OUT_OF_TABLE numa parede do exemplo], warnings: [FLAT_HEADER_CRIPPLES em outra parede do exemplo] } }`. Esperado na tela: o título `Header outside the IRC table — engineer required` **e** o título `Flat header framed with cripples — factory to review`; o botão de gerar continua desabilitado.
- [ ] **Step 2: Ver falhar** — `pnpm --filter web test -- wall-editor.dom` → o título do aviso não está no documento.
- [ ] **Step 3: Implementar** — no memo `issues`: `parseEngineResult(check.result.ok ? { warnings: check.result.warnings } : { problems: check.result.problems, warnings: check.result.warnings ?? [] }, ids)`.
- [ ] **Step 4: Ver passar** — `pnpm --filter web test` → 0 falhas.

### Task 3: Conferência no app, docs e commit

**Files:**
- Modify: `docs/03-sessoes.md` (S45 em "Planta real"), `docs/04-decisoes.md` (2026-11-12)

- [ ] **Step 1: App** — `pnpm web`, abrir a Matilda salva: a lista mostra os erros de header **e** o grupo `Flat header framed with cripples — factory to review × 18`; clicar numa porta, dar um header à abertura e ver o aviso dela sumir (sem salvar a mudança).
- [ ] **Step 2: Docs** — os dois arquivos acima.
- [ ] **Step 3: Verificação completa** — `pnpm check` (exit 0) e `pnpm --filter web build` (exit 0).
- [ ] **Step 4: Commit** — só os arquivos desta sessão.
