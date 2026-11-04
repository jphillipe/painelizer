# Panelizer

Motor de painelização de paredes light wood frame (EUA, IRC 2021) para uma fábrica de painéis: dada a planta da
casa, gera os painéis de parede com studs, aberturas, headers pela tabela IRC, cantos e T, a folha de fabricação de
cada painel, a lista de corte, a BOM e a planta de painéis. A planta entra por JSON, pelo editor do app ou pela
leitura do conjunto de PDFs do arquiteto por IA — que só lê; o cálculo é determinístico. Visão e escopo em
[`docs/00-visao.md`](docs/00-visao.md) e [`docs/01-escopo-v1.md`](docs/01-escopo-v1.md).

| Pacote | O que é |
|---|---|
| `packages/core` | O motor: funções puras em polegadas decimais, sem DOM, Node nem rede. Regras em `src/rules/`, tabelas IRC em `src/data/`, saídas (SVG da folha e da planta, cutlist, BOM) em `src/output/`. |
| `packages/cli` | Formato do projeto (`src/project.ts`) e o CLI `panelizer build`: CSVs e SVGs a partir de um JSON. |
| `packages/extract` | Leitura das plantas em PDF pela API do Claude → projeto do CLI, com confiança e evidência por campo. |
| `packages/web` | App Next.js 16 (upload e leitura, editor de planta, painéis, PDF) com login e projetos no Supabase. |

## Requisitos

- Node 22 ou mais novo (o CI e a imagem usam o 22).
- pnpm 10.8.1 — `corepack enable` usa a versão do `packageManager` do `package.json`.
- Para a leitura por IA: uma chave da API da Anthropic. Para login e projetos salvos: um projeto Supabase.

## Comandos

```bash
pnpm install
pnpm test          # vitest nos 4 pacotes
pnpm typecheck     # tsc --noEmit (TypeScript 7) nos 4 pacotes
pnpm lint          # ESLint na raiz (eslint.config.mjs); por pacote: pnpm --filter web lint
pnpm check         # lint + typecheck + test
pnpm --filter web build   # next build, como o CI e o deploy
pnpm format:check  # Prettier só confere (o reformat geral do código ainda não foi feito)
pnpm hipoteses     # regenera docs/08-revisar.md
```

O CI (`.github/workflows/ci.yml`) roda install, lint, typecheck, test e `next build` em todo PR e push fora da
`main`; o push na `main` faz o mesmo e publica (`deploy.yml`).

## App web

```bash
cp packages/web/.env.example packages/web/.env.local   # e preencha
pnpm web                                               # http://localhost:3000
```

Variáveis (comentadas em [`packages/web/.env.example`](packages/web/.env.example)): `ANTHROPIC_API_KEY` (sem ela a
leitura por IA fica desligada e o resto funciona), `EXTRACT_MODEL`/`EXTRACT_EFFORT` (opcionais) e
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Sem Supabase o app roda sem login em
desenvolvimento (projeto só no navegador); em produção `/app` fica bloqueado. Criar o projeto, aplicar as
migrações e o bucket de desenhos: [`supabase/README.md`](supabase/README.md).

## CLI do motor

```bash
pnpm panelizer build packages/cli/examples/casa-exemplo.json --out saida/
```

Gera `cutlist.csv`, `bom.csv`, `panels.csv`, `plan.svg` (planta de painéis, só em projeto em planta) e
`panels/<id>.svg` (a folha de fabricação de cada painel, id `{pavimento}-{parede}-P{n}`; abra e imprima no
navegador). Entrada: `{ "name", "date"?, "revision"?, "config", "walls": [...], "stockLengths"? }`, medidas em
polegadas decimais ou pés-pol-fração (`"12'-0\""`, `"92 5/8\""`). Parede **em planta** (`start`/`end` no eixo; o
motor resolve cantos, T e comprimento de plate) ou **solta** (`length`), sem misturar os dois no mesmo arquivo.
Aberturas direto (`offset`, `roughWidth`…) ou pelo catálogo do projeto (`type`, `center`, `headerMark`). Formato
completo em `packages/cli/src/project.ts`; exemplos em `packages/cli/examples/`.

## Leitura por IA (extract)

```bash
pnpm extract "docs/examples/planta.pdf" --out saida-extracao/              # chamada paga (~US$ 1–2)
pnpm extract "docs/examples/planta.pdf" --out saida-extracao/ --dry-run    # só monta o pedido, sem API
pnpm --filter extract read-set --out saida/ <pasta-com-PDFs>                # conjunto (uma folha por PDF)
pnpm --filter extract eval <extracao.json>                                  # compara com a verdade do Ringgold
```

Escolhe as folhas úteis pelo carimbo (ou `--pages 3,15`), manda à API e grava `projeto.json` (entrada do `build`),
`extracao.json` (resposta com confiança e evidência), `revisao.md` e `paginas/<n>.txt`. Precisa de
`ANTHROPIC_API_KEY` no ambiente, exceto com `--dry-run` ou `--response <json>` (pós-processa uma resposta
gravada). O teste que chama a API de verdade só roda com `EXTRACT_LIVE=1`. `pnpm extract --help` lista as opções.

## Deploy

Cloud Run (`us-east1`), imagem pelo `Dockerfile` da raiz. Cada push na `main` passa pelo `check` e publica pelo
GitHub Actions; se o `/api/health` da revisão nova falhar, o tráfego volta para a anterior. Primeira configuração,
variáveis, segredo e o script manual em [`docs/12-hospedagem-cloud-run.md`](docs/12-hospedagem-cloud-run.md).

## Mapa dos docs

| Arquivo | O quê |
|---|---|
| [`00-visao`](docs/00-visao.md) | Visão, fases e ordem de construção |
| [`01-escopo-v1`](docs/01-escopo-v1.md) | O que está dentro e fora da v1 |
| [`02-framing`](docs/02-framing.md) | Glossário, convenções do motor, regras IRC, avisos e erros |
| [`03-sessoes`](docs/03-sessoes.md) | O plano de trabalho, sessão a sessão, com "Feita em …" |
| [`04-decisoes`](docs/04-decisoes.md) | Decisões tomadas (consultar antes de perguntar) |
| [`05-pendencias`](docs/05-pendencias.md) | Perguntas para a fábrica, cada uma com a hipótese em vigor |
| [`06-referencias-projetos`](docs/06-referencias-projetos.md) | O que os projetos de arquiteto em `docs/examples` dizem |
| [`07-perguntas-fabrica`](docs/07-perguntas-fabrica.md) | Arquivado (roteiro de reunião de 2026-10-12) |
| [`08-revisar`](docs/08-revisar.md) | Gerado por `pnpm hipoteses`: hipóteses em vigor e onde mexer quando a fábrica responder |
| [`09-checkpoint-3`](docs/09-checkpoint-3.md) | Checkpoint da casa inteira |
| [`10-design`](docs/10-design.md) | Design do app: telas, tokens, componentes |
| [`11-revisao-app`](docs/11-revisao-app.md) | Revisão do app de 2026-10-20 (M1–M10, executada) |
| [`12-hospedagem-cloud-run`](docs/12-hospedagem-cloud-run.md) | Hospedagem e deploy |
| [`13-revisao-2026-11`](docs/13-revisao-2026-11.md) | Revisão de 2026-11-04: diagnóstico e plano S23–S34 |
| [`14-prancha-fabrica`](docs/14-prancha-fabrica.md) | A prancha da fábrica de 2026-10-28 e o que ela pede |

Mensagens: os avisos e erros do motor têm código (`packages/core/src/messages.ts`, frase em português para CLI e
folha); o app mostra a sua frase em inglês a partir do código (`packages/web/src/lib/messages.en.ts`). Os da leitura
estão em `packages/extract/src/notices.ts`.

Trabalho com Claude Code: regras em [`CLAUDE.md`](CLAUDE.md); uma sessão por item de `docs/03-sessoes.md`.
