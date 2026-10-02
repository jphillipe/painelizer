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
- [x] **P11 — Fire blocking.** — **Resposta (2026-10-01):** paredes de 8' e 9' não levam fire blocking horizontal
  só pela altura; quando a cavidade contínua passa de **~10'**, colocam conforme o código, além dos locais que o
  projeto e o código exigirem. — Impacto: hipótese IRC confirmada; limite 120" — S10.

## Entrada de dados (Fase 4)
- [x] **P12 — DXF disponível?** — **Resposta (2026-10-01):** na maioria das vezes chega só PDF; DWG/DXF às vezes.
  A fábrica recomenda pedir PDF + DWG/DXF. — Impacto: a Fase 4 não pode depender de DXF; PDF vetorial continua
  sendo a entrada principal e DXF entra como caminho preferido quando existir. Decisão de ordem fica para o início
  da Fase 4.

## Novas (abertas em 2026-10-01, a partir das respostas)
- [ ] **P13 — "Praticamente junto" ao jack.** Até quantas polegadas de distância entre a marca e o jack o cripple
  é omitido? — hipótese: só quando encosta ou invade o jack (regra da S7) — S7.1/S8.
- [ ] **P14 — Emenda de plate em painel > 16'.** O estoque vai até 16' e o painel até 20'. Como emendam bottom,
  top e double top num painel de 20'? Emenda sempre sobre stud? Defasagem mínima entre top e double top
  (IRC pede 24"; o Horace pede 48")? — hipótese: emenda sobre stud de layout, defasagem ≥ 48" — S12, S14.
- [ ] **P15 — Peso máximo do painel.** Capacidade do equipamento de içamento/transporte, em lb. — hipótese:
  sem limite de peso até a resposta; só comprimento (240") — S12.
- [ ] **P16 — Aberturas muito próximas.** Com 1 king + 1 jack, duas aberturas vizinhas compartilham um king e
  precisam de 4.5" entre os RO (jack + king + jack). O que a fábrica faz quando o projeto traz menos que isso
  (ex.: 4", sobra 1" entre os jacks)? Header contínuo sobre as duas com poste de jacks? Calço? Pede para mover
  a abertura? E com folga entre 4.5" e 6": um king com folga, ou king colado ao jack e dois kings quando cabem?
  Com 2 kings por lado, quantos kings ficam entre as aberturas? — hipótese: < 4.5" é erro; entre 4.5" e 6" um
  king colado ao jack da esquerda; kings compartilhados = maior número das duas aberturas — S8.

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
