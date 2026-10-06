# 05 — Pendências com a fábrica

Perguntas que só a equipe de produção responde. O motor avança com hipóteses (marcadas nos fixtures e em
`04-decisoes.md`); cada resposta aqui vira uma linha em `04-decisoes.md` e, se preciso, um ajuste de fixture
com confirmação humana. Formato: `- [ ] Pn — pergunta — hipótese atual — sessão que depende`.
Respondidas: `- [x] Pn — pergunta — **Resposta (data):** resumo — impacto`.

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
- [ ] **P3 — Cripple encostado no jack.** — **Resposta (2026-10-01):** confirmada a hipótese: se a marca de 16"
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
  Se mudar, basta trocar o JSON e rodar `headers-data.test.ts`.
- [x] **P11 — Fire blocking.** — **Resposta (2026-10-01):** paredes de 8' e 9' não levam fire blocking horizontal
  só pela altura; quando a cavidade contínua passa de **~10'**, colocam conforme o código, além dos locais que o
  projeto e o código exigirem. — Impacto: hipótese IRC confirmada; limite 120" — S10.

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
