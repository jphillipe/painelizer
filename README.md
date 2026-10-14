# Panelizer

Motor de painelização de paredes para light wood frame. Ver `docs/00-visao.md`.

## Setup (uma vez)
```bash
pnpm init               # se ainda não houver package.json na raiz (pnpm 10 não aceita -y)
mkdir -p packages/core/src/rules packages/core/src/panelize packages/core/src/output packages/core/src/data packages/core/test/rules
cd packages/core
pnpm init
pnpm add -D typescript vitest
npx tsc --init --strict --target ES2022 --module ESNext --moduleResolution bundler --outDir dist
```

Adicione em `packages/core/package.json`:
```json
"scripts": { "test": "vitest run", "test:watch": "vitest", "typecheck": "tsc --noEmit" }
```

Crie `pnpm-workspace.yaml` na raiz:
```yaml
packages:
  - packages/*
```

Na raiz, `package.json` delega para os pacotes:
```json
"scripts": { "test": "pnpm -r test", "typecheck": "pnpm -r typecheck" }
```

Pendências com a fábrica (painéis reais, altura de header, cantos…) em `docs/05-pendencias.md`.

## Começar a trabalhar
```bash
claude
```
Primeiro prompt: ver `docs/03-sessoes.md`, sessão 1.

## Usar o CLI
```bash
pnpm panelizer build packages/cli/examples/casa-exemplo.json --out saida/
```
Gera `saida/cutlist.csv`, `saida/bom.csv`, `saida/panels.csv`, `saida/plan.svg` (planta de painéis, só em projeto em
planta) e `saida/panels/<id>.svg` (a folha de fabricação de cada painel, id `{pavimento}-{parede}-P{n}`, S16/S17:
cabeçalho com nome, `date` e `revision` do projeto, elevação cotada com a vista indicada (P24), lista de peças,
peso, cortes na obra e avisos; abra e imprima no navegador).
Entrada: `{ "name", "date"?, "revision"?, "config", "walls": [...], "stockLengths"? }` — medidas em polegadas decimais ou
pés-pol-fração (`"12'-0\""`, `"92 5/8\""`). Cada parede vem **em planta** (`start`/`end` no eixo da parede,
S13: o motor resolve cantos, T, comprimento de plate e origem de layout) ou **solta** (`length`); os dois
formatos não se misturam no mesmo arquivo. Montagem de canto e T em `config.corner` (`california` | `three-stud`)
e `config.tee` (`ladder` | `backer`), S14; sem eles, California corner e ladder blocking (P5). Ver `packages/cli/examples/casa-exemplo.json` e `packages/cli/src/project.ts`.

## Extrair paredes de um PDF (S18, biblioteca; o comando vem na S19)
`packages/extract`: `extractWalls({ pdf, pages })` manda as páginas da planta (A-1xx) e do schedule (A-8xx) para a API
do Claude e devolve o JSON de entrada do CLI, com confiança e evidência por parede e abertura e um relatório de
revisão em Markdown. Precisa de `ANTHROPIC_API_KEY` no ambiente; a saída é revisada por humano antes de rodar o
`build`. O core não chama IA: a extração fica fora do motor.
