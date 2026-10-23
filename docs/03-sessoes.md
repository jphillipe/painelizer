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

- [x] **S20 — Next.js: página que carrega um JSON e mostra os SVGs e a planta** (S20.0–S20.3 concluídas em 2026-10-19)
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
    Visual refeito na mesma data a pedido do humano, no desenho do takeoff da National Lumber: `StepBar`,
    `DropZone` (arrastar e soltar, lista com remover), "Project details" (pavimento, nome, páginas, notas
    recolhidas), `PreviewCard` com a planta da 28x40 como ilustração. Componentes e actions da rota vivem em
    `app/app/_components` e `app/app/_actions` (10-design §9).
    **Primeira extração real (2026-10-15, chave do humano):** A-100 + A-800 do Ringgold, `claude-opus-5-5`, effort
    high, 10 min 38 s, 20 989 tokens de entrada e 70 240 de saída (~US$ 1,50). Leu o 1º pavimento inteiro em
    planta: 26 paredes (6 externas, 20 internas), 42 aberturas, 6 tipos de parede, 7 tipos de abertura, origem no
    canto SO no eixo, e 25 notas honestas (erro de fechamento de 1/8" nas cadeias, paredes sem cota com confiança
    0,3–0,4, dúvidas sobre portantes entre unidades). Conferido contra `ringgold-checkpoint.json`: as posições
    batem exatamente (N1 par A, S1 par A, porta 1, pares da S2) — a diferença de 2 3/4" é a conversão face
    externa → eixo, feita certo; a I1 saiu com 15'-8 1/2" eixo a eixo = 15'-4" entre faces + 2 3/4" + 1 3/4".
    Divergências: a IA separou cada par de janelas A em duas aberturas coladas (RO sobrepostos) — regra nova no
    prompt (par = uma abertura, tipo `A2`); duas portas internas sem posição (confiança 0,3). Sem cortes nem
    estrutural no conjunto, `wallHeight`, `floorsSupported` e `building` vieram null: viraram entradas do humano
    (`--wall-height`, `--snow`, `--width`, `--wind`, `--exposure`, `--floors`, `--floor-span` no CLI; "Wall
    height" e "Structural data" no site), aplicadas só onde a IA deixou vazio. Replay offline da leitura com
    esses dados e os pares juntados: o motor chega às aberturas e para em três objeções legítimas (P30 nas
    paredes sul, porta da I12 colada no início da parede, e uma nova, P37: emenda da double top num painel de
    266 1/2" cheio de aberturas na S1). A chamada só rodou depois de três correções no cliente: streaming
    obrigatório, structured outputs inviável para este schema (vai no prompt), `max_tokens` 96 000 porque o
    raciocínio conta. **Chamada real pelo site feita pelo humano** (2026-10-15, PDF de 2 páginas `out/ringgold-1st-floor.pdf`):
    26 paredes, os pares de janelas já como `A2` (16 pares), notas idênticas em qualidade; travou em "altura" porque
    os dados do projeto só podiam ser dados antes da chamada. Corrigido: `ProjectDataForm` na tela de revisão
    (action `applyProjectData` → `extract.service.reconvert`, que reaplica `toConvertOptions` à resposta guardada
    em `outcome.output` sem nova chamada); os mesmos campos (`ProjectDataFields`) ficam opcionais no upload.
    Conferido no browser com resposta gravada sem altura: o card aparece destacado, "Apply" remove o problema de
    altura e o motor passa a apontar o que falta de verdade (header fora da tabela sem `floorSpan`).
  - [x] **S20.3 — Downloads, zip, impressão.** Feita em 2026-10-19 em sessão autônoma ("faça a próxima sessão";
    sem regra de framing, abordagem não submetida). `src/lib/zip.ts` (`zipFiles`, fflate `zipSync` nível 6, `mtime`
    opcional para zip determinístico) com teste que roda o CLI em memória (`cli/main` passou a ser exportado) e
    confere que o zip descompacta na mesma árvore que `panelizer build --out` grava: mesmos caminhos, mesmo
    conteúdo, `plan.svg` e 12 folhas da 28x40. `files.ts` ganhou `fileKind`, `mimeOf`, `baseName` e `fileLabel`
    (o que há em cada arquivo, em inglês); `download.ts` ganhou `downloadBlob`/`downloadBytes`. `ResultView`: aba
    **Files** (tabela arquivo / conteúdo / tamanho / download avulso, mesma ordem do CLI), "Download all" (zip
    `<slug>-panels.zip`, no cabeçalho e na aba) e "Print sheets" (vai para Sheets com todas as folhas e chama
    `window.print()` no render seguinte). Impressão: `.no-print` some (cabeçalho, badges, avisos, abas, lista),
    `.sheet`/`.plan` sem card, uma folha por página carta paisagem, sem página em branco no fim. Conferido no
    browser embutido com a 28x40: 16 arquivos listados, zip de 38 KB com assinatura PK e nome
    `casa-28x40-visao-panels.zip`, `bom.csv` avulso, regras `@media print` presentes. Testes do web: 31.
- [x] **S21 — Editor de paredes (canvas SVG + painel de propriedades)** — concluída em 2026-10-20 (S21.0–S21.3).
  Planejada em 2026-10-19 (plano aprovado pelo humano) em quatro subitens. Decisões do humano: core puro no cliente
  só via `src/lib/editor/*` (validação geométrica instantânea; emenda em 10-design §7); checagem do motor com
  debounce (action `checkProject`, ~600 ms, sem arquivos; Generate continua manual); canvas com seleção, arraste
  de pontas e aberturas com snap (1", Shift 1/8"), pan/zoom, Delete/Esc/Ctrl+Z, parede nova por botão, sem
  desenho livre. Hipóteses: passo 02 inteiro vira o editor (exemplos e Advanced caem nele); formato solto abre
  sem canvas; unidade interna polegadas em número e serialização em número; inspetor sem react-hook-form;
  catálogo (openingTypes/headerSchedule) só leitura nesta sessão.
  - [x] **S21.0 — Modelo, issues, checagem; editor sem canvas nem edição.** Feita em 2026-10-19. `lib/editor/draft.ts`
    (`ProjectDraft`, espelho tolerante do JSON do CLI com medidas em polegadas e forma de catálogo preservada;
    `draftFromText`/`textFromDraft` com ida e volta testada contra `parseProject` nos 3 exemplos e na leitura
    gravada do Ringgold; `$comment`/`wallType`/chaves desconhecidas sobrevivem; `nextWallId`/`nextOpeningId`),
    `measure.ts` (pés-pol ↔ polegadas com sinal), `problems.ts` (`Issue` com parede/abertura/painel a partir das
    strings do parser, do motor e da extração, por varredura de ids inteiros; `draftIssues` para o que o modelo já
    sabe), `provenance.ts` (confiança e evidência da IA por id), `state.ts` (reducer com `load`/`reset`/`select`,
    `commit` com histórico e transação de arraste, undo/redo). Service `check()` + action `checkProject` +
    `CheckResult`; core exporta `axisOf`/`along`/`across`/`pointAt` e ganha `sideEffects: false`. Web:
    `NewProjectView` com `useReducer` (exemplos, Advanced e extração caem no passo 2; Generate manda
    `textFromDraft`); `editor/wall-editor.tsx` (cabeçalho com badges e status da checagem, downloads do draft,
    `ProjectDataForm`, `IssuesList` clicável com "stale", `WallList` com seleção, notas e relatório da IA),
    `useProjectCheck` (debounce 600 ms, resultado marcado pela revisão, resposta antiga descartada);
    `walls-review.tsx` removido. Conferido no browser: 28x40 abre no passo 2 "Ready · 12 panels" e gera 12
    painéis / 234 peças / 16 arquivos; Ringgold (solto) com os 2 avisos P30 em S2, clicar no aviso seleciona a
    parede; leitura gravada sem altura dá 6 problemas por parede e o aviso da abertura sem posição, "Apply"
    recarrega o draft e fica "Ready · 4 panels". Testes do web: 69 (eram 31). `next build` para conferir o
    bundle do cliente não rodou (dev server ativo no mesmo `.next`) — fica para a S21.2, quando o core entra de
    verdade no cliente pela geometria.
  - [x] **S21.1 — Inspetor e edição (sem canvas).** Feita em 2026-10-19 em sessão autônoma ("faça a próxima
    sessão"; sem regra de framing). Reducer completo em `lib/editor/state.ts` (`updateProject`/`updateConfig`/
    `updateBuilding`, `updateWall`, `renameWall`, `moveEndpoint` — ao mover `start`, offsets, centros e studs extras
    deslocam para as aberturas ficarem no lugar em planta —, `setWallLength`, `addWall` (continua da ponta `end` da
    parede de referência virando 90° à esquerda, copia altura/seção/pavimento/papel, id pelo padrão dominante),
    `removeWall`, `addOpening` (primeira tag do catálogo no centro, ou janela 36×48 sem catálogo), `updateOpening`,
    `renameOpening`, `removeOpening`, `moveOpening`, `endTransaction`; patch com chave `undefined` apaga o campo;
    arredondamento a 1/16"); `lib/editor/resolve.ts` (`resolveOpening` do core sobre o draft: RO, borda e altura
    como o motor vê, largura para converter centro ↔ borda, `configFromDraft`). Componentes em
    `_components/editor/`: `fields.tsx` (`CommitInput` genérico — confirma no blur/Enter, Esc reverte, erro inline,
    valor de fora só entra sem foco; `MeasureInput`, `NumberInput`, `TextInput`, `MeasureListInput`, `EnumSelect`,
    `BoolSelect`), `WallProperties` (id, tipo, pavimento, altura; geometria em planta com start/end/comprimento/cantos
    ou solta com length/layoutOrigin; seção, posição, carga, pavimentos acima, apoio, largura; lista de aberturas;
    proveniência; issues), `OpeningProperties` (linha resolvida; tamanho por tag ou RO manual; posição por centro ou
    borda com conversão; alturas; header por marca, especificado ou tabela; jacks/kings), `ProjectProperties`
    (carimbo, framing, painéis e estoque, building, catálogo e header schedule só leitura, `ProjectDataForm`),
    `Inspector` (breadcrumb projeto › parede › abertura; remonta por id), `EditorToolbar` (add wall/opening, remove,
    undo/redo, project settings), `useEditorShortcuts` (Delete/Backspace, Esc, Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y, fora
    de inputs e diálogos). `ProjectDataForm` ganhou `confirm`: com edições pendentes, abre `Dialog` "Discard your
    edits?" antes de reconverter. `WallEditor` em duas colunas (issues + lista | inspetor sticky), badge "edited".
    Defeito achado e corrigido no browser: Enter confirmava e o blur na mesma passada confirmava de novo com a prop
    antiga (dois commits por edição) — `CommitInput` guarda o último valor confirmado num ref. Conferido no browser
    (Ringgold): jacks 2 em S2-D1 tira o aviso P30 dela ("Ready · 4 panels", 1 aviso), Undo volta aos 2 avisos; Add
    wall cria S3 depois da selecionada e a seleciona, rename para X9 reflete na lista e no breadcrumb, id repetido
    mostra "Another wall has this id" sem mudar nada; stud spacing 24" nas configurações recheca o motor; leitura
    gravada sem altura (4 problemas, Generate desligado) corrigida parede a parede (altura em N1 e S2, pré-corte
    104 5/8" no projeto) fica "Ready · 2 panels" com os 2 avisos P30 e Generate ligado. Testes do web: 84.
  - [x] **S21.2 — Canvas estático.** Feita em 2026-10-19 em sessão autônoma ("faça a próxima sessão"; sem regra de
    framing). `lib/editor/geometry.ts`: `planGeometry(draft, lastGood?)` monta a `House` do core (aberturas
    resolvidas uma a uma; altura/seção/papel com default só para a planta), chama `frameWalls` e devolve por parede
    as plates como o motor enquadra (retângulo na espessura real, `framed: true`), as aberturas como vãos (`s0`/`s1`
    do `start`, retângulo; irresolvida tracejada com o que se sabe; sem posição, sem retângulo), `bounds`, pavimentos;
    quando o core lança (paredes cruzadas, três pontas, `ends` em conflito) a casa não some: `houseError` com as
    paredes citadas, fallback eixo ± t/2 em todas (`framed: false`) e, com `lastGood`, as não citadas mantêm as
    plates anteriores; parede sem eixo (diagonal, pontas iguais) vai para `broken`. `geometryIssues` liga o erro a
    todas as paredes citadas (`Issue.alsoWalls`, que `byWall` indexa também — "paredes W01 e W05 se cruzam" conta
    nas duas). `viewport.ts`: planta ↔ tela sem transform CSS, `fitViewport`, `zoomAt` (âncora fixa), `panBy`,
    `snap`. `PlanCanvas` (SVG React): paredes com a espessura real (externa gold-100, interna paper-3), aberturas
    como vãos com batentes e linha de vidro, ids (rodados nas verticais), origem, seta do norte, cota da parede
    selecionada, filtro de pavimento quando há mais de um, Fit; clique seleciona parede ou abertura pelos `data-*`
    do próprio SVG (sincronizado com lista e inspetor), arrastar o fundo faz pan, roda dá zoom no ponteiro (listener
    não passivo); reenquadra só quando outro projeto entra (`fitKey`), não a cada edição; parede com problema em
    vermelho, com aviso em dourado escuro, não enquadrada tracejada. Issues de geometria entram na lista sem repetir
    as do motor (`planta: …`). Smoke test com `renderToStaticMarkup` (vitest passou a incluir `*.test.tsx`; sem
    jsdom). Conferido no browser com a 28x40: 5 paredes e 7 aberturas desenhadas, W01 com o avanço do canto
    (485 1/2") e W02 encostando (27'-6 1/2"); clicar na parede e na abertura pela planta seleciona lista e inspetor;
    `start y` de W05 = −50 cruza W01 → badge "plan doesn’t close", W01 e W05 vermelhas, as 5 tracejadas mas na tela;
    Undo volta a "Ready · 12 panels". `next build` rodou limpo (bundle do cliente com o core). Testes do web: 101.
  - [x] **S21.3 — Arraste e acabamento.** Feita em 2026-10-20 em sessão autônoma ("faça o próximo item"; sem regra
    de framing). `geometry.ts` ganhou `draggedEndpoint` (ponta segue o ponteiro só ao longo do eixo, coordenada
    móvel com snap) e `draggedOpeningStart` (borda esquerda = ponteiro no eixo − onde a abertura foi pega, com snap,
    presa entre as pontas da parede), testados. `PlanCanvas`: a parede selecionada ganha alças nas pontas
    (`data-handle`, círculo de 6 px com área de clique de 12 px, cursor pelo eixo); arrastar a alça move a ponta
    (`moveEndpoint`), arrastar uma abertura desliza o RO (`moveOpening`), arrastar o corpo de uma parede ou o fundo
    faz pan; snap de 1" e 1/8" com Shift; no máximo um dispatch por quadro (`requestAnimationFrame`, com a geometria
    e o viewport mais recentes num ref); cada arraste leva um `txn` próprio e termina com `endTransaction` — um
    arraste = um undo; clique sem movimento (< 3 px) continua selecionando; `setPointerCapture` tolerante a ponteiro
    sintético. `WallEditor` guarda a última geometria em que a casa fechava e a passa como `lastGood` (paredes não
    citadas no erro mantêm as plates durante um arraste que abre a casa). Rótulo da parede selecionada mostra plate e
    eixo; abertura selecionada mostra a borda. "Add wall" já continuava da ponta selecionada (S21.1) e a conversão
    centro ↔ borda já existia no inspetor (S21.1). Conferido no browser com a 28x40 e eventos de ponteiro sintéticos:
    arrastar a ponta de W01 −24,3" com 15 px de desvio vertical dá 38'-0" (só no eixo, snap 1"); Undo volta a 40'-0"
    com um passo só; com Shift, −5,3" dá 37'-6 3/4"; arrastar P1 +30" leva a borda de 14'-0" a 16'-6" sem mudar a
    seleção; arrastar o corpo de W03 faz pan e não edita; a checagem recalcula ("Ready · 11 panels" com W01 mais
    curta). Testes do web: 104. Fica para depois da S22: editar o catálogo (openingTypes/headerSchedule) e
    criar parede desenhando na planta.
  - [x] **S21.4 — Workspace do editor (UX do passo 02).** Feita em 2026-10-20 (plano aprovado pelo humano; sem
    regra de framing). Motivo: o passo 02 era uma coluna longa com tudo ao mesmo tempo (8 badges, formulário de 9
    campos, planta 4:3, 30 problemas iguais em mono, tabela de 30 × 8, notas e relatório da IA, Generate no fim) e
    o humano não conseguia usar. Decisões do humano: workspace full-bleed (não a coluna de 1200 px) e card único
    "Before you review" quando a leitura chega sem altura. Lib: `Issue.kind` (família: `wall.height`,
    `opening.position`, `config.studLength`, `plan.open`…; problemas de carga em `config.*` entram na família do
    campo), `lib/editor/issue-groups.ts` (`groupIssues` por kind / código / texto com ids trocados por `▢`,
    `ISSUE_TITLES` em inglês para kinds, códigos da extração e do motor, ação `projectData` / `projectSettings` /
    `openWall`, `needsProjectData`), `wall-filters.ts` (All / Needs attention / Low confidence),
    `viewport.ts` (`rectVisible`, `centerOn` sem aproximar). Shell: `components/shell-layout.tsx` (contexto de modo
    `page` / `workspace`, `useWorkspaceLayout`), `AppShell` por ele, utilitário `workspace-pane`,
    `lib/use-media-query.ts`, `ui/dropdown-menu.tsx`. Editor: `wall-editor.tsx` vira a camada de dados e renderiza
    `workspace.tsx` (estado só de interface: aba, card dispensado; remonta por projeto), `editor-top-bar.tsx`,
    `navigator.tsx` (Tabs com `forceMount`), `wall-rows.tsx`, `issue-groups-list.tsx`, `reading-panel.tsx`,
    `project-settings-dialog.tsx` (seleção `project` = dialog aberto), `issue-callout.tsx`; `PlanCanvas` ganha
    `fill`, `toolbar` e o handle `{ fit, focusWall }` (React 19 `ref` como prop); `EditorToolbar` `embedded`;
    `StepBar` `compact`; `Section` de `fields.tsx` `collapsible`/`defaultOpen`; `ProjectDataFields` `layout`
    (`full` / `compact` / `setup`) e `ProjectDataForm` `variant` (`card` / `setup`, com `onSkip`). Removidos
    `wall-list.tsx` e `issues-list.tsx`. `docs/10-design.md` §3 (Tabs, DropdownMenu, Dialog) e §4 ("Workspace do
    editor"). Conferido no browser (1024×768): 28x40 abre no workspace sem rolagem da página, "Ready · 12 panels"
    e Generate ligados no topo, clicar W01 na lista seleciona e abre o inspetor com Framing recolhida; leitura
    gravada do Ringgold sem altura abre na aba Issues com "Wall height is missing × 26" (era 26 linhas) e o card
    "Before you review" no centro; "Set heights per wall instead" mostra a planta e "Fill in project data" traz o
    card de volta; Project settings abre em dialog rolável. Testes do web: 119 (eram 104).
    Correção na mesma data (humano: campos "opcionais" sem os quais não gera; card voltava depois do Apply):
    `lib/editor/requirements.ts` (`projectDataNeeds`: altura; e, para parede portante com abertura sem header
    próprio, neve + largura, pavimentos acima e vão do piso) decide o que o card pede como obrigatório e quando
    ele aparece (só pelo draft, nunca pela mensagem do motor); `ProjectDataFields` `layout="setup"` recebe
    `required` ("Required for this project" + "Optional"), `ProjectDataForm` valida o obrigatório antes de
    aplicar; `draftIssues` ganha `config.building` e `wall.floorsSupported`, `locate` dá a mesma família às
    mensagens do motor e `dropRepeated` tira a repetição. Conferido com a leitura nova do Ringgold
    (`ringgold-st-multifamily-reading.json`, 28 paredes): card pede 5 campos; com 9'-1 1/8", 2 pavimentos,
    center bearing, 30 psf e 29' → "Ready · 41 panels", 34 avisos, sem o card voltar. Testes do web: 124.
    Ajuda e conserto rápido dos avisos (mesma data, pedido do humano): `lib/editor/issue-help.ts` (`ISSUE_HELP`
    por código/família/texto, `quickFixFor`, `readingWarningResolved`), `issue-groups-list.tsx` mostra o que
    aconteceu e como resolver, chips por abertura, campo de vento e de altura de header, botão "Add <id>" para a
    abertura sem posição (`addOpening` com `preset` no reducer); `issue-callout.tsx` mostra o "como resolver".
    Conferido no browser: "Add I9-U2-1" cria a porta U2 no centro de I9, seleciona e abre o inspetor, e o aviso
    some; vento 130 na lista tira os 19 `WIND_SPEED_MISSING`. Testes do web: 128.
- [ ] **Revisão do app (2026-10-20)** — diagnóstico completo e plano em `docs/11-revisao-app.md` (aprovado pelo
  humano). Dez itens, cada um uma sessão; a ordem em relação à S22 é decisão do humano. Nenhum toca regra de framing.
  - [x] **M1 — Tokens, contraste e semântica de cor.** Feita em 2026-10-20 na sessão da revisão. Seleção = navy-600
    (halo na planta, fundo + borda nas listas); aviso = gold-700/gold-100; ink-3 escurecido; gold-700 e ok-700 novos;
    foco único navy-600 no `:focus-visible` global (componentes do shadcn sem anel próprio; `.on-navy` no header);
    Badge em chip claro com ícone (`success`/`warning`/`destructive`); Alert com `role` por variante; Skeleton
    papel-3; Card 3px + shadow-1 em uso; Tabs `line` no resultado; Table com cabeçalho ink-2; botões pequenos pill;
    hover de outline/ghost em papel-2; `--color-line`/`gold-btn`/`ok`/`err`/`selection` no `@theme`;
    `src/app/theme.test.ts` (24 casos) mede os pares de uso real. `10-design` §2, §3, §4, §7 e §8 corrigidos com os
    valores medidos. Testes do web: 152 (eram 128). Conferido em 1440×900 (Chrome headless dirigido por CDP, porque
    o browser embutido ficou com 199 px de altura): upload, editor 28x40 com W01 selecionada (halo e alças navy,
    linha da lista com fundo/borda navy, separador da toolbar visível, chip "Ready · 12 panels" claro com ícone),
    Ringgold na aba Issues (chip "2 warnings" gold-100 ≠ seleção), passo 03 (tabs sublinhadas em gold, badges
    claros, botões pill, folha selecionada em navy). Capturas em `out/m1/` (fora do git).
  - [x] **M2 — Não perder trabalho.** Feita em 2026-10-20 na sessão seguinte à M1 (sem regra de framing). Auto-save
    da sessão em `localStorage` (`lib/editor/persist.ts`, hook `use-saved-session.ts`: debounce 500 ms, flush no
    `beforeunload`, quota → sem a leitura) e banner "Resume *nome*?" ao abrir `/app`; job de extração em voo
    gravado para avisar no reload e `beforeunload` durante a leitura; arquivo único `<slug>.panelizer.json`
    (`lib/editor/project-file.ts`: JSON do CLI + `$panelizer.reading`, que o CLI ignora) no menu ⋯, no "Advanced"
    e dentro do zip (`project.panelizer.json`, listado na aba Files); `doneSteps` (passo 2 feito com draft, 3 com
    resultado), passo 1 sempre montado e escondido por classe, resultado desatualizado com "Generate again";
    `ConfirmDialog` em "Start over" (com edições, resultado ou leitura); toast "Removed wall W03 · Undo"; Delete só
    com foco na planta, Backspace fora (`deleteAllowed`, `inEditableContext` testados). `load` aceita `dirty`.
    Testes do web: 166 (eram 152): persist (sessão, quota, lixo, job, idade), project-file (ida e volta pelo
    parser do CLI e pelo editor), atalhos, `doneSteps`. Conferido em 1440×900 (Chrome headless por CDP, roteiro
    `cdp-m2.mjs`): remover W05 pela toolbar → toast "Removed wall W05 · Undo" → Undo devolve as 5; Backspace e
    Delete com um botão da lista em foco não apagam; Delete com foco na planta apaga; sessão gravada com
    `dirty: true` e 4 paredes; reload → banner "Resume “Casa 28x40 (visão)”? Saved in this browser just now · a
    sample project · with your edits" → Resume reabre com 4 paredes; "Drawings" na barra e "Review walls" de volta
    ao editor; Generate → 15 arquivos com `project.panelizer.json` na aba Files; Back to review, remover W01,
    "Panels" pela barra → "Edited since these panels were generated" + "Generate again"; Start over → dialog,
    "Keep working" fica, confirmar limpa a sessão e volta ao passo 1. Capturas em `out/m2/`.
  - [x] **M3 — Resultado que mostra a entrega.** Feita em 2026-10-20 (sem regra de framing). Core: `housePlanSvg`
    escreve `rect.panel-hit[data-panel-id]` por painel por cima de tudo (teste novo; snapshot `house-28x40-plan.svg`
    regenerado só por isso). CLI: `BuildResult.bom` e `.cutLists` tipados ao lado dos CSVs. Web: `GenerateResult`
    ganha `bom`/`cutLists`; `plan-view.tsx` (planta clicável, destaque do selecionado), `result-materials.tsx`
    (BOM por seção com subtotais, total, sobra máxima, peso; lista de corte por painel com link para a folha),
    `result-sheets.tsx` (lista com peças/peso/avisos, anterior/próximo e ← →, Open em nova aba, Download e Print
    da folha, lupa 100/150/200 %, cascata limitada e só na primeira montagem), `result-warnings.tsx` (avisos pelos
    grupos e ajuda do editor, chip abre a folha), `result-view.tsx` com abas Plan · Sheets · Materials · Files,
    resumo em uma linha e um só "Download all"; hero só no passo 01. Testes: core 12 (+1), cli 113, web 169
    (+3: agrupamento da BOM, rótulo do estoque, avisos por painel) e o service confere BOM/cut lists da 28x40.
    Conferido em 1440×900 (Chrome headless por CDP, `cdp-m3.mjs`): passo 03 sem o hero; 12 áreas de clique na
    planta; clicar em 1-W03-P2 abre a aba Sheets nessa folha; → vai a 1-W03-P3; lupa abre com 100/150/200 %;
    Materials: 234 peças a comprar, 2 019 ft, 15,5 % de sobra no máximo, 3 294 lb, BOM por seção com subtotais;
    voltar à planta mostra o painel selecionado destacado; Ringgold: "2 warnings to review" agrupados ("Fewer
    jack studs than the IRC table × 2") com o chip 1-S2-P1 abrindo a folha. Capturas em `out/m3/`.
  - [x] **M4 — Motion no editor.** Feita em 2026-10-21 (sem regra de framing). `lib/motion.ts` (`cubicBezier`,
    `easeSite`, `prefersReducedMotion`, 250 ms) e `lerpViewport` em `viewport.ts`, testados; `PlanCanvas`: Fit e
    `focusWall` animados por rAF (cancelados por ponteiro/roda), halo de seleção sempre presente com transição de
    opacidade, `wall-body`/`opening-jamb` com transição de traço, `data-severity` e hover por CSS, alças com
    `handle-pop`; `Inspector` com fade por seleção; `CommitInput` com `commit-flash`; `StatusChip` com `pop` por
    estado; workspace e card de setup com `step-enter`; `lift` nos cards de exemplo e prévia; regra global de
    `prefers-reduced-motion` em `globals.css` + `motion-reduce:` em botão e zona de soltar + `scrollTo` sem
    `smooth`. Testes do web: 173 (eram 169); o smoke do canvas passou a conferir `data-severity`. `10-design` §2
    atualizado. Conferido em 1440×900 (Chrome headless por CDP, `cdp-m4.mjs`): halos a 0 nas 5 paredes e 0,22
    na selecionada; transição inline no `wall-body`; alças com `handle-pop`; inspetor dentro de `.animate-fade-in`;
    chip "Ready" com `animate-pop`; hover em W03 dá traço `rgb(42, 83, 144)` a 1,75 px; Fit depois de 6 cliques
    de roda passa por 17 larguras distintas em ~38 quadros (de 1 937 px a 658 px); altura 9'-0" confirmada com
    Enter põe `commit-flash` no campo, que some em 1 s; com `prefers-reduced-motion` emulado, `step-enter` dura
    1e-5 s e o Fit vai direto (2 larguras distintas). Captura em `out/m4/`.
  - [x] **M5 — Facilidade de uso no editor.** Feita em 2026-10-21 (sem regra de framing). Libs testadas:
    `lib/editor/labels.ts` (glossário), `elevation.ts` (elevação esquemática), `viewport.ts` (`scaleBar`,
    `gridStep`), `wall-filters.ts` (`notReviewed`, pavimento), `state.ts` (`moveWall`, `setReviewed`,
    `isReviewed`), `use-editor-shortcuts` (`neighborWall`, N/O/]/[/?), `drop-zone` (`mergeFiles`), `lib/platform.ts`.
    UI: `PlanCanvas` reescrito (zoom −/%/+/Fit, barra de escala, grade, legenda, erro da casa visível, cota no
    cursor, pinch, teclado com canvas focável, pavimento compartilhado), `ui/tooltip.tsx`, toolbar com tooltips e
    só ícones no celular, `shortcuts-dialog.tsx`, inspetor com anterior/próxima e botão "Reviewed", lista com
    filtro "Not reviewed" e check, top bar em duas linhas com "N of M reviewed", `wall-elevation.tsx` no projeto
    solto, settings sem campos duplicados (`ProjectDataFields fields`), `useMediaQuery` sem flash, passo 01 com
    erro inline, recusas explicadas, total, "or try a sample", dev tools só em dev (`page.tsx`), `pdf-pages.tsx`
    (miniaturas por pdf.js). `pdfjs-dist` entrou no web. Testes do web: 184 (eram 173). Conferido em 1440×900 e
    375 px por CDP (`cdp-m5.mjs`, PDF real do Ringgold via `DOM.setFileInputFiles`): enviar sem arquivo mostra
    "Add at least one PDF or image." embaixo da zona; o PDF de 2 páginas vira 2 miniaturas e clicar na 2ª põe
    "2" no campo; 28x40: controles de zoom, `pattern#plan-grid`, barra de escala "4'-0"", legenda com 5 itens,
    + leva a 125 %; W01 selecionada + 2× → com o canvas em foco move start x de 0" a 2"; ] vai a W02; ? abre a
    lista de atalhos; "Reviewed" marca W02 e a top bar diz "1 of 5 reviewed", a lista ganha "Not reviewed 4";
    settings com um só "Ground snow load (psf)"; Ringgold S2 mostra "Elevation of S2" com 2 RO; em 375 px a top
    bar tem 83 px (duas linhas) e os rótulos da toolbar somem. Capturas em `out/m5/`.
  - [x] **M6 — Planta do arquiteto por baixo.** Feita em 2026-10-21 (sem regra de framing). `lib/editor/underlay.ts`
    (tipo, `underlayOf`/`withoutUnderlay`, `imageToPlan`/`planToImage`, `initialTransform`, `scaleFromPoints`,
    `withScale`, `withPixelAt`, `rotated`, `svgMatrix`; 7 testes), reducer `setUnderlay` (undoável) e
    `setUnderlayView` (sem histórico), `lib/pdf-render.ts` (pdf.js e imagens no cliente), `underlay-dialog.tsx`
    (arquivos do passo 01 ou do disco, página em miniatura, render a 2 400 px), `underlay-controls.tsx` (menu
    "Drawing": opacidade, mostrar/ocultar, escala por dois pontos, origem, girar, trocar, remover; faixa de
    instrução sobre a planta), `PlanCanvas` com `<image>` atrás da grade e modo de calibração (clique = ponto,
    Esc cancela, cursor em cruz), `use-project-check` com `engineText` (sem o underlay) e sem chamada quando o
    texto não mudou. Testes do web: 192 (eram 184). Conferido em 1440×900 por CDP (`cdp-m6.mjs`, PDF do
    Ringgold pela entrada de arquivo do dialog): página 1 vira `<image data-underlay>` de 2 400 × 1 553 px
    (400 KB) do tamanho da casa; "Set scale" mostra a faixa, dois cliques a 200 px e "10'-0"" mudam a escala na
    razão 0,8132, igual à esperada pela geometria da tela; "Set origin" move a origem; opacidade 70 % no
    atributo; girar 90° gravado; "Hide" tira a imagem e grava `visible: false`; reload → Resume → "Show" traz a
    imagem de volta (sessão de 538 KB). Capturas em `out/m6/`.
  - [x] **M7 — Extração honesta.** Feita em 2026-10-21 (sem regra de framing). `extract`: `previewExtraction`,
    `ExtractOptions.signal`/`onProgress`, `apiErrorInfo().aborted`, `prepareSources` fatorado de `buildRequest`.
    Web: `lib/extract-cost.ts` (estimativa calibrada nas leituras reais; 3 testes), `services/extract-jobs.ts`
    (registro de jobs; 3 testes), `extract.service` com `preview`, `pagesByFile`, `jobId` e `cancelled` (3
    testes), actions `previewExtraction`, `extractionProgress`, `cancelExtraction`, `extractionResult`
    (`readUploadForm` compartilhado), `send-preview.tsx`, `UploadForm` com prévia debounced, páginas por arquivo
    e `jobId`, `PdfPages` com "sends", `ExtractProgress` com fase, tokens, cancelar e retomada, `NewProjectView`
    e `use-saved-session` retomando o job da sessão. Testes: extract 115, web 201 (eram 192). Sem chave de API
    nesta máquina, a chamada real, o cancelamento ao vivo e a retomada após F5 ficaram cobertos só pelos testes
    com `extract` falso; a prévia (que não precisa de chave) foi conferida no browser (1440×900 por CDP,
    `cdp-m7.mjs`, PDF do Ringgold): "What will be sent · 2 pages · 1.4 MB encoded · p.1 A-100 Basement and 1st
    Floor Plans · p.2 A-800 Wall Types, Schedules and Window Details · about US$ 1.54 (US$ 1.08–2.00)", botão
    "Extract walls with AI · about US$ 1.54", as duas miniaturas com "sends"; marcar só a p.2 refaz a prévia
    para 1 página / 570 KB / US$ 1.51 e o campo fica "2". Capturas em `out/m7/`. Fica para quando houver
    crédito: uma leitura real com cancelamento e com F5 no meio.
  - [x] **M8 — Desempenho da checagem.** Feita em 2026-10-21 (sem regra de framing). Medição primeiro
    (`lib/editor/perf.test.ts`: casa sintética de 27 paredes; o cliente gasta ~1 ms por edição, então a
    memoização por parede do plano não foi feita). `cli/build.ts`: `panelizeProject` (painéis + problemas +
    nome repetido + BOM) fatorado de `buildProject`; `panels.service.check` usa só ele — `services/panels.perf.test.ts`
    mede 53 painéis: generate 30 ms, check 12 ms, com painéis e avisos idênticos. Abortar pedido em voo não é
    possível com server actions; fica o descarte de resposta velha e o "texto igual não vai" da M6. Testes: cli 113,
    web 206 (eram 201). Achado para a fábrica (não mexido, é framing): T dos dois lados no mesmo ponto de uma
    parede (cruzamento em +) é recusado pelo motor ("layoutPlates: cuts sobrepõe"); ver 04-decisoes.
  - [x] **M9 — PDF e impressão.** Feita em 2026-10-21 (sem regra de framing). `services/pdf.service.ts`:
    cada SVG vira PNG por `@resvg/resvg-js` (largura 220 dpi do miolo, fontes do sistema) e entra numa página
    carta paisagem do `pdf-lib`, centrado, com rodapé "projeto · folha" à esquerda e "x de y" à direita; título
    do documento "<projeto> — fabrication sheets". Action `downloadPdf` (schema em `schemas/pdf.ts`; a tela
    manda os SVGs que já tem, o motor não roda de novo) devolve base64 e o cliente baixa. Botões: **Download
    PDF** ao lado de "Print all sheets" (planta primeiro + todas as folhas → `<slug>-sheets.pdf`, "Rendering N
    pages…" enquanto renderiza) e **PDF** por folha na aba Sheets (`<id>.pdf`); `window.print()` continua.
    Conferido no browser com a 28x40: 13 páginas 792×612 pt, 1,3 MB; folha avulsa 90 KB. Testes: web 209
    (eram 206); `@resvg/resvg-js` em `serverExternalPackages`.
  - [x] **M10 — Testes de interação.** Feita em 2026-10-21 (sem regra de framing). `jsdom` + `@testing-library/react`
    + `user-event` no vitest do web, ligados por arquivo (`// @vitest-environment jsdom` nos `*.dom.test.tsx`; os
    testes puros continuam em node). Sete arquivos, 25 testes: `CommitInput` (Enter + blur = um commit, blur
    formata, Esc reverte, erro inline mantém o foco, valor de fora só sem foco), atalhos como teclas de verdade
    (Delete com botão em foco não apaga, input desliga tudo, Ctrl+Z/Y, Esc, N, O, ] [, ?, desmontar), `useProjectCheck`
    com a action mockada (debounce, resposta velha descartada, texto igual não vai, erro), `PlanCanvas` por pointer
    events (clique seleciona, alça move a ponta no eixo com snap 1" e 1/8" com Shift, um dispatch por quadro, mesma
    transação, pan não seleciona, cancel não fecha), `useSavedSession` com o `localStorage` do jsdom (grava em 500 ms,
    retomada, discard, reset, beforeunload, job perdido), `ResultSheets` (Next/Previous, ← →, lista, Show all, PDF)
    e `StepBar` (só passo concluído e não ativo leva a algum lugar). **Dois bugs pegos e corrigidos**: Esc no campo
    confirmava o texto digitado (o blur que o Esc provoca via o texto velho; flag `reverting`) e "Reviewed" reenviava
    o projeto ao motor (`$reviewed` ficava no texto; `engineText` agora tira toda chave `$…`, `withoutEditorKeys`).
    Conferido no browser: Esc volta ao valor e não cria undo; Reviewed sem POST. Testes: web 234 (eram 209).
    Playwright fica para depois da S22.
- [ ] **S22 — Supabase: auth + tabela `projects` (jsonb) + storage** — abordagem aprovada em 2026-10-22, em
  quatro subsessões (nenhuma toca regra de framing). Setup do projeto no Supabase em `supabase/README.md`.
  - [x] **S22.0 — Esquema, auth e login.** Feita em 2026-10-22. `@supabase/supabase-js` + `@supabase/ssr` no
    web (sessão em cookie; ky não serve: teria de reimplementar o refresh do token). `supabase/migrations/
    20261022000000_projects.sql`: tabela `projects` (`id`, `owner_id`/`owner_email`, `name`, `data jsonb` = o
    `.panelizer.json` inteiro, `revision` para concorrência otimista, datas com trigger) e RLS de time (todo
    usuário autenticado lê, cria como autor, edita e apaga). `types/database.ts` à mão. `lib/supabase/env.ts`
    (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, aceita o nome antigo `ANON_KEY`),
    `lib/supabase/server.ts` (um cliente por requisição; `setAll` engole o erro em Server Component),
    `lib/auth/routes.ts` (`routeFor`, `safeNext`, puros), `src/proxy.ts` (renova o token, aplica `routeFor`,
    copia os cookies para o redirect; matcher sem estáticos), `services/auth.service.ts` (`currentUser`,
    `requireUser`, `signIn` com mapa de códigos — credencial errada, e-mail não confirmado, limite de
    tentativas, rede fora por status 0 —, `signOut`; `deps` injetáveis), `authActionClient` em `safe-action.ts`
    (todas as actions de `/app` passaram a usá-lo; `signIn`/`signOut` usam o cru), `/login` (Server Component:
    sem chaves explica, logado redireciona, senão `LoginForm` com RHF + zod, erro no card, foco na senha,
    sucesso `router.push(next)` + `refresh`), `SignOutButton` no header com o e-mail. **Sem as chaves**: aberto
    em desenvolvimento; em produção `/app` → `/login` (que explica). Sem cadastro no app. Testes: web 249
    (eram 234): env, rotas, auth.service com cliente falso, LoginForm no jsdom. Conferido no browser sem chaves
    (`/login` explica, `/app` aberto sem "Sign out") e com uma URL inalcançável (`/app/projects/x?tab=1` →
    `/login?next=%2Fapp%2Fprojects%2Fx%3Ftab%3D1`; enviar o formulário mostra "Could not reach the sign-in
    service"). **Login real conferido em 2026-10-23** com o projeto criado: entrar leva a `/app` com e-mail e "Sign out" no header, F5 mantém a sessão (refresh pelo proxy), `/login?next=/app?from=test` logado volta a `/app?from=test`, "Sign out" leva ao login e `/app` volta a redirecionar; sem erro no console nem no servidor. Projeto
    `panelizer` criado em 2026-10-22 pelo conector MCP (ref em `supabase/README.md`), migração aplicada, chaves no `.env.local`, cadastro desligado e uma conta criada no painel.
  - [x] **Header do app (pedido do humano, 2026-10-23)** — sem regra de framing. O header de uma linha (nome + link)
    virou `components/site-header.tsx`: logo oficial da National Lumber (`public/brand/national-lumber.png`) num tile
    de papel, superfície navy com gradiente, brilho dourado e grade (`header-surface`), fio dourado na base, fixo no
    topo encolhendo de 72 para 64px ao rolar; navegação em grupo de pills com ativo pela rota (`usePathname`) e ponto
    dourado; avatar de iniciais com ponto de sessão e menu (e-mail, Sign out) no lugar do botão solto; em `/login`
    só a marca e uma linha de contexto — o "New project" não aparece mais para quem não entrou. Regras puras em
    `lib/site-nav.ts` (`isActivePath`, `isBareRoute`, `initialsOf`). Testes: 3 puros + 3 no jsdom (rota ativa,
    login sem nav, menu que sai e vai ao login; Radix precisa de `hasPointerCapture` falso). `10-design` §4
    reescrito. Conferido no browser em /login e logado em /app.
  - [x] **Tela de login (pedido do humano, 2026-10-23)** — sem regra de framing. Treze versões num canvas de design
    (seis direções, quatro variações da V1, três da V1B); o humano escolheu a V1B: palco navy em tela cheia com a
    parede de 18' que se monta em cascata, recebe a linha tracejada da quebra na marca de 12' e se separa em dois
    painéis com id, em loop de 10 s, e o card de vidro com o formulário por cima. Modo `stage` no shell
    (`useShellMode`), geometria pura em `lib/login-sketch.ts` (3 testes), `WallSplitSketch` só SVG + CSS
    (`login-*` em globals.css, parada e inteira com `prefers-reduced-motion`), `LoginForm` com `tone="dark"` e
    sem card próprio. `10-design` §4 e §5. Conferido no browser a 1440×900 (parede, quebra, ids, card à direita,
    sem rolagem) e a 375×812 (parede acima do card, sem rolagem horizontal).
  - [x] **Leitura da IA na Vercel (2026-10-23)** — bug de deploy, sem regra de framing: o `pdf.worker.mjs` não ia
    no bundle (import dinâmico do pdf.js invisível ao rastreio); import estático em `extract/src/pdf.ts` com
    `globalThis.pdfjsWorker`, conferido no `.nft.json` do build. `describeServerError` mostra a causa na UI;
    `maxDuration = 300` na rota `/app`. Limites que ficam (4,5 MB de corpo, 300/800 s, jobs em memória) em
    04-decisoes. Testes: extract 115, web +2.
  - [x] **404, Suspense e esqueletos (pedido do humano, 2026-10-23)** — sem regra de framing. `app/not-found.tsx`
    (parede com o vão sem header, links ao app e ao login); usuário do header atrás de `Suspense`
    (`components/header-user.tsx`: o layout não espera mais o Supabase; `SiteHeader` recebe `userSlot`);
    `app/app/loading.tsx` e `app/login/loading.tsx` com `Skeleton` na grade das telas reais (o do login em modo
    `stage`, `login-skeleton.tsx`). Onde não usar, em `10-design` §4. Testes: web 262 (+2: 404 e esqueleto por
    SSR; header pelo slot). Conferido: `/nao-existe` responde 404 com a página; o esqueleto do login vai no HTML
    inicial e some quando a página chega; o palco e o header claro seguem iguais. `app/error.tsx` (cliente: mensagem, digest, "Try again" com o reset do Next; 2 testes no jsdom) — conferido só por teste: não há rota que lance de propósito.
  - [x] **Página inicial (passo 01) refeita (pedido do humano, 2026-10-23)** — sem regra de framing. Canvas com três
    direções (A zona-herói, B palco com a planta lida, C mesa de luz); escolhida A com a animação da B. Trilho de
    passos (`StepBar rail`), título em display, zona-herói com `PlanReadSketch` (`lib/plan-sketch.ts`, 4 testes),
    `DropZone variant="hero"`, miniaturas das páginas removidas (`pdf-pages.tsx` apagado; páginas só por número ou carimbo), detalhes compactos empilhados, "What will be sent"
    removido, botão grande, `SampleCards` sempre visíveis com a leitura real do Ringgold em primeiro
    (`src/samples`, pela action `finishResponse`; fatos do arquivo), `PreviewCard` e `illustrationPlan` fora da
    página. Ajustes do humano no primeiro corte: PDF de 20 páginas esticava o palco; campos do estrutural
    apertados em duas colunas; prévia redundante; botão pequeno e zona grande demais; samples invisíveis.
    `10-design` §4 reescrito.
  - [ ] **S22.1 — Projeto com id e auto-save no servidor.** `projects.service` (criar, carregar, gravar com
    `revision`; `deps` com cliente falso nos testes); o projeto ganha id na primeira abertura e a URL vira
    `/app/projects/[id]`; cada edição grava com o debounce de hoje e a top bar diz "Saved · just now";
    `revision` divergente → aviso "edited elsewhere" em vez de sobrescrever; `localStorage` fica como buffer de
    queda e para o job de extração. Passo 03 em `/app/projects/[id]/panels`.
  - [ ] **S22.2 — Lista de projetos.** `/app/projects` (nome, paredes, atualizado, autor), abrir, renomear,
    duplicar, apagar com confirmação; "Projects" no header.
  - [ ] **S22.3 — Desenhos no Storage.** Bucket `drawings` por projeto (PDFs do passo 01, subidos pela action
    de 300 MB); o underlay e releituras leem de lá. Painéis gerados não são guardados (reproduzíveis).
