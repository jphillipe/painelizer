# 03 — Plano de sessões

Uma sessão do Claude Code = um item. Ritual:
1. Abrir: "Leia CLAUDE.md e docs/03-sessoes.md. Vamos fazer a sessão N. Antes de escrever código, explique a abordagem."
2. Critério de saída = `pnpm test` e `pnpm typecheck` verdes (rodam na raiz) + critério do item.
3. Fechar: marcar `[x]`, registrar decisões em `docs/04-decisoes.md`. O Claude sugere a mensagem de commit;
   quem commita é o humano. `/clear` antes da próxima.
4. Se a sessão esbarrar numa pergunta que só a fábrica responde, não parar e não perguntar ao humano: escolher a
   hipótese mais comum na prática americana / IRC, registrar em `docs/05-pendencias.md` com número P novo, citar
   `(Pn)` no código e no fixture, rodar `pnpm hipoteses` (regenera `docs/08-revisar.md`) e seguir. Decisão de
   2026-10-13: entrega primeiro, revisão com a fábrica depois, pela lista de `08-revisar.md`.

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

- [ ] **Checkpoint — painéis reais (sem Claude)** — substituído pelo Checkpoint 2 (antes da Fase 3): a fábrica não tem painel real (P1, 2026-10-05).
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

- [x] **S9.3 — Header deitado em parede não portante (R602.7.4)**
  Parede não portante sem `opening.header`: uma peça deitada sobre a abertura (P17b), válida para RO ≤ 96" e
  ≤ 24" entre a peça e a top plate; nesses limites, sem cripples acima. Fora dos limites: erro pedindo o header
  do projeto. Remove `config.defaultHeaderSection`/`defaultHeaderPlies`. Usa as hipóteses de P18 (seção, jack).
  Exige orientação "deitado" para o header no desenho (`memberBox`) e fixture novo (confirmação do humano).
  Feita em 2026-10-05 (abordagem e fixture confirmados pelo humano): `Member.flat` no header, origem `R602.7.4`,
  fixture `wall-120-door-nonbearing.json` (porta interna 2x4, 14 peças), porta na W04 do exemplo do CLI.
  SVG `wall-120-door-nonbearing.svg` sem conferência visual do humano.

- [x] **S9.4 — Cripple a até 2" do jack (P13)**
  Marca de layout com folga ≤ 2" até o jack não ganha cripple, salvo se a omissão deixar vão maior que o
  espaçamento máximo; vale abaixo do sill e acima do header. Conferir os fixtures atuais (a marca 80 fica a 2.5"
  do jack em 84 — não deve mudar) e criar um caso que dispare a regra.
  Feita em 2026-10-05: `crippleMarks` em `rules/openings.ts`; "espaçamento máximo" = 24" de vão livre
  (decidido pelo humano — com `studSpacing` a regra nunca disparava a 16" OC). Fixtures e exemplo do CLI
  inalterados; casos novos inline em `openings.test.ts` (1", 2", 2.5", lado direito, 24" OC, RO estreito, acima
  do header).

- [x] **S10 — Validações**
  Prompt: "Crie `src/panelize/validate.ts` com avisos: header fora da tabela, abertura a < 1.5\" do canto,
  studs sobrepostos, altura de stud acima do limite. Cada aviso tem código e mensagem."
  Feita em 2026-10-05 (decisões delegadas ao Claude): `validatePanel(panel, wall, config)` chamada no fim de
  `panelizeWall`, avisos `OPENING_NEAR_CORNER`, `STUDS_OVERLAP`, `STUD_HEIGHT_ABOVE_LIMIT` e
  `FIRE_BLOCKING_REQUIRED` (P11). "Header fora da tabela" ficou como `Error` (decisão da S9.2). Limites de stud
  não portante (2x4 168", 2x6 240") são leitura do Claude da R602.3(5) — conferir. Fixtures e exemplo do CLI
  sem avisos novos; testes em `test/panelize/validate.test.ts`.

## Antes da Fase 3 — o que a casa inteira depende

A Fase 3 muda o que é "x=0" de uma parede (canto, origem do layout, painel no meio da parede). Três coisas
precisam ficar prontas antes, nesta ordem: o checkpoint com a fábrica (uma visita responde P19–P24 de uma vez),
depois S11 e S12, que não dependem uma da outra.

- [ ] **Checkpoint 2 — validação com a fábrica (sem Claude)**
  Substitui o checkpoint da Fase 1: a fábrica não tem painel real (P1, 2026-10-05), então o critério de sucesso
  passa a ser folha revisada + painel de teste. (a) Gerar com o CLI as folhas de 3 ou 4 paredes de um projeto de
  `06-referencias-projetos.md` (26 Ringgold é o menor) e levar para a equipe de framing anotar cada divergência.
  (b) Montar um painel de teste só com a folha. (c) Transcrever o painel montado para `test/fixtures/real-*.json`.
  Levar as perguntas P19–P24 de `05-pendencias.md` (layout centrado na marca, cripple curto, referência de medida
  e qual parede atravessa no canto, ladder, lap entre painéis, orientação da folha) e cobrar P8/P15 (peso).
  Sem isto, a Fase 3 inteira é hipótese sobre hipótese.
  Preparação feita em 2026-10-06: PDF do arquiteto (A-100 1º pav., A-800 tipos de parede, A-400 cortes) lido;
  entrada `packages/cli/examples/ringgold-checkpoint.json` com 4 painéis (N1 16' e S1 12' com par de janelas,
  S2 12' com porta + janela a 8 1/4", I1 2x4 com porta a 3" do canto); folhas em `out/ringgold-checkpoint/`
  (90 peças, 2 avisos de jacks). Hipóteses P27–P31 em `05-pendencias`. Falta: o estrutural da SAB e a visita.
  Perguntas gerais para a reunião de 2026-10-12 em `docs/07-perguntas-fabrica.md` (27 itens, com a hipótese atual).
  **Adiado em 2026-10-13** (sem tempo para a fábrica agora): o motor segue com as hipóteses; `docs/08-revisar.md`
  (gerado por `pnpm hipoteses`) é a lista do que revisar quando a fábrica responder. A Fase 3 não espera este item.

- [x] **S11 — Layout: stud centrado na marca e origem de layout**
  Depende de P19 (hipótese: centrado). Muda uma regra de CLAUDE.md ("borda esquerda do stud na marca") e todos os
  fixtures, então nada é editado sem confirmação. Prompt: "Mude `layoutStuds(length, spacing, studThickness,
  origin = 0)`: marcas em `origin + k·spacing`, stud **centrado** na marca (borda esquerda = marca − 0.75), com
  duas exceções: o primeiro stud fica sempre em x=0 e o fechamento sempre em `length − 1.5`. `origin` é a posição,
  em x do painel, da marca 0 do prédio: negativa quando o painel começa no meio da parede (S15) e quando a parede
  encosta num canto (`−t` da parede que atravessa, S13), 0 na parede solta. Atualize `crippleMarks`, a remoção
  de studs na zona, as marcas de layout do SVG, `docs/02-framing.md` (exemplo resolvido) e CLAUDE.md. Antes de
  editar, liste os valores novos de cada fixture (studs em 15.25, 31.25…, cripples idem) e aguarde confirmação."
  Saída: fixtures confirmados verdes; `pnpm test` verde; CLAUDE.md e `02-framing` com a regra nova.
  Se P19 vier "borda na marca", a sessão só adiciona `origin` e nenhum fixture muda.
  Feita em 2026-10-06 sem resposta da fábrica, por decisão do humano ("faz do jeito que achar melhor, depois a
  gente corrige"): centrado (P19) e vão máximo de 24" (P13) ficam como hipótese. `Wall.layoutOrigin?` e
  `Panel.layoutOrigin?` (o SVG marca a partir dele); `layoutStuds` aceita `origin` negativo ou positivo. Stud que
  sobrepõe o de ponta ou o fechamento é mantido (decisão de 2026-09-28 estendida à ponta inicial). Os 7 fixtures
  recalculados pelo motor (mesmas contagens; janela, janela+porta e porta conferidos à mão) e os `$comment`
  atualizados; snapshots SVG regenerados. Se P19 vier "borda na marca": `layoutStuds` volta a `marca` em vez
  de `marca − t/2` e os fixtures voltam pelo mesmo script.

- [x] **S12 — Dados do estrutural: studs extras, sill dupla e kings por vento**
  Os projetos de `06-referencias` exigem os três; sem eles nenhum projeto real passa inteiro pelo motor.
  Prompt: "(a) `Wall.extraStuds?: { x: number; count?: number; label?: string }[]`: studs de altura inteira
  adicionais (post de hold-down, carga pontual, 'studs to match above'), `count` colados a partir de `x` para a
  direita, `role: 'stud'`; stud de layout que se sobrepõe a um extra sai (como na zona de abertura); `label` vai
  para o `<title>` no SVG. (b) `Config.doubleSillOver?: number` (hipótese 72", Horace S-507): janela com RO mais
  largo leva sill dupla — duas peças, em `sillY` e `sillY − 1.5`; cripples abaixo encurtam 1.5". (c)
  `src/data/irc-kings.json` com a Tabela R602.7.5 do IRC 2021 (studs de altura inteira em cada lado do header em
  parede externa, por vão do header e velocidade de vento/exposição), digitada em duas passadas como a R602.7;
  `config.building.windSpeed` (mph, Vult) e `exposure?: 'B' | 'C'` (default B); `kingsFor({ span, windSpeed,
  exposure })` nunca extrapola. Em parede externa com `kingStuds` ausente: kings da tabela; `kingStuds` menor
  que a tabela → aviso `HEADER_KINGS_BELOW_TABLE`; sem `windSpeed` → 1 king e aviso `WIND_SPEED_MISSING`.
  O número de kings entra na zona e na fusão (já suportado). Fixtures: `wall-144-window-irc` ganha `windSpeed`
  (conferir se muda os kings — se mudar, confirmar); casos inline para (a) e (b); `casa-exemplo.json` com
  `windSpeed`." Saída: testes de coerência da tabela R602.7.5 verdes; exemplo do CLI gerando.
  Feita em 2026-10-06 (abordagem confirmada pelo humano). R602.7.5 extraída por Claude do texto da página do
  ICC (IRC 2021) e conferida por hash, como a R602.7(1): 8 linhas (4' a 18') × 2 colunas de vento
  (`src/data/irc-kings.json`, `rules/kings.ts`). Kings resolvidos em `resolveOpeningHeader` para toda parede
  externa, portante ou não, com header do projeto ou da tabela (regra de vento). `doubleSillOver` é opt-in
  (ausente = sill simples); o exemplo do CLI usa 72". Fixtures: os 5 externos com abertura ganharam
  `building.windSpeed: 120` (RO ≤ 4' → 1 king, members iguais; os 4 com header do projeto ganharam o bloco
  `building` inteiro, inerte). Casos de (a) e (b) inline. Exemplo do CLI: 123 peças, sem avisos.

- [x] **S12.5 — Catálogo de aberturas e header schedule do projeto** (proposta de 2026-10-13, ver
  `06-referencias` "Aberturas: onde a informação mora"). Os projetos reais descrevem a abertura por **tag** (W41,
  porta 114), **eixo** do RO na planta e **marca de header** (HDR2) numa tabela do estrutural; o motor hoje só
  aceita a abertura já resolvida. Prompt: "(a) `Config.openingTypes?: Record<tag, { kind: 'window' | 'door';
  width; height; frame?: 'wood' | 'hm' | 'al'; sillHeight?; roughOffset?: { width; height } }>` com regra de
  RO default: janela +1/2" na largura e +3/4" na altura (Horace A-604); porta de madeira +2" x +1"; batente HM
  +4 1/2" x +2 1/4" (hipótese, registrar P). (b) `Config.headerSchedule?: Record<mark, { plies; section | lvl:
  { width; depth } | psl; jackStuds; kingStuds }>`; `OpeningHeader` ganha `material: 'lumber' | 'lvl' | 'psl'`
  com dimensões reais (a lista de corte lista LVL como peça própria). (c) `Opening` aceita `type` (tag) e
  `center` (eixo) como alternativa a `roughWidth`/`roughHeight`/`offset`, e `headerMark` como alternativa a
  `header`; o motor resolve e os campos diretos continuam valendo como sobrescrita. (d) `sillHeight` por
  abertura ou por tipo deriva `headerHeight` = sill + RO. (e) `config.building.species?: 'SPF' | 'Hem-Fir'`
  guardado para a tabela (hoje só SPF; Hem-Fir fora da tabela = aviso). Fixtures: janela por tag com RO derivado
  igual ao fixture atual; porta por tag; header por marca com LVL." Saída: exemplo `casa-exemplo.json` com
  catálogo; Ringgold reescrito com tags A e portas 1/U2. Fazer **antes da S13**, para o formato da casa nascer
  com o catálogo.
  Feita em 2026-10-13 (abordagem confirmada pelo humano). `rules/catalog.ts` (`resolveOpening`) resolve o
  `OpeningSpec` antes do motor; `Section` ganhou LVL/PSL com dimensões reais; BOM lista engenheirado à parte;
  `building.species` só avisa. Folgas default = P32–P34. Os dois exemplos reescritos geram a mesma saída
  (123 e 90 peças). Decisões em `04-decisoes` (2026-10-13).

## Fase 3 — Casa inteira

A entrada passa a descrever a casa em planta. `panelizeWall(wall, config)` e os fixtures `wall-*.json` continuam
valendo como estão: a casa é uma camada acima, que deriva uma `Wall` (comprimento de plate, offsets convertidos,
origem de layout) por parede e chama o motor atual. Tudo em `src/house/` e `src/rules/`, puro.

Convenções novas (confirmadas na abertura da S13, 2026-10-13; registradas em 04-decisoes):
- Parede em planta = `start`/`end` (polegadas) no **eixo** da parede (centro da espessura), só paralela aos eixos
  x/y da planta (90°). Uma regra para parede externa e interna; a Fase 4 converte a cota do arquiteto (face
  externa, centro de janela) para o eixo. Alternativa rejeitada: face externa como referência exige saber o lado
  do corpo da parede e uma segunda regra para as internas.
- `offset` da abertura na casa é medido do ponto `start` ao longo do eixo; o motor converte para o x do painel.
- No canto, a parede que **atravessa** tem a plate até a face externa da outra (+t/2 além do cruzamento dos
  eixos); a que **encosta** para na face interna da outra (−t/2). No T, a que encosta para na face. Ponta livre:
  a plate acaba no ponto. Qual atravessa: `ends` declarado > a mais longa > a primeira do arquivo (P21).
- Layout de studs medido da origem do prédio, não da ponta da plate: parede que encosta num canto tem
  `layoutOrigin = −t` da parede que atravessa (a marca 0 é a quina, antes da plate); painel no meio da parede
  tem `layoutOrigin = −x` do seu início (S11). Primeiro stud sempre em 0.

- [x] **S13 — Planta: paredes por eixo, cantos e T**
  Prompt: "Crie `src/house/types.ts`: `Point { x; y }`; `HouseWall = Omit<Wall, 'length'> & { start: Point;
  end: Point; level?: number; ends?: { start?: EndRule; end?: EndRule } }`, `EndRule = 'through' | 'butt'`;
  `House { walls: HouseWall[] }`. `src/house/connections.ts`: `findConnections(walls, tolerance = 0.5)` →
  por parede e por ponta: `corner` (ponta de outra parede a ≤ t/2 + tolerance do cruzamento dos eixos, com a outra
  perpendicular), `tee` (ponta na parte interna de outra parede, a ≤ t_outra/2 + tolerance do eixo dela), `free`;
  paredes que se cruzam ou se sobrepõem, três pontas num ponto, parede fora dos eixos → `RangeError` com os ids.
  Qual atravessa no canto pela regra das convenções. `src/house/frame.ts`: `frameWalls(house, config) →
  WallFrame[]` com, por parede, `plateStart`/`plateEnd` (pontos em planta), a `Wall` derivada (`length` = plate,
  `openings` com `offset` convertido, `extraStuds` idem), `layoutOrigin`, e `connections: { start, end, tees:
  { x, wallId }[] }` em x do painel. `panelizeHouse(house, config) → { panels, frames, warnings }`: um painel por
  parede nesta sessão, chamando `panelizeWall` com `layoutOrigin` (S11); aviso `OPENING_AT_TEE` quando um tee cai
  dentro de uma zona de abertura e erro quando cai dentro do RO. Exporte tudo por `index.ts`. CLI: `walls[]` com
  `start`/`end` (cada coordenada aceita pés-pol) entra pelo caminho da casa; sem eles, o formato atual continua;
  misturar os dois num arquivo é erro. Fixtures (confirmar valores antes): `house-corner-L.json` (duas paredes
  2x6 em L, eixos de 144 e 120 → plates 149.5 e 114.5, origem de layout 5.5 na que encosta),
  `house-tee.json` (externa 2x6 com interna 2x4 encostando no meio), `house-28x40.json` (a casa de `00-visao`,
  5 paredes, com `expected.frames` e contagem de peças por painel)."
  Saída: fixtures verdes; `casa-exemplo.json` reescrito em planta, gerando os mesmos painéis de antes onde não há
  canto. Decisões a registrar: eixo como referência; mais longa atravessa; tolerância 0.5"; mistura de formatos
  é erro.
  Feita em 2026-10-13 (abordagem e valores confirmados pelo humano). Os valores do prompt (plates 149.5 / 114.5,
  origem 5.5) eram ±t inteiro; pela convenção de eixo (±t_outra/2) ficou 146.75 / 117.25 e origem −5.5.
  `src/house/{types,axis,connections,frame,panelizeHouse}.ts`; `HouseWall` também omite `layoutOrigin` (derivado);
  `frameWalls(house, tolerance?)` não precisa de `config`; `panelizeFrame` exposto para o CLI tratar o erro de
  cada parede; `planOpenings` extraído de `panelizeWall` para o aviso de T. Colineares ponta a ponta não são
  erro (duas paredes livres em sequência). `house-28x40` com a interna em x=264 (em 240 cairia no RO da porta de
  correr). CLI: `Project.house`; exemplo com W01 `ends.start: "through"` (W02 16' atravessando daria plate de
  194.75", acima do estoque da BOM até a S15) — 125 peças (eram 123).

- [x] **S14 — Canto California, T ladder e laps da double top plate**
  Depende de P5 (respondida) e P22 (hipótese). Prompt: "Crie `rules/corners.ts`. (a) **Canto**
  (`config.corner: 'california' | 'three-stud'`, default california, P5): na parede que atravessa, um stud
  `flat: true` (face larga para dentro; ocupa `sectionDepth` em x e 1.5" em y) colado ao stud de ponta pelo lado
  de dentro do canto — x = 1.5 no início, `length − 1.5 − sectionDepth` no fim; 'three-stud' põe um stud comum
  em pé no mesmo lugar. A parede que encosta não ganha peça: seu stud de ponta já é o de canto. (b) **T**
  (`config.tee: 'ladder' | 'backer'`, default ladder, P5): na parede que atravessa, blocos `role: 'block'`,
  seção da parede, deitados, entre os dois studs vizinhos à faixa ocupada pela parede que encosta, nas alturas de
  P22 (hipótese: centros em 24, 48, 72 do subfloor em parede de 8'; em 9', também 96); comprimento = vão livre
  entre os studs; 'backer' põe dois studs de altura inteira colados às faces da parede que encosta. Stud de layout
  que cai na faixa fica. (c) **Laps da double top plate** (R602.3.2): no canto, a double top da parede que
  **encosta** avança t sobre a top plate da outra (x de −t até `length`) e a da que atravessa recua t; no T, a
  da que encosta avança t e a da que atravessa é cortada em duas peças com vão t na faixa. `layoutPlates` recebe
  por ponta `{ extend?: number; recess?: number }` e uma lista de cortes; `Member.x` da double top pode ser
  negativo ou passar de `length` — o SVG desenha fora do contorno e cota o avanço. `MemberRole` ganha `'block'`
  (cutlist e BOM contam); `memberBox` desenha stud `flat` com `sectionDepth` de largura."
  Fixtures: `house-corner-L` e `house-tee` ganham `expected.members` por painel (lista proposta antes de editar).
  Saída: fixtures verdes; SVG dos dois conferido visualmente. Decisões: alturas dos blocos; canto = `stud` +
  `flat` (sem papel novo); laps por ponta em `layoutPlates`.
  Feita em 2026-10-13 (abordagem e lista de peças confirmadas pelo humano). As ligações entram no motor por
  `Wall.joints` (derivado em `frameWalls`); `panelizeWall` monta tudo e `panelizeFrame` virou só
  `panelizeWall(frame.wall)` — o aviso `OPENING_AT_TEE` mora em `rules/corners.ts`. Faixa do T na zona de
  abertura: só o aviso, sem peça de T. `house-tee` com a W2 em x=72 (em 96 caía na zona da janela e não
  testaria o ladder). `formatInches` aceita negativo (x da double top com lap). `house-28x40`: W01 51 e W03 42
  peças; exemplo do CLI 130 (eram 125). Detalhes em 04-decisoes.

- [x] **S15 — Divisão em painéis, emendas de plate e peso**
  Depende de P6 e P14 (respondidas), P8/P15/P23 (hipóteses). Prompt: "Crie `rules/split.ts`:
  `splitPanel(panel, frame, config.panel)` com `config.panel = { maxLength: 240, maxWeight?: number,
  module: 48, lap: 48, minLap: 24 }`. Candidatos a quebra = marcas de layout em coordenadas do prédio
  (`origin + k·spacing`) que não caem em zona de abertura (zona fundida), nem a menos de 2·t de um canto, nem na
  faixa de um T. Preferir marca múltipla de `module` contada da origem; depois qualquer marca; sem candidato que
  respeite `maxLength` → `Error` com a parede e o trecho. Algoritmo: da esquerda, a maior quebra que deixa o
  trecho ≤ maxLength (e ≤ maxWeight, se houver); se o último trecho ficar < 48", recuar uma quebra. Painel i =
  [a, b]: plates de a a b; o stud da marca b é substituído pelo par stud de fechamento em b − 1.5 (painel i) e
  primeiro stud em b (painel i+1) — stud duplo na junta, cada painel com a própria ponta; os demais members vão
  para o painel onde está seu x; `layoutOrigin` do painel i+1 = origem − b. Lap entre painéis (hipótese P23): a
  double top do painel i avança `lap` sobre o seguinte e a do painel i+1 começa em `lap`; se o avanço terminar
  dentro de um header, encurtar até `minLap` ou ir até a marca seguinte. Emenda de plate (P14) quando a plate do
  painel passa do maior `stockLengths`: cortar sobre o centro de um stud (cada peça apoia 3/4"), top e double top
  defasadas ≥ `minLap` (preferir 48"); bottom emenda sobre stud sem outra restrição; a BOM deixa de lançar
  `RangeError` para peça acima do estoque. Peso: `src/data/lumber.json` (lb/pé por seção, SPF a ~35 pcf:
  2x4 1.28, 2x6 2.0, 2x8 2.64, 2x10 3.37, 2x12 4.1 — hipótese P8), `panelWeight(panel)` → `Panel.weightLb`,
  sem sheathing (anotar na folha). `panelizeHouse` passa a devolver os painéis divididos."
  Fixtures (confirmar antes): `house-split-480.json` (parede de 40' de `00-visao`, porta e janela → painéis com
  quebras, plates e studs esperados) e um painel de 240" com plate emendada. Saída: fixtures verdes; peso em
  `panels.csv` do CLI.
  Feita em 2026-10-13 (abordagem, critério de divisão e fixtures confirmados pelo humano). Diferenças em relação
  ao prompt: (a) a divisão **re-executa `panelizeWall` por trecho** (`panelize/splitWall.ts`) com uma `Wall`
  derivada e a junta como ligação `{ kind: 'panel', lap }` — o par de studs da junta, cripples, blocos, validações
  e avisos saem por painel sem remendo; (b) critério **equilibrado** no lugar do guloso (hipótese P35): menor
  número de painéis, depois o painel mais longo menor, preferindo marcas múltiplas de 48 — o guloso dava tocos de
  53 1/2" nas paredes de 40' da casa 28x40; (c) `stockLengths` entrou em `Config` (o CLI copia o campo da raiz);
  (d) a BOM marca peça acima do estoque como `oversize` em vez de erro. Fixtures: `wall-480-split` (dois painéis
  de 240) e `wall-240-spliced` (um painel, plates emendadas); `house-28x40` com 12 painéis. CLI: `panels.csv`.
  Detalhes em 04-decisoes.

- [x] **S16 — Numeração e planta de painéis**
  Prompt: "`Panel.id` = `{level}-{wallId}-P{n}` (`level` default 1; sempre com `-P1`, mesmo em parede de um
  painel só) e `Panel.plan: { start: Point; end: Point }`. Ordem: paredes na ordem do arquivo; painéis de start
  para end. Crie `output/planSvg.ts`: `housePlanSvg(house, panels, opts)` — vista de cima, escala em px/pol,
  paredes com a espessura real, cantos e T como ficam, aberturas como vão na parede, juntas de painel com tique e
  id, ids de parede, cota externa total nos dois sentidos, seta do norte opcional (`house.northAngle?`).
  CLI: `plan.svg` e `panels.csv` (id, parede, pavimento, comprimento, altura, seção, nº de peças, peso, avisos);
  `panels/<id>.svg` usa o id novo." Fixture: `house-28x40` com `expected.panelIds`; snapshot do `plan.svg`.
  Saída: planta conferida visualmente. Decisão: formato do id.
  Feita em 2026-10-14 em sessão autônoma ("faça a próxima sessão"): abordagem não submetida antes; os `plan` dos
  fixtures foram derivados do motor e conferidos à mão contra `expected.frames`; a planta foi conferida
  visualmente pelo Claude no browser (28x40 e `casa-exemplo`) — o humano confere `plan.svg` no Checkpoint 3.
  Diferenças em relação ao prompt: `level` virou campo de `Wall` (parede solta também numera `1-W01-P1`);
  `Panel.plan` sai de `panelizeFrame`; `housePlanSvg(house, panels, opts)` desenha só a partir dos `plan`
  dos painéis (a plate de cada parede vai do primeiro ao último painel), sem precisar dos frames;
  `northAngle` entra na raiz do projeto do CLI. Fixtures `wall-480-split`, `wall-240-spliced` e `house-*`
  atualizados para o id novo (`casa-exemplo` continua com 130 peças). Detalhes em 04-decisoes.

- [x] **S17 — Folha de fabricação**
  Depende de P24 (hipótese: vista de fora). Prompt: "Transforme `panelSvg` numa folha: cabeçalho (projeto, id,
  parede, pavimento, seção, data e revisão vindas de `opts`), indicação de face externa e de vista (P24),
  cotas de RO (largura; altura do subfloor ao topo e à base do RO), altura do header e do sill ao subfloor,
  cadeia de cotas no rodapé do centro de cada stud a partir de x=0 (acumulada), avanço das double top plates
  cotado, rótulo curto por peça (K, J, C, H, S, B) e lista de peças na margem direita (da cutlist, com comprimento
  em pés-pol e em polegadas), peso estimado, cortes na obra e avisos. Studs extras com o `label`. Tudo sem
  dependência; PDF fica no CLI (`--pdf`, `@resvg/resvg-js`) só se a fábrica pedir — o SVG abre e imprime no
  navegador." Fixtures: snapshots novos de todos os painéis; conferência visual do humano de pelo menos
  `wall-144-window-door` e um painel de canto. Saída: a folha que vai para o Checkpoint 3 (abaixo).
  Feita em 2026-10-14 em sessão autônoma ("faça a próxima sessão"): abordagem não submetida antes; as folhas
  foram conferidas visualmente pelo Claude (render com Chrome headless de `wall-144-window-door`, porta não
  portante, stud extra, canto L W1/W2 e `house-28x40` W01-P1) — **o humano ainda confere** `wall-144-window-door`
  e um canto antes do Checkpoint 3. Diferenças em relação ao prompt: (a) o desenho **não espelha**: vai sempre de
  start para end (x=0 à esquerda) e a folha escreve qual face o leitor vê — `Panel.facing` vem da planta (lado
  oposto ao centro das plates, como na planta de painéis); parede externa solta assume vista de fora; (b) o motor
  passou a expor `Panel.openings` (RO em x do painel, topo = base do header), `exterior` e `bearing` — a folha
  não deriva o RO das peças; (c) a sill é cotada pelo topo (peitoril = base do RO) e o header pela base (= topo do
  RO), que são as alturas que a fábrica usa; (d) data e revisão vêm do arquivo do projeto no CLI (`date`,
  `revision` na raiz), nunca do relógio. Snapshots `wall-*` regenerados e dois novos (`house-corner-L-W1/W2`).
  Detalhes em 04-decisoes.

- [x] **Checkpoint 3 — casa inteira com hipóteses (interno)**
  Como escrito antes ("na fábrica": montar dois painéis vizinhos e um canto, divergências viram fixtures), não
  cabe na decisão de 2026-10-13: a fábrica não responde agora, o motor segue com as hipóteses de `05-pendencias`
  e a revisão fica para a lista de `08-revisar.md`. Refeito como checkpoint interno: rodar a casa inteira do
  início ao fim, conferir folhas, planta e listas, e registrar o que a casa exercita de cada hipótese.
  Feito em 2026-10-14: entrada do CLI `packages/cli/examples/house-28x40.json` (mesma casa do fixture, com nome,
  data, revisão e norte) e `ringgold-checkpoint.json` com carimbo; os dois rodados em `out/checkpoint-3/` (28x40:
  12 painéis, 234 peças a cortar, sem avisos; Ringgold: 4 painéis, os 2 avisos de jacks de sempre — segue com 4
  painéis porque o estrutural da SAB não está no repositório). Planta e 8 folhas conferidas pelo Claude em PNG
  (Chrome headless): cantos que atravessam e que encostam, T com ladder, porta com corte na obra, janela, interna
  2x4 com double top emendada, S2 do Ringgold. Relatório em `docs/09-checkpoint-3.md` (e PDF em
  `out/checkpoint-3/`): o que foi gerado, de onde vem a altura de cada abertura, o que cada painel exercita de
  P19–P24, P35 e P36, e o que fica para quando alguém responder. Correção de passagem: o cabeçalho da folha
  contava o header como 1 peça enquanto a lista da margem e `panels.csv` contavam os plies — agora todos contam
  peças a cortar (5 snapshots `wall-*` mudaram só nessa linha). `07-perguntas-fabrica.md` arquivado (redundante
  com 05 e 08). Nenhum fixture `real-*`: os sintéticos continuam sendo a verdade. Próximo: Fase 4 (S18).

## Fase 4 — Entrada de dados

Decidir P12 antes. Se houver DXF, S18 vira "importar DXF → `HouseWall[]`" e a visão sobre PDF vai para o backlog.
Os PDFs de referência são vetoriais (Revit): extrair texto e geometria do PDF antes de recorrer a imagem.

- [x] **S18 — Prompt para extração de paredes** (API do Claude, imagem/texto do PDF → `HouseWall[]` + confiança;
  cotas do arquiteto convertidas para o eixo: face externa + t/2, centro de janela − RO/2)
  Feita em 2026-10-14 (abordagem aprovada em 5 pontos). Pacote novo `packages/extract` (fora do core): `pdf.ts` lê o
  PDF vetorial com `pdfjs-dist` (texto com posição e rotação, agrupado em linhas; número da folha pelo carimbo;
  `pickPages` escolhe A-1xx e A-8xx; `subsetPdf` recorta as páginas com `pdf-lib`); `schema.ts` é o que o modelo
  devolve (zod, listas em vez de chaves dinâmicas, `null` em vez de campo ausente, medidas como texto do desenho,
  confiança e evidência por parede, abertura e tipo); `prompt.ts` é o system prompt fixo com as convenções do CLI
  (eixo, face externa + t/2, `center` das aberturas, tags do schedule, nunca inventar cota, não escolher header) e a
  mensagem com o PDF recortado como `document` + texto posicionado; `convert.ts` monta o JSON do CLI e passa pelo
  `projectFrom` do CLI (erros viram `problems`), mais o relatório de revisão em Markdown; `client.ts` chama
  `messages.parse` com structured outputs (`claude-opus-5-5`, effort high, system cacheável) e trata recusa, corte
  e resposta fora do schema. Testes sem rede (39): PDF sintético com `pdf-lib`, respostas gravadas
  (`ringgold-output.json`, que convertida bate com `ringgold-checkpoint.json` nas 4 paredes e 5 aberturas;
  `corner-output.json` em planta) e cliente falso; a leitura do PDF real do Ringgold roda quando o arquivo existe
  (A-100 = página 3, A-800 = 15). A chamada real fica para a S19 e só roda com `ANTHROPIC_API_KEY`. Não há
  resposta real gravada: o fixture foi escrito à mão a partir do texto da A-100, então a S19 é quem valida o prompt.
- [x] **S19 — Script `panelizer extract <planta.pdf>`** gerando o JSON de entrada para revisão
  Feita em 2026-10-14, **sem chave da API** (decisão do humano: construir e testar com respostas gravadas; a
  primeira chamada real fica para quando houver crédito). Virou `pnpm extract <planta.pdf> --out <dir>` no pacote
  `extract` (não `panelizer extract`: o CLI depender do extract criaria ciclo, porque o extract valida com
  `cli/project`). Sem `--pages`, escolhe a planta A-1xx e o schedule A-8xx pelo carimbo. Grava `projeto.json`
  (entrada do `build`), `extracao.json`, `revisao.md` e `paginas/<n>.txt`. Dois modos sem rede: `--dry-run`
  (texto posicionado + `pedido.json` com modelo, system prompt, schema e tamanhos; nada enviado) e `--response
  <json>` (pós-processa uma resposta gravada). Chamada real exige `ANTHROPIC_API_KEY`; credencial recusada,
  erro da API, recusa, corte e resposta fora do schema saem com mensagem própria (texto cru em
  `resposta-bruta.txt`). O `convert` roda o parser do CLI **e o motor** (`buildProject`, puro) sobre o JSON
  extraído: erros viram `problems` (`parser: …` / `motor: …`) e avisos viram `warnings`, os dois no stderr e em
  `revisao.md`; os arquivos são gravados e o código de saída é 0: a saída é para revisão. Foi isso que mostrou
  que a extração precisa de `floorSpan` (sem ele o header da janela A sai da tabela) e que o Ringgold extraído
  chega ao revisor com o problema P30 (8 1/4" entre porta e janela na S2) em vez de `jackStuds: 1` escondido. Testes (11) com `Io` em memória e a
  chamada à API injetada. Falta, com chave: rodar no Ringgold (páginas 3 e 15) e comparar com
  `ringgold-checkpoint.json`.

## Fase 5 — App

Cada item abaixo é 2–4 sessões; quebrar em subitens ao chegar.

- [ ] **S20 — Next.js: página que carrega um JSON e mostra os SVGs e a planta**
  Planejada em 2026-10-14 (plano aprovado pelo humano) em quatro subitens. Decisões do humano: `docs/10-design.md`
  antes de qualquer componente (serve também para a landing futura); Tailwind CSS + shadcn/ui; formulários com
  zod + react-hook-form; mutações só por server actions com next-safe-action; leituras em Server Components;
  camada de services (só servidor) entre actions e core/extract; ky como único cliente HTTP (só em services, só
  onde há HTTP de verdade); motor roda no servidor; cores do site da National Lumber; interface em inglês; só
  localhost nesta fase; S20 inclui o upload de PDF (desligado com aviso sem `ANTHROPIC_API_KEY`).
  - [x] **S20.0 — design.md + scaffold com tema.** Feita em 2026-10-14. `docs/10-design.md` (tokens lidos do DOM do
    site: navy/gold/paper/ink, Barlow + Barlow Condensed + IBM Plex Mono, raio 3px/pill, sombras, gutter, mapa
    para o tema do shadcn, componentes e estados, layout do shell e da landing, rotas, arquitetura de requisições).
    `packages/web`: Next 16.4 (App Router, Turbopack), React 19, Tailwind v4 com `@theme` dos tokens, shadcn CLI 4
    (`cn` do pacote `cn`, `radix-ui` unificado; Button com variante `accent` pill), fontes por `next/font`,
    `AppShell`, `/` → `/app`, `/app` placeholder lendo os exemplos pelo service; `src/services/panels.service.ts`
    (`generate`, `listExamples`, `exampleText`; único importador de `cli/*`), `src/lib/http.ts` (ky + `ServiceError`),
    `src/lib/safe-action.ts` (`actionClient` com `handleServerError`); `cli/examples` exportado (3 exemplos como
    texto, com teste no cli); `pnpm web`; `.claude/launch.json`. Turbopack resolveu `exports` → `.ts` sem ajuste
    (risco 1 do plano não se materializou); `next dev` reescreveu `jsx: react-jsx` e o `include` do tsconfig.
    Testes (8): service com os 3 exemplos (234 peças da 28x40, 2 avisos do Ringgold, problemas do parser e do motor)
    e o ky. Sem modo escuro.
  - [x] **S20.1 — Visualizador.** Feita em 2026-10-15. Action `generatePanels` (`src/actions`, zod em
    `src/schemas/project.ts`, next-safe-action) → `panels.service.generate`; `ProjectForm` (react-hook-form +
    zodResolver + `Form` do shadcn: select de exemplos, "Open file", textarea mono, botão accent com estado
    "Generating…", erros por toast); `ResultView` (vazio, skeleton, `Problems` em Alert destructive, resumo com
    Badges, `Warnings` em Alert `warning`, abas Plan e Sheets com lista de painéis, folha selecionada e "Show all");
    `Viewer` (client) compõe os dois; a página é Server Component e passa os exemplos (com texto) pelo service.
    Tipos do resultado em `src/types/panels.ts` (trafegam servidor → cliente sem importar core). `src/lib/files.ts`
    (planOf, sheetsOf na ordem dos painéis, csvsOf, zipName, formatSize, sheetFileName igual ao `svgFileName` do
    CLI — testado contra ele). Alert ganhou variantes `warning` e `success`; `Toaster` no layout. Conferido no browser
    embutido: 28x40 gera 12 painéis / 234 peças / 16 arquivos com a planta e as folhas inline; JSON inválido mostra
    o problema do parser; Ringgold mostra os 2 avisos de jacks. Testes do web: 13.
  - [x] **S20.2 — Fluxo do usuário: upload multiarquivo e revisão de paredes.** Feita em 2026-10-15, trocada de
    ordem com os downloads a pedido do humano ("o JSON na tela não faz sentido para o usuário"). Tela única `/app`
    em três passos: 01 desenhos (upload de vários arquivos — PDF, PNG, JPG, WebP, GIF —, páginas opcionais,
    pavimento, notas para a IA; sem chave, Alert e botão desligado), "Try with a sample" (gera na hora) e
    "Advanced" recolhido (arquivo de projeto do CLI; resposta gravada da IA); 02 revisão (tabela de paredes com
    geometria no eixo, seção, tipo, papel, aberturas com posição e confiança por badge, notas da IA, relatório
    completo recolhido, problemas e avisos do motor, botão "Generate panels" desligado enquanto houver problema);
    03 painéis (`ResultView` da S20.1). `/app/extract` deixou de existir. No `extract`: `ExtractRequest.sources`
    (vários PDFs e imagens; PDF sem `pages` escolhe pelo carimbo ou manda todas até 20), prompt com bloco
    `image` e nome de arquivo por página, `pagesSent` no resultado, `apiErrorInfo` para o app não depender do SDK.
    No web: `extract.service.ts` (`fromFiles`, `fromRecorded`, `hasKey`, `toSource`; deps injetáveis; 8 testes),
    `types/extract.ts` (`ExtractOutcome`, `WallReview`), actions `extractWalls` (FormData) e `finishResponse`,
    componentes `UploadForm`, `WallsReview`, `SamplePicker`, `AdvancedImport`; `Viewer` orquestra. Conferido no
    browser sem chave: aviso, exemplo gerando painéis, resposta gravada do Ringgold virando tabela com o problema
    P30 e o botão desligado. Chamada real continua sem teste até haver chave. Testes: extract 56, web 20.
  - [ ] **S20.3 — Downloads, zip, impressão.** `zip.ts` (fflate) + teste, aba Files, "Download all", print CSS.
    Pronto quando o zip descompacta na mesma árvore que `pnpm panelizer build` grava.
- [ ] **S21 — Editor de paredes (canvas SVG + painel de propriedades)**
- [ ] **S22 — Supabase: auth + tabela `projects` (jsonb) + storage**
