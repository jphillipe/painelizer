# 03 — Plano de sessões

Uma sessão do Claude Code = um item. Ritual:
1. Abrir: "Leia CLAUDE.md e docs/03-sessoes.md. Vamos fazer a sessão N. Antes de escrever código, explique a abordagem."
2. Critério de saída = `pnpm test` e `pnpm typecheck` verdes (rodam na raiz) + critério do item.
3. Fechar: marcar `[x]`, registrar decisões em `docs/04-decisoes.md`. O Claude sugere a mensagem de commit;
   quem commita é o humano. `/clear` antes da próxima.
4. Se a sessão esbarrar numa pergunta que só a fábrica responde, anotar em `docs/05-pendencias.md` e seguir
   com a hipótese registrada lá. Não inventar convenção de framing.

## Fase 1 — Motor: parede reta

- [x] **S1 — Tipos e unidades**
  Prompt: "Crie `src/types.ts` com `Wall`, `Opening`, `Member`, `MemberRole`, `Panel`, `Config` conforme
  `docs/02-framing.md`. `Wall.section` é `'2x4' | '2x6'`; a espessura real (3.5 / 5.5) é derivada, nunca
  entrada. `Config.headerHeight` é opcional (ver S7). Crie `src/units.ts` com `parseFeetInches(s: string): number` e
  `formatFeetInches(n: number): string`. Formatos aceitos: `12'`, `12'-0\"`, `8'-1 1/8\"`, `92 5/8\"`, `36\"`.
  Testes para 0, 1.5, 36, 92.625, 97.125, 144, e o inverso. Frações até 1/16."
  Saída: tipos compilando; units com testes verdes.

- [x] **S2 — Layout de studs**
  Prompt: "Crie `src/rules/studs.ts` com `layoutStuds(length, spacing, studThickness = 1.5): number[]`
  retornando posições x (borda esquerda), com o último stud em `length − studThickness`. Regras em CLAUDE.md.
  Testes: 144 → [0,16,…,128,142.5]; 16 → [0,14.5]; 15 → [0,13.5]; 143 → decidir e registrar em 04-decisoes.md
  o que fazer quando a última marca (128) e o fechamento (141.5) ficam a menos de 1.5" — proposta: manter os dois."
  Saída: função + testes.

- [x] **S3 — Plates e panelizeWall (sem abertura)**
  Prompt: "Crie `src/rules/plates.ts` (3 plates) e `src/panelize/panelizeWall.ts` que monta o `Panel` de uma
  parede sem aberturas usando plates + layoutStuds. Faça `test/fixtures/wall-144-plain.json` passar exatamente.
  Crie um helper de teste que compara members por (role, section, length, x, y) ignorando ordem."
  Saída: fixture verde.

- [x] **S4 — Lista de corte**
  Prompt: "Crie `src/output/cutlist.ts`: `cutList(panel): CutLine[]` agrupando por (role, section, length),
  ordenado por role e comprimento desc. Crie `src/output/bom.ts`: `bom(panels): BomLine[]` consolidando por
  seção e comprimento comercial (96, 120, 144, 168, 192), escolhendo o menor que cabe. Testes com o fixture plain."
  Saída: `cutList(wall-144-plain)` = 3 plates + 10 studs.

- [x] **S5 — SVG da elevação**
  Prompt: "Crie `src/output/svg.ts`: `panelSvg(panel, opts): string`. Escala 4 px/pol. Retângulo por member,
  cota do comprimento total e da altura, marca de layout no rodapé, ID do painel no topo. Sem dependências.
  Salve o SVG do fixture plain em `test/__snapshots__/` e me diga o caminho para eu abrir no navegador."
  Saída: SVG abre e mostra o painel corretamente.

- [x] **S6 — CLI**
  Prompt: "Crie `packages/cli` com `panelizer build <projeto.json> --out <dir>`: lê `Wall[]` + `Config`,
  gera `cutlist.csv`, `bom.csv` e um SVG por painel. Só o CLI pode usar Node fs."
  Saída: comando roda de ponta a ponta com um JSON de exemplo.

- [ ] **Checkpoint — painéis reais (sem Claude)**
  Resolver P1, P2, P3 e P4 de `docs/05-pendencias.md` com a fábrica. (2026-10-01: P2, P3 e P4 respondidas;
  falta P1.) Transcrever ao menos um painel real para
  `test/fixtures/real-*.json`. Se ainda não for possível, seguir com as hipóteses e voltar aqui antes da Fase 3.

## Fase 2 — Aberturas

- [x] **S7 — Janela**
  Prompt: "Implemente `src/rules/openings.ts`: `openingZone`, `framingForOpening` gerando king, jack, header,
  sill e cripples conforme o exemplo resolvido em `docs/02-framing.md`. Por enquanto a seção do header vem
  de `config.defaultHeaderSection`. Posição do header: se `config.headerHeight` (y da base do header) existir,
  usar; senão, encostar na top plate. Cripples acima do header quando sobrar ≥ 1.5\". Integre em `panelizeWall`
  removendo studs de layout dentro da zona. Faça `test/fixtures/wall-144-window.json` passar (sem headerHeight)
  e adicione um teste com `headerHeight: 82.5` conferindo cripples acima."
  Saída: 18 peças, fixture verde, SVG conferido visualmente nos dois casos.

- [x] **S7.1 — Ajustes pelas respostas da fábrica (2026-10-01)**
  Prompt: "Aplique as respostas P2, P7 e P9 de `05-pendencias.md`: (a) `Opening.headerHeight` opcional sobrescreve
  `config.headerHeight` (o projeto manda, P2); (b) `config.studLength` vira lista de pré-cortes
  (`[92.625, 104.625]`) e `STUD_LENGTH_MISMATCH` só dispara se o stud derivado não estiver na lista (P7);
  (c) a BOM ganha os pré-cortes como estoque, usados só por peça de comprimento igual ao pré-corte (P9);
  (d) fixture novo `wall-144-window-82.5.json` (o caso típico da fábrica, 20 peças) e o exemplo do CLI com
  `headerHeight: 82.5`." Proposta de abordagem e mudança de fixtures/defaults confirmadas pelo humano antes.

- [x] **S8 — Porta e aberturas vizinhas**
  Prompt: "Estenda `framingForOpening` para `type: 'door'`: sem sill, sem cripples abaixo, jack até o header.
  RO da porta medido do subfloor (y=0): se `roughHeight` não bater com a base do header, emitir aviso
  `DOOR_RO_HEIGHT_MISMATCH` (P4, respondida). Bottom plate continua inteira (cortada na obra); a folha marca o
  corte. Fixture novo: parede 120\" com porta RO 38 × 82.5 em offset 40 e `headerHeight: 82.5` (jacks de 81\").
  Depois: quando duas zonas de abertura se sobrepõem ou se tocam (janela ao lado de porta), fundir em uma zona
  e compartilhar o king entre elas; fixture com janela 36 e porta 38 separadas por 4\"."
  Feito em 2026-10-02 com 4.5" entre os RO em vez de 4" (com 4" o king compartilhado não cabe — confirmado
  pelo humano); RO mais próximos que jack + king + jack lançam erro e ficam em P16.

- [x] **S9 — Tabela de headers IRC**
  Prompt: "Crie `src/data/irc-headers.json` (estrutura proposta antes de digitar) e `src/rules/headers.ts`:
  `headerFor({ span, exterior, bearing, buildingWidth, groundSnowLoad, floorsSupported })` →
  `{ section, plies, jackStuds } | { requiresEngineer: true }`. Nunca extrapolar. Testes com 3 linhas conhecidas."
  Nota: os valores da tabela são digitados pelo humano a partir do código em vigor (ver P10); o Claude só estrutura.
  Duas passadas: (1) Claude cria o schema e testes de consistência interna (vão cresce com a seção, cai com carga
  de neve e com pavimentos suportados; jacks nunca diminuem com o vão); (2) humano digita; (3) Claude roda os
  testes para pegar erro de digitação. A função escolhe a menor seção cujo vão máximo ≥ span.
  Passada 1 feita em 2026-10-02: `src/data/irc-headers.json` só com estrutura (colunas e linhas vazias; grupos
  de carga pré-criados com os nomes do livro, a conferir), `headerFor`, validação de estrutura, testes de lógica
  com tabela falsa e `test/rules/headers-data.test.ts` com as conferências de coerência e as 3 linhas conhecidas
  em `todo`. Falta: humano digitar a tabela, preencher `source` e os 3 casos em `KNOWN` (passada 2); Claude roda
  os testes e aponta erros (passada 3). Só então marcar `[x]`.
  Mudança (2026-10-02, pedido do humano): o Claude transcreve das capturas de tela e o humano confere.
  R602.7(2) transcrita e coerente, com conferência humana pendente; R602.7(1) (externa) ainda vazia.
  Concluída em 2026-10-05: R602.7(2) conferida pelo humano; R602.7(1) extraída do texto da página do ICC e
  conferida por hash contra a página. As duas passam em todas as conferências de coerência; 6 casos em `KNOWN`.
  Pendente fora da sessão: emendas de MA sobre R602.7 (P10) e integração com `panelizeWall` (S9.2).

- [x] **S9.2 — Header da abertura no painel (projeto → tabela → erro)**
  Prompt: "Integre `headerFor` em `panelizeWall`. Antes de escrever código, proponha os tipos e as mudanças de
  fixture. (a) `Config.building?: { groundSnowLoad, buildingWidth }`: dados da casa, uma vez por projeto;
  `Wall.buildingWidth?` sobrescreve (casa em L). (b) `Wall.floorsSupported?` (pavimentos acima da parede) e
  `Wall.floorSpan?` ('center' | 'clear'; ausente = pior caso, como na S9). (c) `Opening.header?: { section, plies,
  jackStuds? }`: header do structural drawings, que manda sobre a tabela (P10). (d) Ordem por abertura: header
  do projeto → parede portante: `headerFor` pela tabela → parede não portante: `config.defaultHeaderSection`/
  `defaultHeaderPlies` (hipótese P17). `requiresEngineer` ou dado faltando (parede portante sem `floorsSupported`
  ou sem `config.building`, abertura sem `header`) lança `Error` com o id da parede e da abertura e o motivo —
  sem header não há geometria (cripples, jacks), então não se fabrica com header chutado. (e) Jacks: se
  `opening.jackStuds` estiver ausente, usar o NJ da tabela; se for menor que o NJ, aviso
  `HEADER_JACKS_BELOW_TABLE`. O NJ muda a largura da zona e a fusão de zonas — testar janela + porta com NJ 2.
  (f) `wallSection` vai para `headerFor` (4 plies não cabem em 2x6). (g) O header escolhido e a origem
  (`project` | `R602.7(1)` | `R602.7(2)` | `default`) aparecem no `<title>` do SVG. (h) CLI: bloco `building`
  no JSON (largura aceita pés-pol), campos novos na validação estrutural e no exemplo `casa-exemplo.json`."
  Fixtures: os atuais usam o header fixo 2-2x10 do config em parede externa portante. Proposta: dar
  `header: { section: '2x10', plies: 2 }` às aberturas (members inalterados) e criar
  `wall-144-window-irc.json` com header vindo da tabela (`building` 50 psf / 28', 1 pavimento) — fixture novo e
  mudança nos atuais exigem confirmação do humano.
  Fora desta sessão: LVL/PSL em `opening.header` (exige seção com largura e altura reais, não só `Section`
  nominal) e king studs pela R602.7.5 (exige velocidade de vento).
  Neve, largura, pavimentos e header vêm dos desenhos de cada projeto (notas estruturais, plantas, header
  schedule — ver `06-referencias-projetos.md`), não de pergunta à fábrica. Não depende de resposta pendente:
  P10 (edição do IRC) e P17 (parede não portante) seguem com a hipótese.
  Atualização (2026-10-05, respostas da fábrica): P17(a) respondida — padrão de 2 plies pela tabela, aplicado
  em `headerFor` nesta sessão. P17(b) respondida — 2x4 deitado; nesta sessão a parede não portante continua
  com `config.defaultHeader*` (origem `default`) e a S9.3 troca.
  Feita em 2026-10-05 com as decisões delegadas pelo humano ("aja como engenheiro"): fixtures atuais com
  `header` 2-2x10 nas aberturas (members inalterados); fixture novo `wall-144-window-irc.json` com
  `floorsSupported: 0` (2-2x6, NJ 2, 22 peças); regra em `rules/openingHeader.ts`. Janela + porta com NJ 2
  testada inline (o fixture de 4.5" não comporta: mínimo 7.5"). SVG novo `wall-144-window-irc.svg` ainda sem
  conferência visual do humano.

- [ ] **S9.3 — Header deitado em parede não portante (R602.7.4)**
  Parede não portante sem `opening.header`: uma peça deitada sobre a abertura (P17b), válida para RO ≤ 96" e
  ≤ 24" entre a peça e a top plate; nesses limites, sem cripples acima. Fora dos limites: erro pedindo o header
  do projeto. Remove `config.defaultHeaderSection`/`defaultHeaderPlies`. Usa as hipóteses de P18 (seção, jack).
  Exige orientação "deitado" para o header no desenho (`memberBox`) e fixture novo (confirmação do humano).

- [ ] **S9.4 — Cripple a até 2" do jack (P13)**
  Marca de layout com folga ≤ 2" até o jack não ganha cripple, salvo se a omissão deixar vão maior que o
  espaçamento máximo; vale abaixo do sill e acima do header. Conferir os fixtures atuais (a marca 80 fica a 2.5"
  do jack em 84 — não deve mudar) e criar um caso que dispare a regra.

- [ ] **S10 — Validações**
  Prompt: "Crie `src/panelize/validate.ts` com avisos: header fora da tabela, abertura a < 1.5\" do canto,
  studs sobrepostos, altura de stud acima do limite. Cada aviso tem código e mensagem."

## Fase 3 — Casa inteira

Prompts a escrever ao chegar aqui, já com as respostas de `05-pendencias.md` (P5, P6 respondidas; P8, P14, P15
abertas).

- [ ] **S11 — Cantos L e interseções T** (P5: default California corner + ladder)
- [ ] **S12 — Divisão em painéis (comprimento/peso máximo)** — máx. 240" (P6); nunca dentro de zona de abertura;
  preferir quebra em stud de layout múltiplo de 48"; depois qualquer stud de layout; plates > 192" emendadas
  (P14); peso por `src/data/lumber.json` (P8, P15).
- [ ] **S13 — Numeração e planta de painéis**
- [ ] **S14 — Laps de plate entre painéis**

## Fase 4 — Entrada de dados

Decidir P12 antes. Se houver DXF, S15 vira "importar DXF → `Wall[]`" e a visão sobre PDF vai para o backlog.

- [ ] **S15 — Prompt para extração de paredes** (API do Claude, imagem do PDF → `Wall[]` + confiança)
- [ ] **S16 — Script `panelizer extract <planta.pdf>`** gerando o JSON de entrada para revisão

## Fase 5 — App

Cada item abaixo é 2–4 sessões; quebrar em subitens ao chegar.

- [ ] **S17 — Next.js: página que carrega um JSON e mostra os SVGs**
- [ ] **S18 — Editor de paredes (canvas SVG + painel de propriedades)**
- [ ] **S19 — Supabase: auth + tabela `projects` (jsonb) + storage**
