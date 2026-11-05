# 15 — Fase 8: o que revisar antes do push

A Fase 8 (pedidos da fábrica de 2026-10-28, `docs/14-prancha-fabrica.md`) foi feita em 2026-11-05 em seis sessões
encadeadas (S35–S40), **por delegação**: o humano dispensou a confirmação de abordagem e de fixtures e revisa depois.
Cada sessão commitou na `main` **sem push** (push na `main` publica no Cloud Run). Esta é a lista única do que olhar
antes de publicar. Detalhe de cada item no resumo da sessão em `03-sessoes.md` e nas linhas de 2026-11-05 de
`04-decisoes.md` (citadas abaixo pelo começo do texto).

Commits: S35 `63c0b30` · S36 `b2bc776` · S37 `0f06417` · S38 `5fa2551` · S39 `1a75b6f` · S40 (o commit desta lista).

## 1. Ler primeiro (decisões com mais chance de estarem erradas)

1. **Canto da chapa (S38)** — a P47 dizia que a chapa da parede que **atravessa** avança no canto; o código faz o
   contrário: avança a parede que **encosta** (`+t` da outra), porque a plate da que atravessa já chega à face externa
   da outra. Linha "S38: **no canto em L quem avança a chapa é a parede que ENCOSTA**". Confirmar com a fábrica (P47).
2. **Sobra de chapa e BOM (S38, P52)** — parede de 97 1/8" com 4x8 gera uma **tira de 1 1/8"** no topo, e a BOM conta
   **uma chapa inteira por pedaço** (a tira conta uma chapa): no `wall-144-sheathed` são 6 chapas para 3 de área. Com
   4x9 descendo 10 7/8" sobre a rim (`floorBottom`) não há tira. Decidir o default.
3. **Interna não leva chapa por padrão (S38)** — `config.sheathing` sozinho liga só as paredes externas
   (`walls: 'exterior'`). Linha "S38 (aprovada por delegação, revisar): **sheathing = camada por painel…**".
4. **Alturas dos presets de blocking (S36, P44)** — 36/54/84 (cozinha) e 15/39/42/48/79 (banheiro), medidas ao
   **centro** do bloco a partir do **subfloor** (a prancha fala em A.F.F., do piso acabado). Linha "S36: **presets
   embutidos, um valor por uso**".
5. **Post (S37, P45)** — vai da bottom à top plate (como o stud), ocupa o lugar dos studs de layout; 4x4 em parede 2x6
   e 6x6 em 2x4 são **erro** (o motor não põe calço). Linha "S37: **orientação pela profundidade da parede**".
6. **Folha mais alta (S39, P53)** — o bloco "Wall content" empurra o desenho 78–111 px para baixo; na carta paisagem a
   folha sai ~10–20% menor. Os 10 snapshots foram regenerados nessa sessão (única autorizada).
7. **Rótulo da parede na planta (S40)** — passou a desviar dos selos L/T/+ quando cairia em cima deles (antes ficava
   sempre no meio). Nenhum snapshot mudou; só plantas com T/+ perto do meio da parede mudam.

## 2. Decisões "aprovada por delegação" (uma por sessão; as demais linhas da sessão a detalham)

| Sessão | Linha de `04-decisoes.md` (2026-11-05) | Em uma frase |
|---|---|---|
| S35 | "S35 (aprovada por delegação, revisar): **wall type = catálogo do projeto que completa a parede…**" | `config.wallTypes[tag]` dá seção/posição/carga à parede que não diz; a parede manda, com aviso `WALL_TYPE_MISMATCH`; tag fora do catálogo é rótulo. |
| S36 | "S36 (aprovada por delegação, revisar): **blocking por altura = lista na parede…**" | `wall.blocking` com fileiras ou presets; bloco deitado com o centro na cota; vão em abertura/ladder é pulado com `BLOCKING_SKIPPED`. |
| S37 | "S37 (aprovada por delegação, revisar): **post = peça maciça do projeto no lugar dos studs de layout**" | `wall.posts` 4x4/4x6/6x6; conectores são texto na folha, fora da lista de corte. |
| S38 | "S38 (aprovada por delegação, revisar): **sheathing = camada por painel…**" | chapas de pé da marca 0, cortadas no painel; avanço no canto pela que encosta; emenda horizontal gera blocking; peso 1.4 lb/pé². |
| S39 | "S39 (aprovada por delegação, revisar): **as ligações chegam ao painel sem mudar peça**" | `Panel.ends`/`tees`; bloco "Wall content" na folha; selos L/T/+ e legenda na planta; pregação 3× 3" @ 12" OC. |
| S40 | "S40 (aprovada por delegação, revisar): **fechamento da fase…**" | campos que faltavam no editor (preços, pregação das ligações, sheathing do tipo); exemplo `phase8-sample`; rótulo da planta desviando dos selos. |

## 3. Fixtures novos (nenhum fixture antigo mudou)

Todos com `$comment` "not confirmed by the human — review"; o teste de cada um exige os members do fixture original.

| Fixture | Sessão | O que afirma |
|---|---|---|
| `house-walltypes` | S35 | o `house-corner-L` com W1 só com a tag `WT-1S` e W2 com tipo parcial `X1` + `bearing` próprio → os mesmos painéis do original, só com a tag. |
| `wall-144-kitchen` | S36 | o `wall-144-window` + `kitchen-base`, `kitchen-upper-top` e `{ y: 54, from: 96, to: 144 }` → 17 blocos, 35 peças, 2 avisos `BLOCKING_SKIPPED` na zona da janela. |
| `wall-144-post` | S37 | o `wall-144-plain` com P-01 4x6 em x = 46.5 e P-02 6x6 em x = 94 → tiram os studs de 47.25 e 95.25; 13 peças, 288.4 lb. |
| `wall-144-sheathed` | S38 | o `wall-144-plain` com sheathing default → 6 pedaços (3 tiras de 1 1/8"), 97.13 pés², 136.0 lb de chapa, painel 362.4 lb. |
| `house-corner-L-sheathed` | S38 | o `house-corner-L` com 4x9 descendo 10 7/8" → W2 (encosta) começa a chapa em −5.5 (a quina), emenda em 42.5 no centro do stud; 411.8 e 327.4 lb. |

Exemplo novo do CLI e do app (S40, não é fixture): `packages/cli/examples/phase8-sample.json` — a casa 28x40 com
wall types, blocking de cozinha e banheiro, um post 4x6, sheathing nas externas, um T e um + e tabela de preços (7
paredes, 15 painéis, sem aviso, custo US$ 2.154,90 sem as chapas).

## 4. Hipóteses novas ou revistas (`05-pendencias.md`; lista para a fábrica em `08-revisar.md`)

- **P8** (revista, S38) — peso com chapa: 3.2 lb/pé² por polegada (1.4 para 7/16"). OSB ou plywood?
- **P44** (S36) — alturas e forma do blocking (ver item 1.4).
- **P45** (S37) — post: seções, peso a 35 pcf, conectores como texto; post atravessa a top plate até a viga?
- **P46** (S31, sem mudança na fase) — o + usa uma faixa só; a fábrica não respondeu.
- **P47** (revista, S38) — avanço da chapa no canto pela que **encosta** (ver item 1.1); linha de piso só por projeto.
- **P48** (S38, S39) — pregação: 8d @ 6"/12" na chapa; 3× 3" nails or screws @ 12" OC nas ligações; só texto.
- **P49** (S38, S39) — junta de painéis da mesma parede: stud duplo, chapa acaba no painel, lap só na double top.
- **P50** (S31) — fire blocking: altura e forma (sem mudança na fase).
- **P52** (nova, S38) — sobra de altura da chapa e contagem na BOM (ver item 1.2).
- **P53** (nova, S39) — formato do bloco "Wall content" e dos selos da planta ("+" ou "X"?).

## 5. Defeitos achados na conferência da S40

Consertados (com teste):
- Planta: o rótulo da parede (`W03 · WT-1S`) caía em cima do selo T/+ quando o encontro ficava perto do meio da parede
  — agora desvia para o ponto livre mais perto do meio (`planSvg.ts`, `wallLabelSpot`; snapshots iguais).
- Materials: seção sem nenhum preço mostrava subtotal "$0.00"; agora "—".
- Editor: rótulos da tabela de preços desalinhados (select mais alto que o campo).

Não consertados (pequenos, anteriores à fase ou fora do escopo):
- Planta: o rótulo da parede ainda pode tocar o traço de junta de painéis (`W07 · WT-2` no `phase8-sample`) e o rótulo
  de abertura; só os selos de encontro são desviados.
- Folha: no fim da parede, a marca de layout e o fechamento ficam a ~2" um do outro e os textos `208"`/`210"` se
  sobrepõem na fileira das marcas (`1-W06-P1` do `phase8-sample`); a cadeia de centros já tem segunda fileira, a das
  marcas não. Corrigir muda snapshots — fica para quando a folha for revista.
- Editor (planta): o rótulo `W04`/`W05` fica parcialmente sob a parede W07 que cruza no meio (desenho do editor, não da
  saída).
- Preço de chapa: o orçamento não tem preço para sheathing (`PriceEntry` só tem seção de madeira); a aba Materials diz
  "Not in the cost total". Precisa de entrada nova em `config.prices` e no `costOf`.
- Campos sem editor no app (preservados no arquivo): `config.blockingPresets` (presets do projeto) e
  `wallTypes[tag].blocking` (blocking do tipo). O sheathing do tipo ganhou campo na S40 (liga/desliga; spec só pelo JSON).

## 6. O que não foi verificado em lugar nenhum

- **Supabase**: todas as conferências da fase rodaram sem Supabase (dev na 3001/3100 com as chaves vazias). Gravar,
  reabrir e listar projetos com os campos novos (`wallTypes`, `blocking`, `posts`, `sheathing`, `nailing`, `prices`)
  não foi testado contra o banco; `pnpm test:integration` e os testes e2e de login/lista foram pulados (sem
  `TEST_SUPABASE_*`). O `data jsonb` aceita qualquer chave, mas vale abrir um projeto salvo antes do push.
- **Leitura real por IA**: a API da Anthropic não foi chamada na fase. O prompt e o schema da leitura não mudaram; a
  S35 passou a montar `config.wallTypes` da resposta (testado com a resposta gravada do Ringgold).
- **CI do GitHub e deploy**: nada foi enviado. O job `e2e` do CI usa Supabase local; não rodou.
- **PDF em produção**: o `pnpm e2e` gerou e baixou o PDF localmente (Windows, fontes do sistema). O `Dockerfile` final
  (`node:22-bookworm-slim`) não instala fontes e o PDF rasteriza com resvg `loadSystemFonts: true` — conferir um PDF
  gerado no Cloud Run (texto e o ▲ do bloco "Wall content") antes de liberar para a fábrica.
- Os selects do app (Radix) não são dirigíveis no jsdom: os testes de DOM conferem o que eles mostram; a escolha é
  testada nas funções de `lib/editor`. No app de verdade (S40) foram vistos, não clicados um a um.

## 7. Capturas da conferência (`out/s40/`, fora do git)

| Arquivo | O que mostra |
|---|---|
| `01-start.png` | passo 01 sem Supabase e sem IA, com o cartão "Phase 8 sample" |
| `02-editor.png` | o exemplo aberto no editor: 7 paredes com tipo, "Ready · 15 panels", 0 issues |
| `03-settings-0.png` … `03-settings-5.png` | Project settings rolando: Framing (Fire blocking above, pregação das ligações), Sheathing, Wall types (com Sheathing), Prices |
| `07-W01-0.png`, `07-W01-1.png`, `07-W01-framing.png` | inspetor da W01: Wall type `WT-1S`, Posts (P-01 4x6), Framing com Sheathing "From project (sheathed)" |
| `08-W06-1.png` | inspetor da W06: Blocking com `kitchen-base` e `kitchen-upper-top` |
| `09-panels.png` | passo 03 depois de Generate: 15 painéis, 338 peças, sem avisos |
| `10-plan.png` / `11-plan-fixed.png` | a planta antes e depois do conserto do rótulo (selos L/T/+, traço de quem atravessa, legenda com os tipos) |
| `12-1-W01-P1.png` | folha com bloco "Wall content", post P-01 e contorno das chapas descendo sobre a rim |
| `12-1-W05-P1.png` | folha da W05: porta, + com W06/W07 (ladder), laps da double top |
| `12-1-W06-P1.png`, `12-1-W07-P1.png` | folhas com blocking de cozinha e de banheiro (+ "Grab bar" no trecho) |
| `12-1-W02-P1.png`, `12-1-W04-P1.png` | folhas das externas com canto, T e chapa |
| `13-materials.png` | aba Materials: BOM com preço, subtotal, tabela Sheathing (38 chapas 4x9) |
| `14-sheets.png` | aba Sheets do app com a mesma folha |
| `e2e2.log` | saída do `pnpm e2e` que passou (5 passed, 5 skipped) |
