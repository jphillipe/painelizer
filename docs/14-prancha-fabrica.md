# 14 — Prancha da fábrica (2026-10-28): o que pede, o que existe, o que fazer

## Contexto

Em 2026-10-28 o Nicolas Hernandez mandou uma prancha técnica de 12 ilustrações "para o João Felipe utilizar como
referência no desenvolvimento do software de Wall Panels", mais sete imagens de referência e mensagens com pedidos
diretos. Analisado em 2026-11-04 (sessão de planejamento, plano aprovado pelo humano). Este arquivo transcreve os
pedidos, cruza cada um com o código e diz em que sessão entra (`03-sessoes.md`, Fase 8). As hipóteses que a
própria prancha traz viraram P44–P49 em `05-pendencias.md`. Nenhum código mudou nesta sessão.

Imagens recebidas (cópia em `docs/14-prancha/`):

| Arquivo | Conteúdo |
|---|---|
| `01.jpg` | Localização de colunas (posts) P-01…P-04 nos 4 cantos da escada; viga LVL sobre a escada; paredes W-12/W-13/W-14; detalhe do post na base (post base / hold-down) e no topo (LUS/HUS) |
| `02.jpg` | Wall panels: encaixe e amarração em L, T e X; "2 studs de amarração (2x contínuos)"; plywood 7/16" passando o encontro por um lado; "sem studs externos às paredes"; sequência de montagem; planta com símbolos L/T/X e numeração W-01…W-08; plywood contínuo na divisão de piso |
| `03.jpg` | Parede de 9'-10¾" com 2x4 double header, RO de 3', cripple de 9½" (Facebook) |
| `04.jpg`, `06.jpg` | JLC "Basic Wall Framing Terminology": by wall / butt wall, ladder back blocking, partition stud blocking em U, canto 3-stud e California |
| `05.jpg` | Canto California (detalhe) |
| `07.jpg` | myCarpentry: canto 3-stud com espaçadores 2x4; montagem em T |
| `08.jpg` | A prancha de 12 quadros: 1 T, 2 L, 3 X, 4 plywood na divisão de piso, 5 blocking, 6 blocos na cozinha, 7 blocos no banheiro, 8 wall types WT-1…WT-4, 9 numeração na planta, 10 posts pelas LVLs, 11 post no painel, 12 notas de código |

## As mensagens (transcrição)

> Bom dia, na wall panels do João Felipe falta colocar os blocos de madeira que vai nas paredes, destacar o wall type
> e numerar essas paredes na planta, e os blocos que vai nas cozinhas atrás dos armários e nos banheiros para
> acessórios, seguindo alturas padrões.

> E dizer o que vai nessa parede. Exemplo: na Matilda o engenheiro pediu que o plywood na divisão dos pisos ficasse
> 1 ou 2 pés para cima pra reforçar melhor a parede e não ficar alinhado com a parte exata da emenda.

> Temos que ter amarração entre as paredes mostrando isso nas wall panels. Às vezes passando na parede exterior o
> plywood no canto para pregar na outra parede, ou nas paredes de dentro quando ela for em X para que se tenha os
> jacks para sheetrock e melhor amarração dessas paredes.

Texto que acompanha a prancha (resumo): emendas em T, L e cruz; amarração dos cantos; blocking; reforços atrás dos
armários e acessórios; continuidade do plywood entre pavimentos; numeração das paredes; posts e vigas LVL na
planta. **Ressalva do autor:** dimensões e fixações são exemplos conceituais, não detalhes aprovados; MA e RI
(IRC/IBC), desenhos estruturais e engenheiro mandam; continuidade do plywood, transferência de cargas, emendas e
pregação **não devem ser regra única**. Recomendação de modelo: cada parede com id (W-01), wall type, pavimento,
dimensões, posição, aberturas, blocking, sheathing, conexões, posts e LVLs; o software gera folha e lista por
painel e aponta quais conexões precisam de validação estrutural.

Conclusão sobre encaixe: nos cantos e emendas os painéis devem se encaixar — studs mais avançados e outros
recuados, de modo que uma parede entre no espaço preparado na outra, sem saliência fora da espessura; mostrar os
encaixes em planta, em 3D e na folha; manter os elementos estruturais contínuos; o engenheiro valida.

Como isso entra no motor: **regra = função + hipótese registrada (P) + sobrescrita por projeto + "validar com
engenheiro" na folha.** Nada vira cálculo estrutural.

## Pedido a pedido

| # | Pedido (fonte) | Hoje no código | Falta | Sessão |
|---|---|---|---|---|
| 1 | Numerar as paredes na planta e **destacar o wall type** (Nicolas; prancha 8–9: WT-1, WT-1S, WT-2, WT-2S, WT-3, WT-4) | ids `W01` e `1-W01-P1` na planta (`core/src/output/planSvg.ts:163-169`); `wallType` lido pela IA (`extract/src/schema.ts:55,85-91`), copiado para a parede (`extract/src/convert.ts:151`), preservado no editor (`web/src/lib/editor/draft.ts:84`; campo "not used by the engine" em `wall-properties.tsx:76`); **o CLI ignora** (`cli/src/project.ts:357-395`) e o core não tem o campo | `config.wallTypes` (tag → seção, externa, portante, sheathing, blocking, descrição) como `openingTypes`; `wall.wallType` dá os defaults; `W01 · WT-1S` na planta e no cabeçalho da folha; extract monta o catálogo da A-800 (hoje só vai ao relatório, `convert.ts:400-406`) | **S35** |
| 2 | **Blocos** atrás dos armários de cozinha (34½–36" bancada, 54" topo do balcão, 84" armários superiores) e acessórios de banheiro (vaso 12–18", papeleira/ganchos 36–42", válvula 42", toalha 48", ducha 78–80"), "seguindo alturas padrões"; bloco 2x da espessura do stud (prancha 5–7, 12) | `role: 'block'` só no ladder do T (`core/src/rules/corners.ts:187`, `ladderBlocks` com spans entre verticais); fire blocking só avisa, limite 120" fixo (`core/src/panelize/validate.ts:41,122-133`) | `rules/blocking.ts`: fileiras de bloco entre verticais numa altura, em trecho ou na parede toda; presets por uso (kitchen, bath) e por wall type; fire blocking automático acima de `fireBlockAt` (substitui o aviso; fecha o item do escopo v1); folha com letra B, altura cotada e rótulo | **S36** |
| 3 | **Posts** 4x4/6x6 nos 4 cantos da escada (P-01…P-04) com post base/hold-down e LUS/HUS; **viga LVL** sobre a escada (prancha 1, 10, 11) | `extraStuds` = studs 2x da seção da parede (`core/src/types.ts:207-213`); 4x4/4x6/6x6 não existem (`types.ts:11`, `data/lumber.json`); LVL só em header de abertura | `wall.posts` com seção 4x4/4x6/6x6, rótulo, conector de base e de topo (texto do projeto); `role: 'post'` com largura real; `lumber.json` e estoque; BOM e folha. A viga LVL do piso **não é peça do painel**: vira rótulo do post ("LVL 2×11⅞ acima") | **S37** |
| 4 | **Encontro em X** (4 paredes): painéis encostados, amarração com studs contínuos (mín. 2x) no núcleo, plywood contínuo numa direção (prancha 3 e X; Nicolas: "paredes de dentro em X, jacks para sheetrock") | dois T no mesmo x entram duplicados (`core/src/house/connections.ts:134-138`) e `layoutPlates` lança "cuts sobrepõe" (`core/src/rules/plates.ts:116-117`); `web/src/lib/editor/perf.test.ts:16-18` evita o caso | fundir T coincidentes numa faixa de dois lados: um corte da double top, um `backer` (= os 2 studs contínuos da prancha) ou ladder dos dois lados; fixture `house-cross` | **S37** |
| 5 | **Plywood/sheathing** 7/16" passando pelo canto por um lado e pela emenda (prancha L/T/X, 2, 4); na divisão de piso subindo 1–2' (Matilda); pregação 8d @ 6" bordas / 12" campo (prancha 12) | nenhuma peça nem campo; peso "sem sheathing" (`types.ts:428`, `rules/weight.ts:7`, `output/svg.ts:578`); backlog v2 em `01-escopo:53`; o layout já centra o stud na marca para a emenda do OSB cair no stud (`rules/studs.ts:8-10`) | `rules/sheathing.ts`: chapas 4×8/4×9 verticais da marca 0, por painel; avanço da chapa da parede que **atravessa** sobre a ponta da que encosta (`+t_outra`); avanço acima da double top na linha de piso (`overhang.floorTop`, default 0; Matilda 12–24"); emenda horizontal exige fileira de blocking (S36); `Panel.sheathing`, BOM com chapas, peso com sheathing, folha com contorno das chapas e nota de pregação | **S38** |
| 6 | **"Encaixe"**: studs avançados/recuados para uma parede entrar no espaço da outra, sem sair da espessura; mostrar em planta, 3D e folha (conclusão) | é o modelo atual: quem atravessa leva a plate `+t/2`, quem encosta para `−t/2` (`house/frame.ts`, P21); California/3-stud (`config.corner`), ladder/backer (`config.tee`), laps da double top (R602.3.2), stud duplo na junta de painel (S15) — `docs/02-framing.md` "Canto, T e laps" | **mostrar**: símbolo L/T/X e "quem atravessa" na planta com legenda; na folha, por ponta: "canto com W02 — esta atravessa; plywood avança 5½"". Detalhe da junta painel-painel (stud recuado? chapa avançada?) é pergunta à fábrica (P49). 3D: backlog | **S39** (desenho), **S38** (chapa) |
| 7 | **"Dizer o que vai nessa parede"** (Nicolas; recomendação da prancha: id, wall type, pavimento, dimensões, posição, aberturas, blocking, sheathing, conexões, posts/LVLs; quais conexões precisam de validação) | cabeçalho de 3 linhas (`output/svg.ts:290-340`) + lista de corte; sem campo de notas | bloco "Conteúdo desta parede" na folha com tudo isso e "▲ validar com engenheiro" nos itens de hipótese | **S39** |
| 8 | **Amarração entre paredes** com pregação 3× 3" nails ou screws @ 12" OC (prancha 1–3, 12) | geometria sim; pregação não existe | notas de fixação por tipo de ligação (`config.nailing`; defaults = prancha, hipótese P48) impressas na folha — não é geometria | **S39** |
| 9 | Partition stud blocking em U (JLC, `04.jpg`); canto 3-stud com espaçadores 2x4 (myCarpentry, `07.jpg`) | ladder e backer; california e three-stud | `tee: 'u-block'` e espaçadores no 3-stud só se a fábrica pedir — backlog | — |
| 10 | Parede 9'-10¾" com 2x4 double header e cripple 9½" (`03.jpg`) | coberto: header do projeto, cripples acima do header | nada | — |
| 11 | Validação estrutural (toda a prancha) | avisos e `requiresEngineer` nos headers | cada item novo nasce com P e com "validar com engenheiro" na folha; nada vira cálculo | todas |

## É possível?

Sim, tudo dentro do modelo atual: catálogo como `openingTypes`/`headerSchedule` (S12.5); blocos como o ladder
(`ladderBlocks`, generalizado); posts como `extraStuds` com seção própria; X como fusão de T em
`connections.ts`; sheathing como camada por painel sobre o layout já centrado nas marcas. Fica fora: 3D (backlog
desde `01-escopo`), viga LVL do piso (não é painel; vira rótulo do post), pregação como geometria (só nota),
qualquer cálculo estrutural (o motor aponta o que validar, não valida).

## Ordem

**S23 (defeitos que perdem leitura paga, `03-sessoes` Fase 6) → Fase 8 (S35 → S36 → S37 → S38 → S39) → S24 em
diante.** É o primeiro pedido direto da fábrica com conteúdo de framing e muda o que a folha mostra — logo, o que
o Checkpoint 2 vai validar. S26 (mensagens com código) e S28.1 (fatoração) vêm depois e absorvem as regras novas.
Toda sessão da Fase 8 toca regra de framing: abordagem em até 5 linhas e confirmação antes de código; fixtures
confirmados antes de editar (CLAUDE.md).

## Entregue na Fase 8 (2026-11-05, S35–S40, por delegação — revisar com `docs/15-fase8-revisar.md`)

Tudo opcional e desligado por padrão: um projeto sem as chaves novas gera os mesmos painéis de antes. Exemplo com tudo
ligado: `packages/cli/examples/phase8-sample.json` (cartão "Phase 8 sample" no app).

| # | Pedido | O que foi entregue | Como ligar | O que falta / hipótese |
|---|---|---|---|---|
| 1 | Numerar as paredes e destacar o wall type | Catálogo de tipos que completa a parede (seção, posição, carga, descrição); `W01 · WT-1S` na planta e na folha; coluna `wall_type` no `panels.csv`; a leitura por IA monta o catálogo da A-800 (S35). Legenda dos tipos na planta (S39) | `config.wallTypes` + `wall.wallType`; no app: Project settings → Wall types e o campo "Wall type" da parede | A leitura não traz `bearing` do tipo (a A-800 não diz) |
| 2 | Blocos atrás dos armários e para acessórios do banheiro | Fileiras de bloco com o centro na cota, entre todos os studs do trecho, 8 presets (cozinha 36/54/84, banheiro 15/39/42/48/79); cota e uso na folha (S36); fire blocking também com cota | `wall.blocking` (presets ou `{ y, from?, to?, label? }`), `config.blockingPresets`, `wallTypes[tag].blocking`; no app: seção "Blocking" da parede | P44 (cota ao centro, do subfloor; um valor por faixa). Sem campo no app para os presets do projeto e o blocking do tipo |
| 3 | Posts 4x4/6x6 com conectores e viga LVL | Post 4x4/4x6/6x6 no lugar dos studs de layout, na lista de corte e na BOM; conectores e viga como texto na folha (S37) | `wall.posts`; no app: seção "Posts" da parede | P45 (post até a top plate, sem calço). Posts lidos da planta estrutural pela IA: backlog |
| 4 | Encontro em X | Feito na S31 (uma faixa, ladder ou backer); selo "+" na planta e linha no bloco da folha (S39) | automático pela planta | P46 sem resposta; a prancha escreve "X" — a planta usa "+" (P53) |
| 5 | Plywood no canto e na divisão de piso | Chapas 4x8/4x9 de pé da marca 0, cortadas no painel; avanço no canto pela parede que **encosta**; `floorTop`/`floorBottom` na linha de piso com "engineer to verify"; emenda horizontal com blocking; peso, BOM e aba Materials (S38) | `config.sheathing` (liga as externas), `wallTypes[tag].sheathing`, `wall.sheathing`; no app: Project settings → Sheathing, campo "Sheathing" da parede e do tipo | P47 (revista: quem avança), P52 (tira de 1 1/8" e uma chapa por pedaço); sem preço de chapa; otimização de corte: backlog |
| 6 | "Encaixe" mostrado na planta e na folha | Planta com selo L/T/+ e traço na parede que atravessa, legenda; folha com a ligação de cada ponta ("corner with W04 — this wall runs through") (S39) | automático | 3D: backlog; formato na P53 |
| 7 | "Dizer o que vai nessa parede" | Bloco "Wall content" sob o cabeçalho: wall/tipo, aberturas, ligações, blocking, chapa, posts, pregação, com ▲ "engineer to verify" (S39) | automático | P53 (conteúdo e ordem; folha ~80–110 px mais alta) |
| 8 | Amarração 3× 3" @ 12" OC | Nota de pregação das ligações e da chapa na folha (S39, S38) | `config.nailing.wallJoint`, `config.sheathing.nailing`; no app: Project settings → Framing (pregação das ligações) e Sheathing | P48; junta painel-painel sem pregação impressa |
| 9 | U-block e espaçadores no 3-stud | Não feito | — | backlog, só se a fábrica pedir |
| 10 | Parede com 2x4 double header | Já coberto | — | — |
| 11 | Validação estrutural | Toda regra nova tem P e ▲ na folha; nada vira cálculo | — | o engenheiro valida |

Também na S40: tabela de preços no app (Project settings → Prices: por peça de um comprimento ou por pé), que liga o
custo da aba Materials e o `cost.csv`.

## Backlog (sem sessão)

`tee: 'u-block'` e espaçadores no 3-stud; aproveitamento de chapa (corte otimizado); 3D; posts lidos da planta
estrutural pela IA (tags P-01…); viga LVL do piso como item de lista; nailing schedule por shear wall.
