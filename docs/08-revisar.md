# 08 — Revisar com a fábrica

Gerado por `pnpm hipoteses` em 2026-10-13. Não edite à mão: a fonte é `05-pendencias.md` (pendência aberta = hipótese em vigor) e os comentários do código que citam o número da pendência. Quando a fábrica responder, registre a resposta em `05-pendencias.md`, mude o código nos pontos listados, confirme fixtures e rode o script de novo.

**23 hipóteses em vigor**, 11 pendências respondidas.

| P | Assunto | Hipótese em vigor | Onde mexer quando responderem |
|---|---|---|---|
| P1 | Painéis reais | fixtures sintéticos | `packages/cli/src/build.ts:114` |
| P8 | Peso por peça | tabela fixa em `src/data/lumber.json` | — |
| P10 | Tabela IRC em vigor | IRC 2021 sem emenda local em R602.7 | `packages/core/src/rules/headers.ts:3`, `packages/core/src/rules/openingHeader.ts:5`, `packages/core/src/types.ts:100` |
| P15 | Peso máximo do painel | sem limite de peso até a resposta; só comprimento (240") | — |
| P16 | Aberturas muito próximas | < 4.5" é erro; entre 4.5" e 6" um king colado ao jack da esquerda; kings compartilhados = maior número das duas aberturas | `packages/core/src/rules/zones.ts:11`, `packages/core/test/fixtures/wall-144-window-door.json:2` |
| P17 | Escolha de header pela tabela e parede não portante | (a) menor altura de seção, depois menos plies, respeitando a espessura da parede; (b) `headerFor` devolve `{ nonBearing: true }` e quem chama decide | `packages/core/src/rules/headers.ts:13`, `packages/core/src/rules/headers.ts:27`, `packages/core/src/rules/headers.ts:6` |
| P18 | Header deitado em parede não portante: detalhes | (a) seção da parede; (b) 1 king + 1 jack como na portante, a peça apoiada nos jacks; (c) sem cripples, como respondido | `packages/core/src/rules/openingHeader.ts:10`, `packages/core/test/fixtures/wall-120-door-nonbearing.json:2` |
| P19 | Layout: stud centrado na marca ou borda na marca? | centrado (regra nova em S11, muda todos os fixtures com confirmação) | `packages/core/src/rules/studs.ts:10`, `packages/core/test/fixtures/wall-120-door-nonbearing.json:2`, `packages/core/test/fixtures/wall-120-door.json:2`, `packages/core/test/fixtures/wall-144-plain.json:2`, `packages/core/test/fixtures/wall-144-window-82.5.json:2` (+3) |
| P20 | Cripple curto acima do header | cripple em pé para qualquer vão ≥ 1.5" (regra atual) | `packages/core/src/rules/openings.ts:38`, `packages/core/test/fixtures/house-tee.json:2` |
| P21 | Referência de medida das paredes e canto | eixo; a mais longa atravessa, com sobrescrita por ponta; layout da quina do prédio | `packages/core/src/house/connections.ts:2`, `packages/core/src/house/frame.ts:4`, `packages/core/src/house/types.ts:37`, `packages/core/src/house/types.ts:4`, `packages/core/test/fixtures/house-28x40.json:2` (+1) |
| P22 | Ladder blocking no T | 3 blocos da seção da parede, deitados, centros em 24, 48 e 72 do subfloor (4 blocos em parede de 9'); stud de ponta comum | `packages/core/src/rules/corners.ts:13`, `packages/core/src/rules/corners.ts:4`, `packages/core/src/rules/corners.ts:40`, `packages/core/src/types.ts:405`, `packages/core/test/fixtures/house-tee.json:2` |
| P23 | Lap da double top plate entre painéis da mesma parede | avança 48" presa ao painel, mínimo 24" | — |
| P24 | Orientação da folha | vista de fora, face externa indicada no desenho | `packages/core/src/output/svg.ts:5` |
| P25 | Sill dupla: limite e montagem | só quando o projeto pede (`config.doubleSillOver`, ausente = simples), segunda peça sob a primeira | `packages/core/src/rules/openings.ts:14` |
| P26 | Studs extras agrupados | colados na mesa, 2x apenas; 4x/6x fica para o engenheiro | `packages/core/src/panelize/panelizeWall.ts:18` |
| P27 | Altura da parede do Ringgold | parede 9'-1 1/8" (stud pré-cortado 104 5/8", piso ~10 7/8") | `packages/cli/examples/ringgold-checkpoint.json:2` |
| P28 | RO do par de janelas tipo A | RO 58 1/2" x 72 1/2", topo do RO a 96 1/4" do subfloor | `packages/cli/examples/ringgold-checkpoint.json:2` |
| P29 | RO da porta 1 (36x80 com batente metálico, 45 min) | 38" x 82 1/2", igual à porta de madeira (P4) | `packages/cli/examples/ringgold-checkpoint.json:2` |
| P30 | Porta 1 e janela vizinhas na parede sul com 8 1/4" entre os RO | 1 jack por lado nas duas (aviso `HEADER_JACKS_BELOW_TABLE`). O motor põe 1 king da porta e 2 kings da janela com 3/4" de ar entre eles, em vez de king compartilhado — perguntar o que a fábrica faz | `packages/cli/examples/casa-exemplo.json:2` |
| P31 | Cargas do Ringgold para as tabelas | 30 psf, 29'-0" (profundidade do prédio), 130 mph exposição B; parede do 1º pavimento suporta 2 pavimentos (`floorsSupported: 2`, center-bearing). Se a I1 for portante (direção das vigas), muda o header | `packages/cli/examples/ringgold-checkpoint.json:2` |
| P32 | Folga de RO de janela | +1/2" na largura e +3/4" na altura sobre o tamanho nominal do caixilho | `packages/cli/examples/casa-exemplo.json:2`, `packages/core/src/rules/catalog.ts:12`, `packages/core/src/rules/catalog.ts:26` |
| P33 | Folga de RO de porta com batente de madeira | +2" x +2 1/2" | `packages/cli/examples/casa-exemplo.json:2`, `packages/cli/examples/ringgold-checkpoint.json:2`, `packages/core/src/rules/catalog.ts:28` |
| P34 | Folga de RO de porta com batente metálico (HM) ou alumínio | +4 1/2" x +3" | `packages/cli/examples/ringgold-checkpoint.json:2`, `packages/core/src/rules/catalog.ts:12`, `packages/core/src/rules/catalog.ts:30`, `packages/core/src/rules/catalog.ts:32` |

## Respondidas

- P2 — Altura de header
- P3 — Cripple encostado no jack
- P4 — Porta: RO altura
- P5 — Cantos e T
- P6 — Módulo de 48"
- P7 — Pré-corte de stud
- P9 — Comprimentos comerciais em estoque
- P11 — Fire blocking
- P12 — DXF disponível?
- P13 — "Praticamente junto" ao jack
- P14 — Emenda de plate em painel > 16'
