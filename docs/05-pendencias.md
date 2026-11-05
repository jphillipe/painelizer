# 05 — Pendências com a fábrica

Perguntas que só a equipe de produção responde. O motor avança com hipóteses (marcadas nos fixtures e em
`04-decisoes.md`); cada resposta aqui vira uma linha em `04-decisoes.md` e, se preciso, um ajuste de fixture
com confirmação humana. Formato: `- [ ] Pn — pergunta — hipótese atual — sessão que depende`.
Respondidas: `- [x] Pn — pergunta — **Resposta (data):** resumo — impacto`.

Desde 2026-10-13 a regra é: **pendência aberta = hipótese em vigor**. Nenhuma pergunta daqui bloqueia o trabalho nem
vai ao humano; toda pendência aberta precisa ter uma `hipótese:` registrada. `pnpm hipoteses` cruza esta lista com os
comentários do código que citam `Pn` e gera `08-revisar.md`, a lista do que mexer quando a fábrica responder.

## Bloqueia o critério de sucesso
- [ ] **P1 — Painéis reais.** Obter 2 ou 3 painéis já fabricados (folha + lista de corte, de preferência um com
  janela e um com porta) e transcrever para `test/fixtures/real-*.json`. Sem isso, todos os fixtures são hipótese
  e o critério de sucesso de `01-escopo` não pode ser verificado. — hipótese: fixtures sintéticos — S7 em diante.
  Em 2026-09-30 chegou só um pacote ilustrativo (`docs/examples/Exemplos_Paineis_Prefabricados.pdf`), que não
  serve como fixture (contagens não fecham com o desenho). Pedido refeito; as perguntas P2–P12 foram respondidas.
  **Resposta (2026-10-05):** a fábrica não tem painel real — nunca fabricou esse tipo de construção; vai começar
  agora. Consequências: (a) não haverá `real-*.json` vindo da fábrica antes da primeira produção; (b) as respostas
  P2–P18 são intenção e leitura do código, não prática consolidada — podem mudar quando a produção começar;
  (c) o critério de sucesso de `01-escopo` precisa de outro caminho (decisão do humano): folhas geradas pelo
  motor revisadas pela fábrica antes de produzir, e/ou painéis transcritos dos projetos de `06-referencias`.
- [x] **P2 — Altura de header.** — **Resposta (2026-10-01):** altura padrão; topo dos RO na mesma altura sempre que
  possível, **82 1/2" do subfloor até a face inferior do header**. Nunca encostam automaticamente na top plate.
  Se o projeto estrutural ou arquitetônico indicar outra altura, segue o projeto. — Impacto: `headerHeight: 82.5`
  é o caso normal (subfloor = y=0, então o valor entra direto); sobrescrita por abertura feita na S7.1.
- [x] **P3 — Cripple encostado no jack.** — **Resposta (2026-10-01):** confirmada a hipótese: se a marca de 16"
  cai "praticamente junto" ao jack, não colocam cripple; o jack serve de layout, desde que o espaçamento máximo e
  a fixação do sheathing sejam respeitados. Fica aberta só a tolerância — ver P13. — S7 (feita com a hipótese).
- [x] **P4 — Porta: RO altura.** — **Resposta (2026-10-01):** porta padrão 6'-8" (80") usa **RO de 82 1/2"** de
  altura; largura depende da porta e do fabricante; medida do projeto ou do fabricante tem prioridade. — Impacto:
  como o header fica a 82.5 do subfloor, **o RO da porta é medido a partir do subfloor (y=0)**, não do topo da
  bottom plate: base do header = `roughHeight`. Corrige a regra `1.5 + roughHeight` da S8.

## Afeta lista de corte / material
- [x] **P5 — Cantos e T.** — **Resposta (2026-10-01):** padrão **California corner** nos cantos externos e
  **ladder blocking** nos T; muda para 3 studs ou stud de encosto quando o estrutural, o projeto ou a obra exigir.
  — Impacto: hipótese confirmada; configurável por projeto com esse default — S11.
- [x] **P6 — Módulo de 48".** — **Resposta (2026-10-01):** painéis de até **~20'-0" (240")**; quebra compatível
  com módulo de 48" sempre que possível, mas não obrigatório; peso limitado pelo equipamento de içamento e
  transporte (valor não informado — ver P15). — Impacto: máx. 16' → 240"; plates de painel > 16' não saem de uma
  peça de estoque (ver P14) — S12, S14.
- [x] **P7 — Pré-corte de stud.** — **Resposta (2026-10-01):** 8' → **92 5/8"**; 9' → **104 5/8"**; iguais para 2x4
  e 2x6. — Impacto: hipótese confirmada; um projeto com paredes de 8' e 9' precisa de mais de um pré-corte no
  config — feito na S7.1 (`config.studLength` é lista).
- [ ] **P8 — Peso por peça.** Densidade usada para estimar peso do painel (SPF ~ 1.3 lb/pé linear para 2x4,
  ~2.0 para 2x6?). Madeira confirmada: SPF No. 2 (P10). — hipótese: tabela fixa em `src/data/lumber.json` — S12.
  S15 (2026-10-13) feita com a tabela: SPF a ~35 pcf (2x4 1.28, 2x6 2.0, 2x8 2.64, 2x10 3.37, 2x12 4.1 lb/pé),
  LVL/PSL pela seção real a 42 pcf, só madeira (sem sheathing). `Panel.weightLb` vai para `panels.csv`; mudar é
  trocar o JSON e os pesos dos fixtures `wall-480-split`, `wall-240-spliced` e `house-28x40`.
  **Revista na S38 (2026-11-05, por delegação; revisar):** hipótese: o painel com sheathing pesa também a chapa —
  `sheathingPsfPerInch` = 3.2 lb/pé² por polegada de espessura em `lumber.json` (OSB ~38 pcf) → 1.4 lb/pé² para 7/16",
  sobre a área instalada (sem os vãos das aberturas). Sem chapa, só a madeira, como antes (a folha mantém "lumber only,
  no sheathing"). Pregos e isolamento continuam fora. Perguntas: a fábrica usa OSB ou plywood, e de que fornecedor
  (o peso por pé² muda)? — S38.
- [x] **P9 — Comprimentos comerciais em estoque.** — **Resposta (2026-10-01):** 2x4 e 2x6 em **8', 10', 12', 14' e
  16'**, mais os pré-cortes **92 5/8" e 104 5/8"**. — Impacto: default da BOM confirmado; falta incluir os
  pré-cortes — feito na S7.1. Preço por comprimento não informado (orçamento continua sem tabela).

## Normativo
- [ ] **P10 — Tabela IRC em vigor.** — **Resposta parcial (2026-10-01):** madeira **SPF No. 2 ou melhor**. Headers,
  beams e casos estruturais especiais seguem o structural drawings (LVL, PSL ou o que o engenheiro especificar).
  Continua aberto: Massachusetts 780 CMR 10ª edição tem emendas sobre R602.7? — Impacto: a S9 usa a coluna SPF;
  a tabela IRC é fallback quando o projeto não especifica o header, e o motor precisa aceitar header vindo do
  projeto (inclusive LVL/PSL, que hoje não existem em `Section`) — S9.
  **Resposta (2026-10-05):** vale a 10ª edição do 780 CMR, baseada no **IRC 2021** com emendas de MA (em vigor
  desde 11/10/2024; única edição desde 30/06/2025). A tabela carregada está na edição certa. Continua aberto, e
  não é mais pergunta à fábrica: ler as emendas de MA ao capítulo 6 e conferir se alteram R602.7.
  Em 2026-10-05 a S9 carregou as tabelas do **IRC 2021** (a página do ICC marca essa edição como histórica, e já
  existe a de 2024). Perguntar à fábrica: qual edição do IRC o 780 CMR em vigor adota e se há emenda em R602.7.
  Se mudar, basta trocar o JSON e rodar `headers-data.test.ts`. — hipótese: IRC 2021 sem emenda local em R602.7 — S9.
- [x] **P11 — Fire blocking.** — **Resposta (2026-10-01):** paredes de 8' e 9' não levam fire blocking horizontal
  só pela altura; quando a cavidade contínua passa de **~10'**, colocam conforme o código, além dos locais que o
  projeto e o código exigirem. — Impacto: hipótese IRC confirmada; limite 120" — S10. Na S31 o aviso virou peça
  (`config.fireBlockAt`, fileiras de bloco; altura e forma na P50).

## Entrada de dados (Fase 4)
- [x] **P12 — DXF disponível?** — **Resposta (2026-10-01):** na maioria das vezes chega só PDF; DWG/DXF às vezes.
  A fábrica recomenda pedir PDF + DWG/DXF. — Impacto: a Fase 4 não pode depender de DXF; PDF vetorial continua
  sendo a entrada principal e DXF entra como caminho preferido quando existir. Decisão de ordem fica para o início
  da Fase 4.

## Novas (abertas em 2026-10-01, a partir das respostas)
- [x] **P13 — "Praticamente junto" ao jack.** — **Resposta (2026-10-05):** marca de 16" a até **~2"** do jack não
  ganha cripple, **desde que** a omissão não ultrapasse o espaçamento máximo entre apoios; se ultrapassar, o
  cripple fica. — Impacto: substitui a regra da S7 (só omite quando encosta ou invade o jack) — S9.4. Hipótese de
  medida até alguém dizer outra coisa: 2" de folga livre entre a face do cripple e a face do jack; "espaçamento
  máximo" = vão livre entre apoios vizinhos ≤ **24"** (R602.3(5)) — `studSpacing` não serve: omitir a marca a `g`
  do jack deixa `studSpacing + g`, sempre maior (S9.4, 2026-10-05). Fecha também o que restava de P3.
- [x] **P14 — Emenda de plate em painel > 16'.** — **Resposta (2026-10-05):** emenda da bottom e da top plate de
  preferência **sobre stud**; emenda da double top defasada da top em **≥ 24"** (mínimo do IRC), 48" quando
  possível. — Impacto: hipótese confirmada, com mínimo 24" e preferência 48" — S12, S14.
- [ ] **P15 — Peso máximo do painel.** Capacidade do equipamento de içamento/transporte, em lb. — hipótese:
  sem limite de peso até a resposta; só comprimento (240") — S12.
  **Resposta parcial (2026-10-05):** sem número até confirmarem a capacidade nominal do equipamento. Pedem o
  **peso estimado de cada painel na folha** (shop drawing) e divisão quando peso ou comprimento se aproximar do
  limite — o peso estimado entra na folha (S12/S13) mesmo sem limite; depende de P8.
  S15 (2026-10-13): `config.panel.maxWeight` opcional divide também pelo peso; ausente = só comprimento (240).
  Quando a fábrica der o número, basta pô-lo no projeto.
- [ ] **P16 — Aberturas muito próximas.** Com 1 king + 1 jack, duas aberturas vizinhas compartilham um king e
  precisam de 4.5" entre os RO (jack + king + jack). O que a fábrica faz quando o projeto traz menos que isso
  (ex.: 4", sobra 1" entre os jacks)? Header contínuo sobre as duas com poste de jacks? Calço? Pede para mover
  a abertura? E com folga entre 4.5" e 6": um king com folga, ou king colado ao jack e dois kings quando cabem?
  Com 2 kings por lado, quantos kings ficam entre as aberturas? — hipótese: < 4.5" é erro; entre 4.5" e 6" um
  king colado ao jack da esquerda; kings compartilhados = maior número das duas aberturas — S8.

## Novas (abertas em 2026-10-02)
- [ ] **P17 — Escolha de header pela tabela e parede não portante.** (a) Quando vários headers da tabela IRC
  atendem o vão, qual a fábrica usa? Ex.: 2-2x6 ou 1-2x8; 2-2x10 ou 3-2x8. Usam header de 1 ply em parede
  externa? (b) O que vai sobre abertura em parede não portante: o mesmo header da portante, 2x4 deitado
  (R602.7.4), só plate? Com jack? — hipótese: (a) menor altura de seção, depois menos plies, respeitando a
  espessura da parede; (b) `headerFor` devolve `{ nonBearing: true }` e quem chama decide — S9, S10.
  **Resposta (2026-10-05):** (a) header dimensionado pela tabela, abertura por abertura (nunca um header fixo);
  padrão de fabricação = **2 plies** pela tabela, completando a parede 2x6 com filler/isolamento; 3 plies, LVL
  etc. só quando a tabela ou o engenheiro exigir. — Impacto: a escolha em `headerFor` passa a preferir 2 plies
  (feito na S9.2); o filler do 2x6 não é peça do motor. (b) Parede não portante: **um 2x4
  deitado** (R602.7.4 do IRC 2021): abertura até 8'-0" e no máximo 24" entre a peça e a top plate; nesses limites,
  sem cripples acima. Fora dos limites, header dimensionado caso a caso. — Impacto: substitui a hipótese
  `config.defaultHeader*` em parede não portante — S9.3. Detalhes em aberto: P18.

## Novas (abertas em 2026-10-05)
- [ ] **P18 — Header deitado em parede não portante: detalhes.** (a) Em parede 2x6 não portante a peça deitada é
  2x4 ou da seção da parede? (b) Leva jack de cada lado, ou a peça é pregada entre os kings/studs? (c) Sem
  cripples acima, onde pregam drywall/sheathing no vão de até 24"? — hipótese: (a) seção da parede; (b) 1 king +
  1 jack como na portante, a peça apoiada nos jacks; (c) sem cripples, como respondido — S9.3 (feita com essas
  hipóteses em 2026-10-05; mudar é trocar `resolveOpeningHeader` e o fixture `wall-120-door-nonbearing`).

## Novas (abertas em 2026-10-06, no planejamento da Fase 3)
- [ ] **P19 — Layout: stud centrado na marca ou borda na marca?** O motor põe a borda esquerda do stud na marca
  (16, 32, 48…), como em CLAUDE.md. Na prática americana a marca é 15 1/4", 31 1/4", 47 1/4" na borda, ou seja,
  o **centro** do stud em 16, 32, 48: a emenda do OSB (48", 96") cai no meio do stud e cada chapa apoia 3/4".
  Com a borda na marca, a chapa 0–48 termina na borda do stud e fica sem apoio. A fábrica mede como? —
  hipótese: centrado (regra nova em S11, muda todos os fixtures com confirmação) — S11.
  Perguntado em 2026-10-06, sem resposta; o humano mandou seguir com a hipótese e corrigir depois. S11 feita
  com stud centrado; se vier "borda na marca", `layoutStuds` volta a `marca` e os fixtures são recalculados.
  Perguntado junto: o "espaçamento máximo entre apoios" da P13 é 24" ou 16"? Segue 24".
- [ ] **P20 — Cripple curto acima do header.** Header 2-2x10 a 82.5" em parede de 8' deixa 2 3/8" até a top
  plate e o motor gera cripples dessa altura (fixture `wall-144-window-82.5`, W07 do exemplo). O que a fábrica faz
  com vão tão curto: cripple mesmo, filler deitado contínuo, bloco, ou header 2x12 padrão em parede de 8'
  (11 1/4" quase fecha os 11 5/8")? — hipótese: cripple em pé para qualquer vão ≥ 1.5" (regra atual) — S17 (a
  folha mostra; a regra muda quando responderem).
- [ ] **P21 — Referência de medida das paredes e canto.** (a) A fábrica recebe/pensa a parede pelo eixo, pela face
  externa ou pelo comprimento da plate? (b) No canto, qual parede atravessa (plate até a face externa da outra):
  as mais longas, as da fachada, as paralelas ao vigamento? (c) O layout da parede que encosta começa na quina do
  prédio (primeira marca a `t` da plate) ou na ponta da própria plate? — hipótese: eixo; a mais longa atravessa,
  com sobrescrita por ponta; layout da quina do prédio — S11, S13.
- [ ] **P22 — Ladder blocking no T.** Quantos blocos, em que alturas, de que seção; deitados ou em pé; a parede
  que encosta leva stud de ponta comum? — hipótese: 3 blocos da seção da parede, deitados, centros em 24, 48 e 72
  do subfloor (4 blocos em parede de 9'); stud de ponta comum — S14.
- [ ] **P23 — Lap da double top plate entre painéis da mesma parede.** A double top sai da fábrica avançando
  sobre o painel vizinho (quanto: 48"? 24"?) ou a peça de lap vai solta para pregar na obra? — hipótese: avança
  48" presa ao painel, mínimo 24" — S15.
- [ ] **P24 — Orientação da folha.** A elevação é vista de fora (como a elevação do arquiteto) ou de dentro (como
  o montador vê na mesa)? Que lado do painel fica para cima na mesa? — hipótese: vista de fora, face externa
  indicada no desenho — S17.
  S17 (2026-10-14): a folha desenha sempre de start para end (x=0 à esquerda, como a planta, a cutlist e a cadeia
  de cotas) e escreve no cabeçalho qual face o leitor vê: "vista de fora" quando o lado externo fica à direita do
  sentido start→end na planta (`Panel.facing = 'exterior'`), "vista de dentro — face externa no verso" quando
  fica à esquerda; parede solta assume vista de fora. Se a fábrica quiser sempre a vista de fora, a S17.1
  espelha o desenho (x' = L − x) quando `facing = 'interior'`; se quiser a vista de dentro (mesa), inverte a regra.
  P23 na S15 (2026-10-13): lap de 48" preso ao painel da esquerda; 24" quando os 48" cairiam dentro de um
  header ou de uma faixa de T; a double top do painel seguinte começa onde o lap acaba. Se a fábrica mandar a
  peça solta, `splitWall` troca `extend`/`recess` por lap 0 e a peça vira item da lista.

## Novas (abertas em 2026-10-06, S12)
- [ ] **P25 — Sill dupla: limite e montagem.** O Horace pede "double sill plate for openings larger than 6'-0"";
  os outros projetos não dizem nada. A fábrica adota um limite próprio quando o projeto não fala (6'? nunca?),
  e a segunda peça fica sob a primeira (cripples encurtam 1.5") ou lado a lado? — hipótese: só quando o projeto
  pede (`config.doubleSillOver`, ausente = simples), segunda peça sob a primeira — S12 (feita com essa hipótese).
- [ ] **P26 — Studs extras agrupados.** Post de hold-down "(2) 2x" / "(3) 2x" sai do motor como 2 ou 3 studs
  colados (`extraStuds.count`), cada um na lista de corte; 4x6 e 6x6 não existem no motor. A fábrica prega o
  post na mesa ou recebe solto? Aceita 2 studs colados no lugar de um 4x? — hipótese: colados na mesa, 2x
  apenas; 4x/6x fica para o engenheiro — S12.
  **Revista na S37 (2026-11-05, por delegação; revisar):** 4x4/4x6/6x6 maciços passaram a existir (`wall.posts`,
  P45); `extraStuds` continua para o "(2) 2x" / "(3) 2x" colados. A pergunta que fica: a fábrica aceita os 2x colados
  onde o projeto pede post maciço, ou o contrário?

## Novas (abertas em 2026-10-06, preparação do Checkpoint 2 com o 26 Ringgold)
Entrada em `packages/cli/examples/ringgold-checkpoint.json` (4 painéis do 1º pavimento, lidos de A-100, A-200,
A-400 e A-800). O estrutural da SAB (5 pág.) não está no repositório; tudo abaixo vale até ele chegar.
- [ ] **P27 — Altura da parede do Ringgold.** A-400 cota 10'-0" entre pisos; a espessura do piso (vigas + subfloor
  + 3/4" de gypcrete) está só no estrutural. — hipótese: parede 9'-1 1/8" (stud pré-cortado 104 5/8", piso ~10 7/8").
- [ ] **P28 — RO do par de janelas tipo A.** Duas casement 2'-5" x 6'-0" com transom, instaladas em par (A-200);
  a planta cota o eixo do par (nota 10). RO do conjunto = 2 x 29" + 1/2"? Com mullion do fabricante? Peitoril a
  2'-0" do piso (A-200). — hipótese: RO 58 1/2" x 72 1/2", topo do RO a 96 1/4" do subfloor.
- [ ] **P29 — RO da porta 1 (36x80 com batente metálico, 45 min).** Batente metálico costuma pedir RO maior que
  o de madeira. — hipótese: 38" x 82 1/2", igual à porta de madeira (P4).
- [ ] **P30 — Porta 1 e janela vizinhas na parede sul com 8 1/4" entre os RO.** A Tabela R602.7(1) pede 2 jacks por
  lado (2 + king + 2 = 9"), que não cabem. O estrutural resolve com header do projeto e 1 jack, ou a fábrica move
  a abertura? — hipótese: 1 jack por lado nas duas (aviso `HEADER_JACKS_BELOW_TABLE`). O motor põe 1 king da
  porta e 2 kings da janela com 3/4" de ar entre eles, em vez de king compartilhado — perguntar o que a fábrica faz.
  Desde 2026-10-15 o motor aplica a hipótese sozinho em qualquer par de RO vizinhos apertado (`fitNeighborJacks`,
  aviso "… hipótese P30"); se a fábrica responder outra coisa, é ali que muda.
- [ ] **P31 — Cargas do Ringgold para as tabelas.** Neve no solo, largura e vento vêm das notas estruturais.
  — hipótese: 30 psf, 29'-0" (profundidade do prédio), 130 mph exposição B; parede do 1º pavimento suporta
  2 pavimentos (`floorsSupported: 2`, center-bearing). Se a I1 for portante (direção das vigas), muda o header.

## Novas (abertas em 2026-10-13, S12.5 — folga default do RO)
Valem quando nem o schedule nem o fabricante dão o RO (`DEFAULT_ROUGH_OFFSET` em `rules/catalog.ts`).
- [ ] **P32 — Folga de RO de janela.** Horace A-604 cota 1/4" por lado na largura e 3/8" de selante no
  peitoril; a cabeça não é cotada. Quaker, Andersen, Pella variam. — hipótese: +1/2" na largura e +3/4" na
  altura sobre o tamanho nominal do caixilho — S12.5.
- [ ] **P33 — Folga de RO de porta com batente de madeira.** A-608 det. 7: jamb 3/4" + shim 1/4" por lado
  (+2" na largura); na altura, a resposta P4 (porta 80" → RO 82 1/2" do subfloor). — hipótese: +2" x +2 1/2" — S12.5.
- [ ] **P34 — Folga de RO de porta com batente metálico (HM) ou alumínio.** Batente HM de 2" de face por
  lado mais folga de instalação; a spec 081113 remete ao fabricante. — hipótese: +2" x +2 1/2", igual à madeira
  (revista em 2026-10-15 pelo humano; era +4 1/2" x +3", que deixava a porta 1 do Ringgold sem lugar ao lado do par A2).

## Novas (abertas em 2026-10-13, S15 — divisão em painéis)
- [ ] **P35 — Critério de divisão da parede em painéis.** A fábrica prefere o menor número de painéis com
  comprimentos parecidos, ou enche o primeiro até 20' e deixa o resto (toco de 4'-5" no fim)? Quebra sempre em
  múltiplo de 48" da quina, mesmo que isso faça um painel a mais? — hipótese: equilibrado — menor número de
  painéis que cabe em 240" (e no peso), depois o painel mais longo menor, usando só marcas múltiplas de 48" e, se
  não há divisão com elas, qualquer marca; `rules/split.ts` (`chooseBreaks`) — S15. Trocar o critério é mexer só
  em `chooseBreaks` e recalcular `house-28x40` e `wall-480-split`.
- [ ] **P36 — Posição das emendas de plate.** Dentro do que P14 respondeu (sobre stud; top e double top
  defasadas ≥ 24", 48" se possível): a fábrica prefere a peça maior à esquerda (como o motor faz), peças
  iguais, ou a emenda longe das aberturas? A bottom plate pode emendar em qualquer stud, inclusive no king de uma
  porta? — hipótese: da esquerda, a maior peça que deixa o resto emendável; bottom sobre qualquer stud ou king;
  `splicePlates` em `rules/split.ts` — S15.

## Novas (abertas em 2026-10-15, primeira extração real do Ringgold)
- [ ] **P37 — Emenda da double top plate em painel cheio de aberturas.** Na parede sul real do Ringgold (S1,
  42'-3 1/2" com dois pares de janelas e uma porta nos primeiros 20'), a divisão gerou um painel de 266 1/2" e o
  `splicePlates` não achou stud de altura inteira entre x=5 1/2" e x=197 1/2" que respeitasse a defasagem de 24"
  das outras emendas com estoque de 192". Opções: permitir emenda sobre king (já permite?) com defasagem menor,
  quebrar o painel em outro lugar (S15), ou aceitar plate de 20' quando o estoque tiver. — hipótese: erro,
  como hoje; o revisor move a quebra do painel. Fixture candidato: `out/s19/real7/projeto.json` (fora do git).
  Causa achada em 2026-10-15: o painel tinha 144"; o lap da double top (P23) caiu no header da porta, e a regra
  "primeira marca livre depois do obstáculo" pulou também o header do par de janelas, indo a 128" de lap (5.5 →
  272). — hipótese nova: o lap bloqueado termina no primeiro apoio livre depois do obstáculo, marca ou centro de
  king/stud de altura inteira (aqui o king em 193 3/4": lap 49 3/4", double top de 188 1/4" sem emenda). A
  pergunta à fábrica continua: a ponta da double top pode cair sobre um king colado ao header? S29
  (2026-11-04): "o revisor move a quebra" agora tem caminho — `wall.panelBreaks` (lista completa de quebras
  forçadas, cada uma num candidato de `breakCandidates`), editável na planta do editor (arrastar, clicar no
  ponto, duplo clique para tirar) e no inspetor; o erro do `splicePlates` continua como está.
- [ ] **P38 — Porta colada ao início da parede (I12-U3-1 a 1'-9 3/8" do eixo, RO de 32").** A zona da
  abertura (king + jack) sai 3/8" antes do início da parede. Pode ser erro de leitura (eixo vs. face) ou a
  porta realmente encostada no canto, caso em que o king vira o stud de canto. — hipótese: erro, como hoje;
  até 1 1/2" a P40 desloca a porta (2026-10-15).
- [ ] **P39 — Par de janelas A2 e porta 1 com 4 1/2" entre os RO (parede S2 do Ringgold).** A-100 cota 3'-2 5/8"
  da face de E1 ao eixo do par e 4'-4 3/4" dele ao eixo da porta (as tags confirmam; não é erro de leitura). Com o
  RO do par (58 1/2", P28) e o da porta (38", P29) sobram 4 1/2" = jack + 1 king + jack. A Tabela R602.7.5 (130 mph,
  B) pede 2 kings do lado do par (vão > 4'). O estrutural especifica post, strap ou 1 king? — hipótese: 1 king
  compartilhado (aviso `HEADER_KINGS_BELOW_TABLE`, "… hipótese P39"), automático em `mergeOpeningZones` com `fit`.
  Com a folga HM antiga (+4 1/2", RO 40 1/2") sobravam 3 1/4" e nem isso cabia; a P34 revista dá os 38" da P29.
- [ ] **P40 — Tolerância de leitura para abertura em conflito.** A leitura erra de 1/8" a ~1" (eixo das paredes 1B,
  fechamento de cadeias), e isso basta para o RO tocar uma parede em T ou a zona passar da ponta da parede. A fábrica
  aceita mover a abertura até um stud, ou isso tem que voltar ao arquiteto? — hipótese: o motor desloca o mínimo, até
  1 1/2", com aviso `OPENING_NUDGED`; acima disso é erro (`rules/nudge.ts`).

## Novas (abertas em 2026-10-15, leitura do conjunto inteiro)
- [ ] **P41 — Orçamento de folhas por leitura.** Quantas folhas a fábrica aceita pagar por leitura (cada folha ~8 mil
  tokens de entrada, mais o raciocínio)? Plantas de outros pavimentos e cortes ficam por último. — hipótese: 40 folhas e
  22 MB por leitura (`select.ts`), o resto vira aviso `FOLHAS_FORA`; o humano pode escolher as páginas.

## Novas (abertas em 2026-10-30, leituras do Ringgold e do Horace)
- [ ] **P42 — Posição de porta estimada pela escala.** (2026-10-30) Quando a planta não cota a porta nem dá regra
  escrita, a IA mede a posição no recorte ampliado pela escala do desenho e a marca `scaled` (confiança ≤ 0,5); a
  porta entra no projeto com o aviso `ABERTURA_ESTIMADA`. A fábrica prefere assim, ou porta sem cota fica fora até
  alguém cotar? — hipótese: o erro dessa medida fica em até ~2" e é aceitável como ponto de partida que o revisor
  confere sobre a planta de fundo.
- [ ] **P43 — Conjuntos grandes (Horace) numa leitura só.** (2026-10-30) A seleção automática do Horace
  (Architectural + Structural, 133 PDFs → 32 folhas úteis) soma ~633 k tokens de entrada: as folhas de notas e
  schedules do escritório são muito mais densas que as do Ringgold (~18 k tokens por página contra ~7 k), e a leitura
  estourou o teto de saída (o raciocínio conta). Vale uma leitura por ala ou uma seleção manual padrão para conjuntos
  de escritório grande? — hipótese: conjunto desse porte se lê escolhendo as páginas (planta do pavimento, plantas
  ampliadas da ala em questão, tipos de parede, schedules de portas e janelas, notas estruturais e a planta de
  framing do pavimento — uns 10 a 12 PDFs), ou em duas leituras por ala.
  **Hipótese medida (S25, 2026-11-04) — estimador por densidade** (`packages/web/src/lib/extract-cost.ts`): entrada sem cache = 500 + 1 400·páginas + **1,05·caracteres do texto posicionado** (`textChars` da prévia) + 4 900·recortes + 1 600·imagens; mais o system prompt (~6 000 tokens) como escrita de cache; saída = 68 000 + 700·páginas + 500·recortes, com alerta acima de 96 000 (onde o Horace parou). Preço da tabela do Opus 5.5 (US$ 4 / 20 por M; cache: escrita 1,25×, leitura US$ 0,20/M). Ajustado em três leituras reais: Ringgold A-100 + A-800 (2 páginas, 16 730 caracteres) → 20 989 medidos, estima 20 900; Ringgold 9 folhas sem recortes (49 883 caracteres) → ~66 000, estima 65 500; Horace automático (34 folhas, 500 468 caracteres, 14–16 recortes) → ~633 000, estima 642 000 e marca a saída em risco. Com os 6 recortes do Ringgold estima 94 900 contra os 83 000 medidos (+14 %, dentro da faixa de ±30 %). As folhas do Horace têm ~14 700 caracteres por página contra ~5 500 das do Ringgold: o custo por folha segue o texto, não a folha. Confere-se a cada leitura real: `usage` (com cache) e `provenance` ficam gravados no resultado e no `.panelizer.json`. O que ainda é suposição: o coeficiente por caractere vem de dois conjuntos de dois escritórios (pode mudar com carimbos ou fontes diferentes) e a saída por folha/recorte de três leituras; `count_tokens` como gate da prévia daria o número exato da entrada.

## Registro da análise (2026-09-28)
Resumo da revisão de escopo feita antes da S1, para não se perder:
- Viabilidade: Fases 1–3 são geometria determinística, alta confiança. Fase 4 (visão sobre PDF) é o item mais
  incerto: funciona como assistente com correção humana, não como leitor confiável. Fase 5 é app web comum, mas
  S17–S19 são várias sessões cada.
- Risco principal não é código: é o motor divergir das convenções da fábrica. Mitigação: P1.
- Inconsistência encontrada: "header encostado na top plate" + porta com `roughHeight` de entrada não fecham
  (RO da porta viraria resultado do header). Resolvido provisoriamente com `config.headerHeight` opcional (S7) e
  aviso em conflito (S8); resposta definitiva em P2/P4.
- Lacuna: aberturas próximas com zonas sobrepostas (janela ao lado de porta) compartilham king; regra de fusão de
  zonas adicionada à S8.
- Lacuna: S12 deve preferir quebra em múltiplo de 48" (P6).
- Entrada: parede declara `section` ("2x4"/"2x6"), não `thickness`; espessura é derivada. Fixtures ajustados.
- Workflow: fixture antes de código; um item por sessão com `/clear`; SVG conferido visualmente (Claude pode
  renderizar e olhar via navegador); tabela IRC em duas passadas (Claude estrutura + testes de consistência,
  humano digita, Claude roda os testes); sem paralelizar antes da Fase 3; subir para um remoto Git.

## Storage (S22.3, 2026-11-03)

- **Teto de 50 MB por arquivo** no bucket `drawings`: é o máximo de um objeto no plano gratuito do Supabase. Um PDF
  maior (conjuntos escaneados chegam a isso) exige plano Pro, que permite upload retomável até 50 GB. Hipótese em
  vigor: 50 MB basta para os conjuntos de arquiteto (Matilda inteiro tem 19,7 MB; o Horace vem em 133 arquivos).
- **Envios abandonados** — **limpeza pronta, falta aplicar (S24, 2026-11-04).** Quem solta arquivos e não lê (ou
  cancela, ou a leitura falha) deixa a pasta `<uploadId>/` sem projeto apontando para ela.
  `supabase/migrations/20261104000100_drawings_cleanup.sql` define `orphan_drawings()` (pastas sem referência em
  `projects.data -> '$panelizer' -> 'reading' -> 'drawings'` nem em job de leitura guardado, com a última mudança
  há mais de **24 h**) e `sweep_orphan_drawings()`, que apaga pela API de Storage (pg_net; apagar a linha de
  `storage.objects` por SQL deixaria o arquivo cobrado no disco). O agendamento diário (pg_cron) está escrito e
  **comentado** no fim da migração; precisa de pg_net, pg_cron e de dois segredos no Vault (`project_url`,
  `drawings_cleanup_key` = uma chave *secret* só para isto). Passos em `supabase/README.md`. A janela caiu de
  7 dias (hipótese anterior) para 24 h: o envio vira projeto em minutos, e o job de leitura guardado também vale
  24 h. Não depende da fábrica: falta aplicar e ligar o agendamento depois de
  conferir `select * from public.orphan_drawings();` à mão.

## Novas (abertas em 2026-11-04, prancha da fábrica de 2026-10-28 — `docs/14-prancha-fabrica.md`)
A prancha avisa que dimensões e fixações são exemplos conceituais; aqui elas viram hipótese em vigor até a fábrica
ou o engenheiro dizer outra coisa. Toda peça gerada por estas regras sai na folha com "validar com engenheiro".

- [ ] **P44 — Alturas padrão de blocking.** A prancha dá faixas (bancada 34½–36", topo do balcão 54", armários
  superiores 84"; vaso 12–18", papeleira/ganchos 36–42", válvula do chuveiro 42", toalha 48", ducha 78–80" A.F.F.).
  A cota é do centro, da base ou do topo do bloco? Um bloco por uso ou faixa dupla? Mesma seção da parede? —
  hipótese: um bloco por uso, de 1.5" de altura, **centro** na cota (faixa → valor único: 36, 54, 84; 15, 39, 42,
  48, 79), seção da parede, entre todos os studs do trecho; `config.blockingPresets` — S36.
  **Em vigor desde a S36 (2026-11-05, por delegação; revisar):** hipótese: presets `kitchen-base` 36" ("Base cabinets /
  countertop"), `kitchen-upper-bottom` 54" ("Upper cabinets, bottom" — leitura do "topo do balcão 54" típico" da
  prancha), `kitchen-upper-top` 84", `bath-toilet` 15", `bath-paper` 39", `bath-valve` 42", `bath-towel` 48",
  `bath-shower` 79"; a cota é o **centro** do bloco medida do **subfloor** (base da bottom plate — o A.F.F. da prancha é
  do piso acabado, uns 3/4" a 1" acima); bloco deitado de 1.5" da seção da parede em todo vão entre peças de altura
  inteira que toca o trecho; vão em zona de abertura (sob o peitoril, acima do header) ou no ladder do T fica sem bloco,
  com aviso `BLOCKING_SKIPPED`; fileira na mesma altura de outra (inclusive o fire blocking) cede à primeira, com aviso
  — S36. Perguntas que ficam para a fábrica: a cota é A.F.F. ou do subfloor? Vai bloco entre os cripples sob o peitoril
  e acima do header? O 54" é a base dos armários superiores? Bloco contínuo (2x deitado de ponta a ponta, por fora dos
  studs) ou entre os studs, como o modelo faz?
- [ ] **P45 — Posts: seções, peso e conectores.** Posts 4x4/4x6/6x6 nos cantos da escada e sob LVL. O post
  substitui o stud de layout ou soma a ele? Conector de base e de topo é peça da fábrica ou da obra? — hipótese:
  seções 4x4, 4x6 e 6x6 (reais 3.5×3.5, 3.5×5.5, 5.5×5.5) a 35 pcf (≈ 3.0, 4.7, 7.3 lb/pé); o post ocupa o lugar
  do stud que sobrepõe; conectores são texto do projeto na folha, não peça da lista — S37. Revê P26 (4x/6x deixam
  de ficar só com o engenheiro).
  **Em vigor desde a S37 (2026-11-05, por delegação; revisar):** hipótese: `wall.posts = [{ x, section, label?, base?,
  top? }]`, `x` = borda esquerda; reais 3.5×3.5, 3.5×5.5, 5.5×5.5 a 35 pcf = 2.98, 4.68, 7.35 lb/pé (`lumber.json`); a
  face do post na espessura da parede tem de ser a profundidade dela (2x4 = 3.5", 2x6 = 5.5") e a outra fica em x —
  4x6 na 2x4 deitado com a face larga ao longo da parede; 4x4 na 2x6 (não preenche a espessura) e 6x6 na 2x4 (sai
  dela) são erro `POST_DEPTH_MISMATCH`; o post ocupa o lugar dos studs de layout que sobrepõe, com a altura do stud
  (da bottom à top plate; a top e a double top passam por cima); post sobre stud extra, de canto, de encosto ou outro
  post é erro (`POST_OVERLAP`); conectores de base/topo e a viga LVL apoiada são texto na folha ("base: … · top: …"),
  fora da lista de corte e da BOM; o post é comprado em comprimento comercial (como a família 2x). Perguntas que ficam
  para a fábrica: o post vai da bottom à top plate (como o stud) ou atravessa a top plate até a viga? 4x4 na parede
  2x6 com calço, ou sempre 4x6? O post é pregado na mesa ou vai solto para a obra? O conector de base (hold-down) é
  instalado na fábrica?
- [ ] **P46 — Cruzamento em + (T dos dois lados no mesmo ponto).** A prancha mostra "amarração com studs contínuos
  (mín. 2x) no núcleo" e plywood contínuo numa direção. Um núcleo de 2 studs contínuos (backer) serve os dois
  lados, ou ladder dos dois lados? A double top da parede atravessada leva um corte só? — hipótese: um corte da
  double top na faixa; com `config.tee = 'backer'` dois studs contínuos servem os dois lados; com `'ladder'`,
  blocos dos dois lados — S37.
  **Em vigor desde a S31 (2026-11-04, confirmado pelo humano):** os dois T viram uma faixa só (união); com `ladder`,
  **um** ladder na faixa — o bloco do modelo é deitado e ocupa a espessura inteira da parede (P22), então a mesma
  fileira já apresenta bloco às duas faces; nas duas que encostam, a double top avança só `t_outra/2` (encontram-se
  no eixo da atravessada; avançando `t_outra` as duas se sobreporiam no corte). Perguntas que ficam para a fábrica:
  o ladder vai rente a uma face (aí seriam 2 blocos por altura, um por face)? Nas que encostam, meia espessura para
  cada uma, ou uma atravessa a faixa inteira e a outra só encosta? — S31.
- [ ] **P47 — Sheathing: chapa, avanços e linha de piso.** Chapa 4×8 (ou 4×9) vertical a partir da marca 0 do
  prédio; no canto a chapa da parede que atravessa avança sobre a ponta da que encosta; na divisão de piso a
  Matilda pediu 1–2' acima da emenda. Quanto avança no canto (`t` da outra parede?), a chapa vai presa ao painel
  ou solta, e o avanço na linha de piso é regra da fábrica ou só do projeto? — hipótese: avança `t_outra` no canto
  pela parede que atravessa, presa ao painel; na junta painel-painel não avança; na linha de piso só quando o
  projeto pede (`config.sheathing.overhang.floorTop`, default 0); lado = face externa (`facing`) — S38.
  **Em vigor desde a S38 (2026-11-05, por delegação; revisar):** hipótese: chapa 7/16" 48x96 de pé, bordas nas marcas
  `layoutOrigin + k·48`, cortada nas pontas do painel; **no canto em L quem avança é a parede que ENCOSTA** (`+t_outra`,
  `overhang.corner: 'auto'`), cobrindo a ponta da que atravessa — o texto acima dizia "pela parede que atravessa", mas a
  plate da que atravessa já chega à face externa da outra (P21), então a chapa dela não tem onde avançar; é a da que
  encosta (que para na face interna da outra) que passa a quina e começa na marca 0 do prédio (o `$comment` do
  `house-corner-L` já contava a primeira chapa a partir da quina). A que atravessa não avança; no canto de dentro (L que
  se abre para fora do prédio) o avanço vai na face interior. Presa ao painel. T e +: contínua na atravessada. Linha de
  piso: `floorTop`/`floorBottom` (default 0) só na face exterior, com "engineer to verify" na folha; `config.sheathing`
  liga as paredes externas (`walls: 'exterior'`; `'all'`/`'none'`), tipo e parede ligam/desligam uma a uma. Emenda
  horizontal na cavidade: fileira de blocking com o centro na emenda (S36). Perguntas que ficam para a fábrica: é mesmo
  a que encosta que leva o avanço? O avanço é `t_outra` ou `t_outra` + a espessura da chapa da outra (para cobrir a
  borda dela)? A chapa avançada vai presa no painel (risco no transporte) ou solta, pregada na obra? — S38.
- [ ] **P48 — Pregação (texto da folha).** Junção entre paredes 3× 3" nails ou screws @ 12" OC; chapa 8d @ 6" nas
  bordas e 12" no campo (prancha 12). — hipótese: esses valores como `config.nailing` default, impressos na folha
  com "validar com engenheiro"; nunca geometria — S38, S39.
  **Em vigor desde a S38 (2026-11-05, por delegação; revisar), parte da chapa:** hipótese: `config.sheathing.nailing =
  { nail: '8d', edge: 6, field: 12 }` por default, sobrescrito por tipo ou parede; a folha imprime "nailing: 8d @ 6"
  edges, 12" field" na seção Sheathing com "engineer to verify (hypotheses P47, P48)". A pregação da junção entre
  paredes (3× 3" @ 12" OC) fica para a S39 (`config.nailing`). — S38.
  **Em vigor desde a S39 (2026-11-05, por delegação; revisar), parte das ligações:** hipótese: `config.nailing.wallJoint =
  { count: 3, fastener: '3" nails or screws', spacing: 12 }` por default, campo a campo pelo projeto; a folha imprime
  "wall joints: 3× 3" nails or screws @ 12" OC ▲" no bloco "Wall content" de todo painel com canto, T ou + (nos dois
  painéis do encontro), e "▲ engineer to verify (hypothesis P48)". Perguntas que ficam para a fábrica: a pregação é por
  fileira ao longo da altura (3 a cada 12") ou 3 pregos a cada 12" no total? Prego ou parafuso — a folha deve escolher?
  Vale igual para canto, T e +? — S39.
- [ ] **P49 — Encaixe painel-painel na mesma parede.** A conclusão da prancha pede studs avançados/recuados para
  uma parede entrar na outra. No canto e no T o motor já faz (quem atravessa/encosta, P21). E na junta de dois
  painéis da mesma parede: stud duplo encostado (como hoje), stud recuado num lado, ou chapa avançada pregando no
  stud do vizinho? — hipótese: stud duplo na junta (S15) e chapa terminando no painel; lap só na double top
  (P23) — S38, S39.
  **Em vigor desde a S38 (2026-11-05, por delegação; revisar), parte da chapa:** hipótese: a chapa acaba na ponta de
  cada painel (a junta de painéis da mesma parede não avança nem recua); as quebras preferidas caem em marca múltipla de
  48" (P6), logo a chapa termina inteira na junta na maioria dos casos. — S38.
  **Em vigor desde a S39 (2026-11-05, por delegação; revisar), parte da folha:** a junta de painéis aparece no bloco "Wall
  content" de cada lado ("end: panel joint with 1-W01-P2 — double top laps 48" onto it ▲" / "start: … — double top held
  back 48" ▲") com ▲ desta hipótese; stud duplo na junta como hoje (S15), sem pregação impressa (a prancha não dá
  número para a junta painel-painel). — S39.

## Novas (abertas em 2026-11-05, S39 — folha "o que vai nesta parede" e planta com encaixes)
- [ ] **P53 — Bloco "Wall content" e símbolos da planta.** O Nicolas pediu "dizer o que vai nessa parede" e mostrar a
  amarração na folha e na planta, sem dizer o formato. — hipótese: na folha, um bloco sob o cabeçalho, em toda a
  largura, com Wall (id, tipo e descrição, pavimento, seção, posição, carga, dimensões e trecho da parede), Openings,
  Joints (por ponta: livre, canto — quem atravessa e a montagem —, T, +, junta de painéis; T/+ ao longo do painel com
  x e montagem), Blocking, Sheathing, Posts e Nailing; grupo vazio diz "none"; ▲ só nas linhas que saem de hipótese
  estrutural (P44–P50) e um rodapé "▲ engineer to verify (hypotheses …)"; o canto e o T em si sem ▲. Na planta, selo
  L/T/+ do lado de dentro de cada encontro e traço laranja no eixo da parede que atravessa, com legenda e a lista dos
  tipos de parede usados. Perguntas que ficam para a fábrica: é esse o conteúdo e a ordem que a mesa quer ler? O bloco
  repete o que a margem já detalha (chapa, posts) — tirar de um dos dois? A junta painel-painel leva pregação
  impressa (qual)? O "+" da planta deve ser "X", como na prancha? A folha mais alta (~80–110 px; ~10–20% menor na
  carta paisagem) incomoda na leitura da cota? — S39.

## Novas (abertas em 2026-11-05, S38 — sheathing)
- [ ] **P52 — Sobra de altura da chapa e contagem de chapas.** A parede de 97 1/8" (3 plates + 92 5/8") com chapa 4x8
  deixa 1 1/8" sem cobrir; com 4x9 sobram 10 7/8". O que a fábrica faz: tira de 1 1/8" no topo, chapa 4x9 descendo
  sobre a rim (`floorBottom`), ou deixa o 1 1/8" sem chapa? E na compra: cada pedaço sai de uma chapa (como a madeira) ou
  as tiras saem das sobras? — hipótese: fileiras de baixo para cima com a altura da chapa e a sobra em tira cortada no
  topo, mesmo fina; na BOM uma chapa inteira por pedaço (sem aproveitamento de sobra, como a madeira — a sobra
  informada é um teto); sem preço de chapa no orçamento até a tabela de preços do editor (S40) — S38.

## Novas (abertas em 2026-11-04, S31 — escopo v1 que faltava)
- [ ] **P50 — Altura e forma do fire blocking.** A P11 diz que a fábrica coloca o bloqueio quando a cavidade passa de
  ~10'. Em que altura vai a fileira (meio da cavidade? altura fixa, ex. 8' ou 10' do subfloor? alinhada à emenda da
  chapa?), é bloco deitado (1.5" de altura, espessura inteira) ou em pé, e o vão estreito entre o king e o stud
  vizinho (2–3") também leva bloco? — hipótese: `config.fireBlockAt` = 120" sobre a cavidade `height − 3·plates`; o
  menor número de fileiras que deixa cada trecho ≤ limite, igualmente espaçadas (uma no meio da cavidade até
  241.5"); bloco deitado da seção da parede em todo vão ≥ 1.5" entre peças de altura inteira, fora das zonas de
  abertura e do vão do ladder do T — S31 (a S36 revê junto com as fileiras por altura, P44).

## Novas (abertas em 2026-11-04, S34 — folha em inglês)
- [x] **P51 — Idioma da folha e da planta.** — **Resposta (2026-11-05, humano):** **inglês, sempre**, e tudo o que o
  usuário vê no software também (folhas, planta, avisos e erros do motor, CLI, relatório da leitura). O português e a
  opção de idioma da S34 (`locale`, `--locale`, "Sheet language") saíram; a chave `locale` de arquivos gravados entre
  a S34 e esta resposta é aceita e ignorada. Comentários de código e `docs/` continuam em português.
