# 05 — Pendências com a fábrica

Perguntas que só a equipe de produção responde. O motor avança com hipóteses (marcadas nos fixtures e em
`04-decisoes.md`); cada resposta aqui vira uma linha em `04-decisoes.md` e, se preciso, um ajuste de fixture
com confirmação humana. Formato: `- [ ] Pn — pergunta — hipótese atual — sessão que depende`.

## Bloqueia o critério de sucesso
- [ ] **P1 — Painéis reais.** Obter 2 ou 3 painéis já fabricados (folha + lista de corte, de preferência um com
  janela e um com porta) e transcrever para `test/fixtures/real-*.json`. Sem isso, todos os fixtures são hipótese
  e o critério de sucesso de `01-escopo` não pode ser verificado. — hipótese: fixtures sintéticos — S7 em diante.
- [ ] **P2 — Altura de header.** A fábrica usa altura padrão de header para toda a casa (ex.: 6'-10 1/2" = 82.5"
  do subfloor ao fundo do header, ou do topo da bottom plate?) ou encosta o header na top plate? Se altura padrão,
  qual? — hipótese: encostado na top plate (`config.headerHeight` ausente) — S7, S8.
- [ ] **P3 — Cripple encostado no jack.** Abaixo do sill, a marca de layout que cai colada ao jack (ex.: marca 48
  com jack em 46.5–48) recebe cripple ou não? — hipótese: não recebe (exemplo resolvido em `02-framing`) — S7.
- [ ] **P4 — Porta: RO altura.** Com header em altura padrão (P2), `roughHeight` da porta é entrada ou resultado?
  Se a fábrica sempre usa RO de porta = 82" ou 82.5", o campo pode ser derivado. — hipótese: entrada; se
  conflitar com o header, aviso — S8.

## Afeta lista de corte / material
- [ ] **P5 — Cantos e T.** California corner ou 3-stud? Ladder ou stud de encosto? Um padrão para a fábrica ou
  varia por projeto? — hipótese: configurável, default California + ladder — S11.
- [ ] **P6 — Módulo de 48".** Painéis quebram em múltiplos de 48" por causa do OSB, mesmo sem sheathing no
  escopo? Comprimento e peso máximos reais (caminhão, mesa)? — hipótese: preferir quebra em stud que seja
  múltiplo de 48"; máx. 16' — S12.
- [ ] **P7 — Pré-corte de stud.** 92 5/8" para 2x4 e 2x6? Parede de 9' usa 104 5/8"? — hipótese: sim — S1.
- [ ] **P8 — Peso por peça.** Densidade usada para estimar peso do painel (SPF ~ 1.3 lb/pé linear para 2x4,
  ~2.0 para 2x6?). — hipótese: tabela fixa em `src/data/lumber.json` — S12.
- [ ] **P9 — Comprimentos comerciais em estoque.** 8/10/12/14/16' ou também 9' e 20'? Preço por comprimento? —
  hipótese: 96, 120, 144, 168, 192 (`DEFAULT_STOCK_LENGTHS` em `output/bom.ts`, parametrizável) — S4 (feita com a hipótese).

## Normativo
- [ ] **P10 — Tabela IRC em vigor.** Massachusetts 780 CMR 10ª edição (base IRC 2021) tem emendas sobre R602.7?
  Espécie/grau assumidos pela tabela (#2 DF-L, Hem-fir, SPF, SP) batem com a madeira comprada? — S9.
- [ ] **P11 — Fire blocking.** Altura a partir da qual a fábrica coloca blocking (10' pelo IRC, ou antes por
  prática)? — S10.

## Entrada de dados (Fase 4)
- [ ] **P12 — DXF disponível?** Os arquitetos entregam DXF/DWG além do PDF? Se sim, importar DXF (linhas e
  cotas vetoriais) é muito mais confiável que visão sobre PDF e deve vir antes da S15. Se só PDF, priorizar PDFs
  vetoriais (texto extraível) sobre rasterizados. — decisão pendente — Fase 4.

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
