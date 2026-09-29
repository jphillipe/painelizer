# Panelizer — motor de painelização de paredes (light wood frame, EUA)

Leia `docs/00-visao.md` na primeira sessão. O plano de trabalho está em `docs/03-sessoes.md`.
Decisões tomadas estão em `docs/04-decisoes.md` — consulte antes de perguntar.
Perguntas que só a fábrica responde estão em `docs/05-pendencias.md`, com a hipótese em vigor — use a hipótese, não invente.

## Regras invioláveis
- Unidades: polegadas decimais em todo o `packages/core`. Formatação pés-pol-fração só em `src/units.ts`.
- `packages/core` NUNCA importa React, DOM, Node `fs` ou faz rede. Só funções puras.
- Toda função em `src/rules/` tem teste em `test/rules/`. Sem teste não faz commit.
- Fixtures em `test/fixtures/*.json` são a verdade. Se um teste falhar, corrija o código, não o fixture —
  a menos que o humano confirme que o fixture estava errado.
- Headers: só de `src/data/irc-headers.json`. Vão fora da tabela retorna `{ requiresEngineer: true }`. Nunca extrapolar.
- Layout de studs: borda esquerda do stud na marca (0, 16, 32…), medida da esquerda da parede (x=0).
  Último stud sempre encostado no fim da parede (x = comprimento − 1.5).
- Coordenadas de peça (`x`, `y`) = canto inferior esquerdo. y=0 é a base da bottom plate.
- Antes de implementar qualquer regra de framing, explique a abordagem em até 5 linhas e aguarde confirmação.
- Uma sessão = um item de `docs/03-sessoes.md`. Ao terminar: marcar o item, registrar decisões novas em
  `docs/04-decisoes.md` e sugerir uma mensagem de commit descrevendo a regra (não o código).
- NUNCA rodar `git commit` ou `git push`. Quem commita é o humano. Deixar as mudanças no working tree.
- Sem IA generativa dentro do motor. O motor é determinístico.

## Comandos
- `pnpm test` — vitest
- `pnpm typecheck` — tsc --noEmit

## Glossário mínimo
stud, plate (bottom/top/double top), king stud, jack stud (trimmer), header, sill, cripple, rough opening (RO),
OC (on center), ply. Definições em `docs/02-framing.md`.
