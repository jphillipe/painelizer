# 10 — Design do app e da landing

Fonte única de verdade do visual e da arquitetura de interface do Panelizer (`packages/web`). Vale para o
app (S20–S22) e para a landing page futura. Mudou aqui, muda no código; mudou no código sem passar por
aqui, está errado.

Escrito em 2026-10-14 a partir do site da National Lumber (https://national-lumber-online.web.app/): os
tokens abaixo são as variáveis CSS do site, lidas do DOM, não estimativas. Decisões do humano: Tailwind CSS +
shadcn/ui; formulários com zod + react-hook-form; mutações por server actions com next-safe-action; ky como
cliente HTTP; camada de services; interface em inglês.

## 1. Marca e tom

- Produto: **Panelizer**, ferramenta da National Lumber (WR Group) para transformar a planta do arquiteto em
  folhas de fabricação de painéis de parede. Assinatura no header: "Panelizer · National Lumber".
- Copy em inglês, frases curtas, mesmo registro do site: "From your drawings to a reviewed proposal."
  Verbos no imperativo nos botões ("Generate panels", "Extract walls with AI", "Download all"). Sem
  exclamação, sem jargão de IA na interface ("AI" aparece só no botão da extração).
- Português só nas folhas de fabricação e nos docs. A decisão de traduzir as folhas é separada (fábrica).
- Confiança é tema do produto: tudo que veio de IA mostra confiança e evidência; tudo que veio do motor é
  determinístico e aparece sem rodeio. Nunca esconder um problema atrás de um sucesso genérico.

## 2. Tokens

### Cores (do site)

| Nome | Valor | Uso |
|---|---|---|
| navy-600 | `#2A5390` | hover de links em fundo papel |
| navy-700 | `#1E4173` | hover de botão primário |
| navy-800 | `#16325A` | bordas fortes, header em hover |
| **navy-900** | `#102441` | **primário**: header, botão primário, títulos em fundo papel |
| navy-950 | `#0A1428` | fundo de seções escuras na landing |
| gold-100 | `#F1E4C8` | fundo de destaque suave |
| gold-300 | `#D9B36A` | anel de foco, texto dourado em fundo navy |
| **gold** | `#BA8B37` | **acento**: eyebrows, ícones, linhas de destaque |
| gold-btn | `#C8A15B` | fundo do botão de acento (pill) |
| gold-600 | `#A2782B` | ícones dourados, traços; **nunca texto abaixo de 18px** (3,6:1 sobre papel) |
| gold-700 | `#82601F` | texto dourado pequeno: eyebrow (13px), aviso, "· required" (5,2:1 sobre papel; 4,6 sobre gold-100). Token nosso, não do site (M1, 2026-10-20) |
| **paper** | `#F6F4EE` | **fundo de página** |
| paper-2 | `#EFEBE1` | fundo secundário, cards em fundo papel |
| paper-3 | `#E7E1D3` | muted, separadores grossos, Skeleton |
| white | `#FCFBF7` | cards sobre papel quando precisam contrastar |
| **ink** | `#152238` | **texto** |
| ink-2 | `#43506A` | texto secundário; cabeçalho de tabela; qualquer texto informativo ≤ 13px em card |
| ink-3 | `#56637B` | texto terciário, hints, placeholders, estados vazios — **mínimo 12px**. Era `#6B7890` do site (4,05:1 sobre papel, 3,74 sobre paper-2: reprova); o nosso dá 5,1 sobre paper-2 e 4,65 sobre paper-3 |
| muted | `#505D6C` | legendas |
| line | `rgba(16,36,65,.16)` | bordas (exposta como `--color-line`: `border-line`, `bg-line`) |
| line-faint | `rgba(16,36,65,.07)` | divisórias finas |
| line-strong | `rgba(16,36,65,.34)` | bordas de input em foco (o anel de foco global vem por cima) |
| ok | `#2E7D4F` | sucesso: fundo cheio, ícone, ponto |
| ok-700 | `#2A7148` | texto verde sobre fundo claro (chip `success`: 5,0:1 sobre ok/10) |
| err | `#B3402A` | erro, destrutivo (4,8:1 sobre err/10; 5,2 com texto papel) |
| warn | `#82601F` (gold-700) | aviso: dourado escuro, não amarelo genérico; fundo de aviso = gold-100 |
| **selection** | `#2A5390` (navy-600) | **seleção** na planta e nas listas (halo a 22 %, fundo a 8 %, borda esquerda). Nunca dourado: dourado é aviso e ação principal |
| ring | navy-600 | anel de foco (7,0:1 sobre papel; gold-300 dava 1,8:1). Sobre navy, `.on-navy` troca para gold-300 |

Fundo de página é sempre papel; branco puro não existe (`text-white`/`bg-black` são proibidos; o overlay do Dialog
é navy-950/50). Modo escuro: **não nesta fase** (sem `.dark`). **Um matiz, um significado:** dourado = ação
principal (gold-btn) e aviso (gold-700/gold-100); navy-600 = seleção e foco; err = problema; ok = pronto.

### Mapeamento para o tema do shadcn (`globals.css`, `:root`)

```
--background  paper        --foreground  ink
--card        white        --card-foreground ink
--popover     white        --popover-foreground ink
--primary     navy-900     --primary-foreground paper
--secondary   paper-2      --secondary-foreground navy-900
--accent      gold-btn     --accent-foreground navy-900
--muted       paper-3      --muted-foreground muted
--destructive err          (foreground paper)
--success     ok           (token extra, Badge/Alert "success"; texto em ok-700)
--warning     gold-700     (token extra, Badge/Alert "warning"; fundo gold-100)
--selection   navy-600     (token extra: planta, listas)
--border      line         --input line         --ring navy-600
--radius      3px
```
Tailwind v4: tudo em `@theme inline` como `--color-*` (inclusive `line`, `gold-btn`, `gold-700`, `ok`, `ok-700`,
`err`, `selection`), mais `--font-sans`, `--font-display`, `--font-mono` e `--shadow-1`, `--shadow-2`. Classes
utilitárias usam só esses nomes (`bg-primary`, `text-accent`…); nunca hex solto em componente.
`packages/web/src/app/theme.test.ts` lê os tokens de `globals.css` e falha quando um par de uso real cai abaixo
de 4,5:1 (texto) ou 3:1 (foco, traço, ícone) — mudar um token é mudar o teste junto.

### Tipografia

| Papel | Fonte | Tamanho / peso / tracking |
|---|---|---|
| Display (landing) | Barlow | 66px / 500 / −2.3px, line-height 1.02 |
| H1 do app | Barlow | 36px / 500 / −1.26px |
| H2 | Barlow | 24px / 500 / −0.5px |
| H3 | Barlow | 18px / 600 |
| Corpo | Barlow | 16px / 400, line-height 1.55 |
| Corpo pequeno | Barlow | 14px / 400 |
| Eyebrow | Barlow | 13px / 600, uppercase, tracking 1.8px, cor gold-600 (gold-300 em navy) |
| Número grande | Barlow Condensed | 48–72px / 500 |
| Código, ids, cotas | IBM Plex Mono | 13px / 500 |

Fontes por `next/font/google` (Barlow 400/500/600, Barlow Condensed 500, IBM Plex Mono 500/600), expostas
como `--font-sans`, `--font-display`, `--font-mono`. Ids de painel (`1-W01-P2`), medidas (`12'-0"`) e códigos
de aviso (`HEADER_JACKS_BELOW_TABLE`) sempre em mono.

### Forma, sombra, espaço

- Raio: 3px em cards, inputs e tabelas; 999px (pill) em botões; 28px só em blocos grandes da landing.
- Sombras: `shadow-1 = 0 1px 2px rgba(16,36,65,.06), 0 8px 28px rgba(16,36,65,.09)` (cards);
  `shadow-2 = 0 2px 6px rgba(10,20,40,.16), 0 24px 60px rgba(10,20,40,.22)` (dialogs).
- Gutter horizontal `clamp(20px, 4vw, 40px)`; largura máxima de conteúdo 1200px; escala de espaço do
  Tailwind (4px).
- **Movimento**: easing do site `cubic-bezier(.22,.61,.2,1)` (`ease-site`; em JS, `easeSite` de `lib/motion.ts`).
  Hover e foco em 200 ms (cor, borda, `translateY(-1px)` em botão, `-2px` + sombra em card com `lift`). Entrada
  de tela `step-enter` (fade + 12 px de subida, 450 ms); listas entram em cascata com `stagger` (60 ms por item,
  via `--i`, no máximo 12 itens e só na primeira montagem). Zona de soltar responde ao hover (borda e cantos
  dourados, ícone sobe) e ao arraste (escala 1.01, ícone dourado). Componentes do shadcn animam com
  `tw-animate-css`. **Editor (M4)**: seleção na planta é um halo que entra/sai em 200 ms; traços mudam de cor com
  transição; hover em navy-600; alças entram com `pop`; Fit e centralizar interpolam o viewport em 250 ms e
  qualquer gesto cancela; o inspetor entra em fade a cada seleção; campo confirmado pisca em verde 600 ms
  (`commit-flash`); o chip de status entra com `pop` a cada estado. Nada em loop fora da espera da extração.
  `prefers-reduced-motion`: regra global zera toda animação e transição; animações em JS consultam
  `prefersReducedMotion()` e pulam para o fim.

## 3. Componentes (shadcn/ui, só os usados)

| Componente | Variantes e regras |
|---|---|
| Button | `default` navy pill (texto papel); `accent` gold pill (texto navy; hover = gold com o mesmo navy, 5,1:1) para a ação principal da tela; `outline` borda line; `ghost`; `link` navy com "↗" quando abre outra página. **Todo tamanho é pill** (xs/sm/lg também). Hover de `outline`/`ghost`/`secondary` é papel-2/papel-3 — dourado é só o accent. Altura 40px, texto 15px/600. Transição 200ms `ease-site`. Loading: spinner + texto no passado contínuo ("Generating…"). Foco: só o anel global (`:focus-visible` em `globals.css`, navy-600 2px + offset 2px); nenhum componente traz anel próprio. |
| Card | fundo white, borda line, raio 3px, shadow-1 (`ui/card.tsx` é a única forma de card: nada de `rounded-md border bg-card` à mão). |
| Tabs | variante `line`: sublinhado gold de 2px na ativa; texto 14px/600 ink-2 → ink. É a única variante em uso (resultado e navegador). No navegador do workspace (S21.4) o conteúdo fica montado (`forceMount` + `hidden`): listas não reanimam a cada troca e a região `aria-live` das issues continua existindo em outra aba. |
| DropdownMenu | menu `⋯` da top bar do workspace (downloads, configurações, "Start over"); fundo white, borda line, shadow-1. |
| Table | cabeçalho 13px uppercase ink-2 (ink-3 reprova em 13px); linhas com borda line-faint, hover papel-2; números alinhados à direita em mono; `<th scope>`. |
| Badge | **chip claro**: `success` (ok/10 + texto ok-700), `warning` (gold-100 + texto gold-700), `destructive` (err/10 + texto err), cada um com borda do tom a 30 % e **ícone** (CircleCheck / TriangleAlert / OctagonX) — a cor nunca é o único sinal; `outline`, `secondary`. Texto 12px/600, mono para códigos. Fundo cheio só nos contadores pequenos do navegador (paper sobre err, 5,2:1). |
| Alert | `default` (info, borda navy), `destructive` (err), `warning` (gold-700 sobre gold-100), `success`. Raio 3px. `role="alert"` só no destrutivo; os outros são `status` (não interrompem o leitor de tela ao montar). Mensagem do motor em `<pre>` mono dentro do Alert. |
| Skeleton | papel-3 pulsando; nunca dourado. |
| Form, Input, Textarea, Select, Checkbox | formulários que **submetem** sempre via `Form` do shadcn com react-hook-form; erro de campo em err 13px abaixo do campo; Textarea de JSON em mono 13px. **Inspetores** (painel de propriedades do editor, S21) são a exceção: inputs controlados que confirmam campo a campo no blur/Enter e recebem valores de fora durante o arraste — o `reset()` do RHF briga com isso. |
| Dialog | fundo white, shadow-2, raio 3px, overlay navy-950/50; para confirmações e para as **configurações do projeto** no workspace (S21.4: dialog rolável, `max-h-[85dvh]`, campos confirmam no blur como no inspetor). |
| Separator, Skeleton, Sonner | padrão. Toast só para resultado de ação assíncrona longa. |

Estados obrigatórios em toda tela de resultado: **vazio** (texto ink-3 e a ação sugerida), **carregando**
(Skeleton no lugar do conteúdo; na extração, "This can take a few minutes."), **erro** (Alert destructive),
**aviso** (Alert warning, nunca escondido num accordion), **sucesso** (resumo em uma linha + conteúdo).

## 4. Layout

### App shell
- **Header** (`components/site-header.tsx`, refeito em 2026-10-23): 72px (64px depois de rolar, com `shadow-2`),
  fixo no topo, superfície `header-surface` (navy-950 → navy-900 → navy-800 da esquerda para a direita, brilho
  dourado a 20 % atrás da marca, grade de 24px a 3,5 % de papel) e fio dourado de 2px na base (gold → gold-300 →
  transparente). Três áreas: **marca** — a logo da National Lumber (`public/brand/national-lumber.png`, 30×20 num
  tile de papel 40×40 com `shadow-1`, que levanta no hover; a logo é navy e sumiria direto sobre o fundo) +
  "Panelizer" (Barlow 600, 18px) sobre "NATIONAL LUMBER · WR GROUP" (10,5px, caixa alta, tracking 1,6px, gold-300);
  **navegação** — grupo de pills (`rounded-pill`, borda papel/10, fundo papel/5) com "New project" (depois
  "Projects"): ícone + rótulo (só ícone abaixo de `sm`), ativo pela rota (`aria-current="page"`, fundo papel/12,
  ícone gold-300 e ponto dourado em `animate-pop`), hover papel/8; itens entram em `stagger`; **usuário** — avatar
  de iniciais (gold-btn sobre navy-900, `initialsOf`, ponto `ok` de sessão ativa), e-mail (≥ `md`) e chevron que
  gira ao abrir; o menu (`DropdownMenu`) traz "Signed in as" + e-mail e "Sign out". Em `/login` só a marca e a
  linha "Wall panel fabrication · internal tool": sem navegação e sem usuário (não faz sentido oferecer "New
  project" a quem ainda não entrou). **Tom por rota** (`data-tone`): navy sobre as telas em papel; em `/login` o
  palco é navy, então o header vira **papel** (fundo paper, `shadow-1`, "Panelizer" em navy-900, assinatura em
  gold-700, linha de contexto em ink-3, logo num tile white com borda line) para não virar uma coisa só com a
  página — o fio dourado na base é o mesmo nos dois tons. Foco em gold-300 pelo `.on-navy` só no tom navy. A logo em PNG de 60×40 fica
  nítida até 2×; pedir o SVG à National Lumber quando houver.
- **Tela de login** (`app/login/_components/login-view.tsx`, escolhida entre 13 versões num canvas em 2026-10-23,
  a "V1B"): modo `stage` do shell (largura toda, sem rodapé, rolagem normal), palco `login-surface` (navy-950,
  brilho dourado ao centro, grade de 32px) com a **parede que vira painéis**: elevação de 18' com janela
  (`lib/login-sketch.ts`, geometria em polegadas como o `WallSketch` da extração) que se monta peça a peça em
  cascata (`login-piece`, 100 ms por peça), depois uma linha tracejada dourada desce na marca de 12' (`login-split`),
  as duas metades se afastam 14px (`login-half`) e ganham os ids em mono (`login-tag`); ciclo de 10 s. Plates, kings e
  jacks em papel, studs em gold-300, header em gold. Por cima, à direita, o **card de vidro**: navy-900 a 85 % com
  `backdrop-blur`, borda papel/15, `shadow-2`; `LoginForm` em `tone="dark"` (rótulos papel/90, campos papel/8 com
  borda papel/25 e foco gold-300, erro de campo em gold-300, nota em papel/60; o Alert de credencial errada continua
  claro). Eyebrow e título em Barlow Condensed sobre o palco; rodapé em mono com o que o desenho mostra. Abaixo de
  `lg` a parede fica acima do card, menor, e tudo rola. `prefers-reduced-motion`: parede inteira, parada, ids
  visíveis. É a única animação em loop do app além da espera da extração, e a mesma linguagem.
- Conteúdo: `max-w-[1200px]`, gutter do site, padding vertical 32px. Telas de trabalho seguem o **takeoff da
  National Lumber**: cabeçalho (eyebrow + h1 + parágrafo), **barra de passos** numerada (círculo navy cheio no
  ativo, sublinhado dourado; passos feitos também cheios), e o passo 1 em duas colunas 5/12 + 7/12: à esquerda
  o card do formulário (zona de soltar arquivos tracejada com cantos marcados e ícone navy, "Project details",
  collapsibles com `<details>`; a zona lista o que recusou e por quê, mostra o total dos 300 MB e o erro de
  "sem arquivo" embaixo dela; cada PDF solto ganha **miniaturas das páginas** (pdf.js no cliente), e clicar numa
  marca a folha no campo "PDF pages" (por arquivo); o card **"What will be sent"** (M7) lista, antes de pagar, as
  páginas que vão de cada PDF com folha e título, as que ficaram fora do orçamento, imagens, tamanho e o custo
  estimado com faixa, e o botão leva "· about US$ X"; a tela de espera mostra a fase e os tokens que já
  chegaram, tem "Cancel the read" e volta sozinha depois de um F5; "or try a sample" ao lado do botão só quando os exemplos existem — exemplos
  e "Advanced › Recorded response" aparecem só em desenvolvimento ou com `PANELIZER_DEV_TOOLS=1`), à direita o
  **card de prévia** com cabeçalho navy, ilustração (a planta de
  painéis da 28x40 gerada pelo motor), legenda em papel-2, título + parágrafo, três features numeradas e rodapé
  navy; esse card vira status quando há leitura. **Cada passo é uma tela**: o passo ativo ocupa a área toda,
  o anterior some; a barra de passos leva de volta aos concluídos (círculo com check), e as telas 2 e 3 têm
  "Back" e "Start over". Até a S22 o estado fica no cliente (sem URL por passo); com projetos salvos, cada
  passo ganha rota própria.
- **Nunca perder trabalho (M2):** o projeto aberto é gravado no navegador a cada edição (`localStorage`, até a S22) e
  `/app` sem projeto oferece "Resume *nome*?" num Alert `default` logo abaixo da barra de passos (Resume accent,
  Discard ghost). O passo 1 fica montado e escondido nos outros passos (arquivos e campos sobrevivem). "Start over"
  confirma em `Dialog` quando há edições, resultado ou leitura. Remover parede/abertura avisa em toast com "Undo".
  Delete só apaga com o foco na planta; Backspace nunca apaga. Passo 3 alcançável pela barra depois de voltar ao
  editor, com Alert `warning` "Edited since these panels were generated" + "Generate again" quando o draft mudou.
- Rodapé mínimo: versão, "National Lumber · WR Group".

### Workspace do editor (passo 02, S21.4)
Exceção ao container de 1200 px: com um projeto aberto, o passo 02 é um **workspace** que ocupa a largura toda e a
altura da janela (`h-dvh`, header de 64 px descontado, sem rodapé); a página não rola, cada painel rola sozinho
(`workspace-pane`). O `AppShell` troca de modo pelo contexto `ShellLayoutProvider` (`useWorkspaceLayout`), porque
o passo é estado do cliente. Estrutura, em `lg+` (`grid-cols-[260px_1fr_320px]`, `xl`: 300/360):
- **Top bar** (56 px, fundo white, borda line): `StepBar` compacta (pills de 20 px, rótulos curtos; continua
  levando aos passos feitos), nome do projeto como `h1` (18px/600), "N walls · N openings" em ink-3, **um chip de
  status** com `aria-live` (`Checking…` outline / `N to fix` err / `Ready · N panels` ok + `N warnings` gold-600),
  a frase do que falta ("Fix 3 problems first."), **"Generate panels"** accent sempre visível, menu `⋯`
  (Download project file, Download AI reading, Project settings, Start over).
- **Navegador** (esquerda, fundo white): abas Walls / Issues / Reading. Walls = lista compacta (id mono · papel ·
  seção · nº de aberturas · comprimento · contadores de issue em err/gold-600 · ponto de confiança da IA), chips de
  filtro All / Needs attention / Low confidence, a parede selecionada expande as aberturas; selecionar pela lista
  centraliza a planta só se a parede não está visível (nunca aproxima). Issues = **grupos** (um item por família:
  título em inglês, `× N`, uma frase "o que aconteceu" + "como resolver" em negrito (`lib/editor/issue-help.ts`),
  chips de ids clicáveis — da abertura quando a issue é dela —, conserto rápido inline quando existe (campo de
  vento, campo de altura de header, botão "Add <id>" para abertura sem posição), botão de ação, textos originais
  em "Details"); problemas antes de avisos. Reading = modelo, páginas, origem, tokens, notas da IA, relatório completo, download da leitura.
- **Centro**: `PlanCanvas` em modo `fill` (preenche o painel; barra com pavimentos, zoom − / % / + / Fit e a
  toolbar do editor à direita — botões com `Tooltip` e atalho, só ícones abaixo de `sm`; dica de uso no rodapé;
  dentro da planta, barra de escala no canto inferior esquerdo, legenda no direito, grade de 12" quando o zoom
  passa de 1 px/pol, cota junto ao cursor durante o arraste; o canvas é focável: setas movem a seleção, +/− F
  zoom e Fit; dois dedos fazem pinch e pan). **Planta do arquiteto por baixo** (M6): menu "Drawing" na barra
  põe uma página do PDF (ou imagem) atrás das paredes a 35 % (opacidade ajustável), com escala por dois pontos,
  origem por um ponto e giro de 90°; durante a calibração uma faixa navy sobre a planta diz o próximo clique. A
  imagem fica no projeto (`$underlay`) e no arquivo `.panelizer.json`. Projeto solto (sem planta) mostra a
  **elevação esquemática** da parede selecionada (M5), com os RO clicáveis. Leitura
  da IA à qual falta o que o motor exige (`lib/editor/requirements.ts`: altura; neve, largura, pavimentos acima e
  vão do piso quando há parede portante com abertura sem header próprio) mostra, no lugar da planta, o card
  **"Before you review"** (eyebrow + h2 + lista do que falta e por quê + "Required for this project" com os
  campos marcados `· required` + "Optional" recolhido + "Apply and open the editor" accent + link "Skip — set it
  per wall instead"). O obrigatório é validado antes de aplicar; o card só existe enquanto o draft tem obrigatório
  faltando (nunca por mensagem do motor), e os grupos de issues dessas famílias o reabrem por "Fill in project data".
- **Inspetor** (direita, fundo white, 16 px de padding, sem moldura): breadcrumb com anterior / próxima parede
  (`[` `]`), botão **Reviewed** na seção Wall (chip verde quando marcado; conta na top bar como "N of M reviewed"
  quando há leitura da IA ou alguma marca, e vira o filtro "Not reviewed" da lista — checklist do revisor, não
  trava o Generate), **issues do item no topo** em
  callout (err/5% ou gold-100/40, título em inglês + texto original mono), seções em `<details>` com eyebrow e
  chevron (Wall, Geometry e Openings abertas; Framing fechada quando completa e sem issue; "From the AI reading"
  aberta só com confiança < 0,9, evidência recolhida). Seleção `project` abre o Dialog de configurações.
- **Abaixo de `lg`** (`useMediaQuery`, não CSS, para não montar o inspetor duas vezes; lê a janela já no primeiro
  render do cliente): planta em cima (45dvh) e abas Walls / Issues / Reading / Inspector embaixo; selecionar pela
  lista abre a aba Inspector. Abaixo de `sm` a top bar são duas linhas fixas (passos + nome | status + Generate +
  ⋯) e a toolbar mostra só ícones.
- **Rótulos**: um nome por dado em todo o app, de `lib/editor/labels.ts` ("Ground snow load (psf)", "Wind speed
  (mph)", "Building width", "Floors above this level", "Floor span" com "Not known (worst case)"…). Upload, card
  "Before you review", configurações, inspetor e consertos rápidos leem dali. Nas configurações cada dado tem um
  campo só; o que a reconversão da leitura aplica e não tem campo próprio (altura de parede em lote, peitoril)
  fica recolhido em "Reconvert from the AI reading".
- Passos 01 e 03 continuam no container de 1200 px com a barra de passos cheia; o cabeçalho hero (eyebrow + h1 +
  parágrafo) aparece só no passo 01 (M3) — nos outros, o eyebrow do passo ("03 · Panels") é o título.

### Landing (futura, não implementar agora)
Mesmos tokens. Hero em navy-950 com eyebrow gold-300, h1 display em papel, parágrafo papel/80, CTA pill gold
+ link papel. Seções alternando papel e navy; cards de 28px com eyebrow numerado em mono ("01 ·", "M-01");
números grandes em Barlow Condensed com unidade em eyebrow. Rotas `/`, `/how-it-works`, `/contact`.

## 5. Rotas

| Rota | Conteúdo | Sessão |
|---|---|---|
| `/` | landing; por ora `redirect('/app')` | S20.0 |
| `/app` | novo projeto: desenhos → revisão → painéis | S20.1–S20.3 |
| `/app/projects`, `/app/projects/[id]` | projetos salvos | S22.1–S22.2 |
| `/login` | palco com a parede que vira painéis + card de vidro; `?next=` volta aonde ia | S22.0 / 2026-10-23 |

Rotas de API: **nenhuma**. Sem route handlers.

## 6. Folhas e planta na tela

SVG gerado pelo core entra inline (`dangerouslySetInnerHTML`, é código nosso), dentro de Card papel-2, com
`svg { width: 100%; height: auto }`. A **planta do editor** (S21) não é o `plan.svg` do core: é SVG React desenhado
pela geometria de `lib/editor` (plates pelo `frameWalls`), com os tokens do tema (`var(--color-…)`), clicável e com
pan/zoom; a parede selecionada tem alças nas pontas (arrastar move a ponta no eixo, snap 1" / Shift 1/8") e as
aberturas deslizam pela parede; `plan.svg` continua sendo a entrega (passo 03 e zip). No passo 03 (M3) a mesma
`plan.svg` é **clicável**: o core escreve um `rect.panel-hit[data-panel-id]` transparente por painel e o
`PlanView` do app abre a folha no clique, com hover a 18 % e o selecionado a 28 % de `selection` (invisível no
papel). O resultado tem quatro abas: **Plan**, **Sheets** (lista com peças/peso/avisos; anterior/próximo e ← →;
Open, Download, Print da folha; lupa em Dialog cheio com 100/150/200 %; "Show all" para imprimir o conjunto),
**Materials** (BOM por seção com subtotais e total, lista de corte por painel) e **Files**; avisos do motor
passam pelos mesmos grupos e ajuda do editor, com chip por painel. As folhas mantêm o visual atual (não passam
pelo tema; a fábrica lê a folha, não o site). Impressão: `@media print` esconde `.no-print`, cada `.sheet` com
`break-after: page`, `@page { size: letter landscape; margin: 0.4in }`. **PDF** (M9): "Download PDF" ao lado de
"Print all sheets" manda os SVGs da tela para `pdf.service` (`@resvg/resvg-js` → PNG a 220 dpi, `pdf-lib` → carta
paisagem, uma folha por página, planta primeiro, rodapé "projeto · folha" e "x de y") e baixa `<slug>-sheets.pdf`;
cada folha tem o seu botão PDF (`<id>.pdf`). Enquanto renderiza o botão mostra "Rendering N pages…" com spinner.

## 7. Arquitetura de requisições (padrão único)

```
componente (client)  →  server action (next-safe-action, zod)  →  service (server-only)  →  core / cli / extract (em processo)
Server Component     →  service                                                           →  supabase-js (S22) / ky (outras APIs)
```

- **Mutações** só por server actions em `src/actions/*.ts` (`'use server'`,
  `actionClient.inputSchema(schema).action(async ({ parsedInput }) => service(...))`). Cliente chama por
  `useAction`. Nunca `fetch` para `/api/*`.
- **Leituras** em Server Components pelo service, passadas como props. Estado no cliente é só de UI.
  Revalidação por `revalidatePath`/`revalidateTag` dentro da action.
- **Services** (`src/services/*.service.ts`, `import 'server-only'`): toda a regra de negócio do app.
  Funções puras ou com `deps` injetáveis, testadas no vitest sem Next. Nenhum componente importa `core`,
  `cli` ou `extract`: só o service. **Exceção única (S21):** `src/lib/editor/*` importa o `core` puro (units,
  `frameWalls`, `resolveOpening`, geometria do eixo) para o editor validar e desenhar a planta no cliente sem
  ida ao servidor; é a única camada do cliente que o faz, e os componentes importam só a lib. `cli` e `extract`
  nunca entram no cliente; o motor continua rodando no servidor (`generatePanels`, `checkProject`). `panels.service` (gerar), `extract.service` (PDF → JSON, resposta
  gravada, checagem da chave), `pdf.service` (folhas SVG → PDF, M9), `projects.service` (S22).
- **ky** (`src/lib/http.ts`): instância única (`prefixUrl`, `timeout`, `retry`, hooks que convertem erro
  HTTP em `ServiceError`), usada só dentro de services e só onde há HTTP de verdade. Motor e extração rodam
  em processo. Nunca ky em componente, nunca `fetch` solto. **Supabase não passa pelo ky** (S22.0): o
  `supabase-js` com `@supabase/ssr` cuida da sessão em cookie e do refresh do token, que o ky teria de
  reimplementar; `src/lib/supabase/server.ts` cria um cliente por requisição e só services o importam.
- **Login** (S22.0): e-mail e senha no Supabase Auth, sem cadastro no app (contas criadas no painel; ver
  `supabase/README.md`). `src/proxy.ts` roda antes de toda página e action: renova o token e aplica
  `lib/auth/routes.ts` (`/app*` exige usuário → `/login?next=…`; `/login` com usuário volta ao app). As
  actions de `/app` usam `authActionClient`, que exige usuário quando o Supabase está configurado (`ctx.user`).
  Sem as chaves o app roda aberto em desenvolvimento; em produção `/app` é bloqueado e `/login` explica.
  O header mostra o avatar do usuário com menu e "Sign out" quando há sessão (§4).
- **Erros**: `handleServerError` do `actionClient` traduz `ProjectError`, `BuildError`, `ExtractError`,
  `ServiceError`, `SignedOutError` e erros da API em mensagem; problemas de projeto não são erro de servidor, voltam em `data`
  como `{ ok: false, problems }` para a UI listar.
- **O usuário nunca vê JSON**: a entrada é desenho (PDF, imagem) e a revisão é tabela; o formato do CLI fica em
  "Advanced" recolhido. Tudo que veio da IA mostra confiança e evidência.
- **Arquivo de projeto** (M2): `<slug>.panelizer.json` = JSON do CLI + leitura da IA em `$panelizer` (chave que o
  CLI ignora). É o que o menu ⋯ baixa, o que "Advanced" reabre (com a proveniência) e o que vai no zip do passo 03
  como `project.panelizer.json`. Não existe mais "Download AI reading" separado no menu (a aba Reading mantém o
  download da resposta crua para debug).
- **Formulários**: schema zod em `src/schemas/*.ts` (compartilhado), `useForm` + `zodResolver` + `Form` do
  shadcn; `returnValidationErrors` para erro de campo. Upload: `FormData` com `z.instanceof(File)`;
  `serverActions.bodySizeLimit` 300 MB (conjunto inteiro de folhas, S20.2).

## 9. Organização do código (`packages/web/src`)

```
app/<rota>/page.tsx      rota fina: Server Component lê pelos services e monta a view
app/<rota>/_components/  a view e os componentes que só essa rota usa (pasta privada: `_` não vira rota)
app/<rota>/_actions/     server actions (next-safe-action) só dessa rota, uma por arquivo
components/              compartilhado entre rotas (app-shell, site-header) e `ui/` do shadcn
services/                regra de negócio, só servidor
schemas/                 zod compartilhado cliente/servidor
types/                   tipos que trafegam servidor → cliente
lib/                     utilidades puras (files, zip, http, safe-action, utils)
lib/editor/              modelo do editor (S21): draft do projeto, issues, estado, geometria — único lugar do cliente que importa core
lib/supabase/            chaves do ambiente (puro) e cliente de servidor com a sessão em cookie (S22.0)
lib/auth/                decisão de rota do guard de login, pura (S22.0)
proxy.ts                 guard de login: refresh do token + redirecionamentos, antes de toda página e action (S22.0)
types/database.ts        tipos da base do Supabase, escritos à mão a partir de supabase/migrations/*.sql
```

Regra: um componente ou action só sai de `app/<rota>/_*` para `components/` ou para uma pasta compartilhada
quando uma segunda rota o usar. Imports dentro da rota são relativos (`./upload-form`, `../_actions/x`).
Hoje: `app/app/` (nova obra: upload, editor, resultado); o editor vive em `app/app/_components/editor/`.

**Testes** (vitest): `*.test.ts(x)` roda em node — lib, services, schemas e componentes por
`renderToStaticMarkup`; `*.dom.test.tsx` (M10) declara `// @vitest-environment jsdom` e usa
`@testing-library/react` + `user-event` para o que só o DOM mostra: foco e blur do `CommitInput`, atalhos como
teclas, pointer events do `PlanCanvas` (rAF falso), `localStorage` da sessão, navegação de folhas, barra de passos.
Server actions nos hooks são mockadas em `next-safe-action/hooks`. Sem e2e ainda (Playwright depois da S22).

## 8. Acessibilidade e idioma

`<html lang="en">`. Contraste mínimo 4,5:1 no texto e 3:1 em foco, traço e ícone (WCAG AA), **medido**, não
estimado (valores de 2026-10-20; o teste `theme.test.ts` recalcula): navy sobre papel 14,1; navy sobre
gold-btn 6,4; ink-2 sobre white 7,8; ink-3 (`#56637B`) sobre paper-2 5,1; gold-700 sobre papel 5,2 e sobre
gold-100 4,6; navy-600 sobre papel 7,0. Reprovados e por isso proibidos em texto pequeno: gold-600 sobre papel
(3,6 — a versão anterior deste doc dizia 4,6, estava errada), o ink-3 antigo `#6B7890` (4,05), paper sobre
gold-600 (3,6), gold-300 como anel de foco (1,8). Foco visível: anel 2px navy-600 com offset 2px (`.on-navy`:
gold-300 sobre o header). Seleção (navy-600) e aviso (gold-700) nunca dividem matiz, e todo estado tem ícone
além da cor. Toda ação assíncrona anuncia o resultado (toast ou texto `aria-live`). Tabelas com `<th scope>`;
SVGs inline com `role="img"` e `aria-label` com o id do painel.
