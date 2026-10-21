# 11 — Revisão do app (2026-10-20): diagnóstico e plano M1–M10

## Contexto

Gerado na sessão de 2026-10-20 a pedido do humano ("análise completa do projeto… melhorias de funcionalidade, UI/UX, design, cor, contraste e animações"). A M1 foi feita na mesma sessão; o estado de cada item fica em `03-sessoes.md`.

O humano pediu uma análise completa do projeto no estado atual, com melhorias de funcionalidade, UI/UX,
facilidade de uso e design visual (cor, contraste, animação). Motor (Fases 1–3) e extração (Fase 4) estão
feitos; o app está na S21.4 (workspace do editor), com a S22 (persistência) por fazer. Fontes: as três telas
rodando no browser embutido (upload → editor com 28x40 e Ringgold → painéis, em 1100×700 e 375×812), leitura
do código do app e dos docs, medição WCAG dos tokens, e duas auditorias delegadas (código da UI; lacunas
funcionais), com os achados mais graves conferidos por mim no código. Nada foi alterado no repositório.
Este arquivo é a entrega: diagnóstico e plano priorizado em sessões do tamanho das de `docs/03-sessoes.md`.

## Resumo executivo

1. **O maior risco não é visual: é perder trabalho.** Uma leitura da IA custa ~10 min e ~US$ 1,50 e vive só no
   estado do cliente. F5, "Start over" (sem confirmação), Backspace com um botão em foco, ou clicar em
   "Drawings" na barra de passos (o passo 2 deixa de ser alcançável) apagam tudo. Auto-save em `localStorage`
   + confirmações resolvem 90 % disso em uma sessão curta, antes da S22.
2. **O produto ainda não mostra o que vende.** A visão promete "planta com as paredes por cima", lista de
   material consolidada e PDF; hoje o editor desenha só as paredes, a BOM existe apenas como CSV na aba Files
   e a folha vai para a fábrica pelo diálogo de impressão do browser.
3. **A identidade visual é boa, mas um matiz carrega três significados** (seleção, aviso e ação principal são
   dourados) **e os tokens de texto secundário reprovam no contraste** que `10-design §8` exige: ink-3 dá
   4,05:1 sobre papel e gold-600 dá 3,63:1 (o doc afirma 4,6 — está errado). O anel de foco gold-300 dá 1,8:1.
4. **Movimento existe só nas entradas de tela.** No editor, onde o usuário passa o tempo, nada anima: seleção,
   reenquadramento, troca de inspetor, confirmação de campo, chip de status. `lift`, `animate-pop` e
   `shadow-2` estão definidos e nunca usados.
5. **Nenhuma hipótese do motor está validada (P1).** Código não resolve isso; fica registrado porque qualquer
   polimento de folha pode mudar quando a fábrica responder P19/P21/P23/P24/P35.

## O que está bom (não mexer)

- Arquitetura: core puro no cliente só por `lib/editor`, server actions + services testados (128 testes web).
- Workspace do passo 02 (top bar com um chip de status, navegador, planta, inspetor) resolveu a densidade.
- Issues agrupadas por família com "o que aconteceu / como resolver", chips clicáveis e conserto rápido inline:
  a melhor parte da UX e o padrão a estender ao resultado.
- Paleta navy/gold/papel, Barlow + Plex Mono, raio 3 px, mono para ids e medidas; lucide usado com consistência.
- `CommitInput` (blur/Enter confirma, Esc reverte, valor externo só sem foco) é o modelo certo para inspetor.
- Zona de soltar arquivos: hover e arraste animados como o doc pede. Espera da extração com animação própria.

## Diagnóstico

### A. Funcionalidade (por impacto)

| # | Lacuna | Onde | Impacto |
|---|---|---|---|
| A1 | Sem persistência/auto-save; sem `beforeunload`; "Start over" sem confirmação; remover sem toast "Undo" | `new-project-view.tsx:75-80`, `workspace.tsx:80` | perda de leitura paga |
| A2 | Passo 2 só conta como "done" com resultado: editor → "Drawings" → não volta; o early return desmonta o `UploadForm` (perde arquivos, contradiz o comentário de :124); passo 3 nunca entra em `done` (volta de "Back to review" só regenerando); sem indicador "resultado desatualizado" | `new-project-view.tsx:86-92`, `step-bar.tsx:30` | beco sem saída |
| A3 | Backspace apaga a parede selecionada quando o foco está num botão, `<summary>` ou linha da lista | `use-editor-shortcuts.ts:13,23` | apagar sem querer |
| A4 | Planta do arquiteto não aparece por baixo das paredes (`00-visao:13`) | `plan-canvas.tsx` | revisar sem referência |
| A5 | BOM e lista de corte só em CSV; nenhuma tabela, sem totais | `result-view.tsx:100-104` | a entrega principal invisível |
| A6 | Planta de painéis estática (id não abre a folha); folha ilegível em 700 px, sem zoom, sem anterior/próximo, sem download/impressão por folha; lista sem peso/avisos por painel; "Show all" despeja 41 folhas | `result-view.tsx:119-146`, `svg-view.tsx` | navegar 41 folhas é penoso |
| A7 | Avisos do resultado em mono cru (português), sem os grupos/ajuda do editor | `problems.tsx:22-39` | duas linguagens |
| A8 | Sem PDF (`00-visao:15`); impressão só carta paisagem via `window.print()`, sem "x de y" | `result-view.tsx:62-71` | fábrica depende do browser |
| A9 | Zip não leva `project.json` nem a leitura; "Download project file" perde a proveniência | `result-view.tsx:72`, `reading-panel.tsx:17-22` | sem rastreabilidade |
| A10 | Dialog de configurações mostra os mesmos campos duas vezes quando há leitura: `ProjectDataForm` (RHF, "Apply" rebuilda e descarta edições) e o bloco Building (commit no blur), com rótulos, placeholders (29' vs 28') e alturas de input diferentes | `project-properties.tsx:57,106-124`, `project-settings-dialog.tsx:32` | confusão |
| A11 | Editor: seleção única; sem duplicar, dividir/juntar, mover parede inteira, nudge por teclado, medir, snap a outras paredes; arrastar um canto abre a casa; filtro de pavimento da planta esconde paredes que a lista ainda seleciona (`focusWall` vai ao vazio) | `state.ts:25-78`, `geometry.ts:247`, `plan-canvas.tsx:224,235` | casa real é lenta de editar |
| A12 | "Add wall" sempre 90° à esquerda com 8' fixos; `extraStuds` e catálogo não editáveis; sem quebra manual de painel e a planta não mostra onde os painéis se dividem (P37) | `state.ts:195-200`, `project-properties.tsx:127-181`, `types/panels.ts` | adiados em `04-decisoes:228` |
| A13 | Extração: sem estimativa de custo, sem prévia das páginas, sem cancelar, progresso é só tempo (para em 95 %), leitura em voo se perde no reload; `pages` vale para todos os PDFs | `extract-progress.tsx`, `extract-timing.ts:63-66`, `client.ts:221`, `extract.service.ts:84` | US$ 1,50 às cegas |
| A14 | Confiança da IA só vira ponto e filtro; não há estado "revisado" por parede (`01-escopo:49`) | `wall-filters.ts` | revisão sem checklist |
| A15 | Checagem com debounce roda o `buildProject` inteiro (todas as folhas SVG + CSVs) e descarta os arquivos; cliente refaz `frameWalls` da casa toda a cada quadro de arraste | `panels.service.ts:56-59`, `wall-editor.tsx:43` | latência com 41 painéis |
| A16 | Aplicar dados do projeto zera o undo (`load`) | `state.ts:102-107` | surpresa |
| A17 | Blocking horizontal só avisa, não desenha (`01-escopo:26`); contagem de peças do CLI (members) ≠ folha/web (plies) | `validate.ts:130`, `cli/main.ts:162` | folha incompleta; números diferentes |
| A18 | Sample picker e "Recorded AI response" renderizam para todo usuário; upload sem filtro de tipo/tamanho, sem total, erro de vazio por toast; `ANTHROPIC_API_KEY` no texto para o usuário | `new-project-view.tsx:134`, `advanced-import.tsx:40`, `drop-zone.tsx:53`, `upload-form.tsx:72` | caminhos de dev expostos |
| A19 | Sem testes de interação (jsdom/testing-library) nem e2e: `CommitInput`, atalhos, arraste, `use-project-check`, resume | `vitest.config` | regressões silenciosas |
| A20 | `03-sessoes.md:456` ainda marca S20 como `[ ]`; `10-design` diz 50 MB de upload (código: 300 MB) e colunas 300/360 (código: 260/320 em lg) | docs | — |

### B. UX e facilidade de uso (observado)

- **Passo 01.** Hero (~200 px) em toda visita e repetido no passo 03 com um segundo eyebrow logo abaixo. Sem
  chave de API, o CTA fica desligado e o caminho vivo (sample) está abaixo da dobra. Nenhuma miniatura dos
  arquivos, mas o formulário pede números de página. `onDragLeave` pisca ao passar sobre os filhos.
- **Passo 02.** Projeto solto (Ringgold) deixa 60 % da tela com a caixa "nothing to draw" (45dvh em mobile).
  Sem controle de zoom visível, barra de escala, grade, hover ou transição na planta; **sem zoom por toque**
  (`touch-none`, só roda) — tablet não usa o editor. Alças e Shift-snap só se descobrem numa linha de 12 px
  truncada; Delete/Esc/undo não estão listados; sem `Tooltip` (só `title`, que não existe em toque/teclado).
  "Add wall" não diz o que faz. Sem "próxima/anterior parede" para revisar 28 em sequência. Nenhum feedback ao
  confirmar um campo. "Checking…" aparece no chip e no hint ao mesmo tempo; abaixo de `sm` o Generate
  desligado não explica por quê. Terminologia varia: "Wind (mph)"/"Wind speed (mph)", "Snow load"/"Ground
  snow load", "Not known"/"Worst case"/"B (default)", "Remove"/`title="Delete"`, "reading"/"read"/
  "extraction", "Project details"/"Project data"/"Project settings", "op.". Mensagens cruas do motor
  (`config.studLength: …`, prefixos em português) chegam ao usuário em Details e no callout.
- **Mobile (375 px).** Top bar em três linhas; toolbar quebra com o redo órfão; "Pick a wall on the left" com
  a lista embaixo; `useMediaQuery(initial = true)` monta o layout de três colunas e depois troca (flash).
- **Passo 03.** "Download all" duas vezes como accent; estado vazio sem ação sugerida; sem resumo de sucesso
  em uma linha.

### C. Cor e contraste (medido)

| Par | Razão | Uso atual | Veredito |
|---|---|---|---|
| ink-3 / white · paper · paper-2 · paper-3 | 4,30 · 4,05 · 3,74 · 3,42 | linhas da lista (12 px), hints, legenda 11 px, estados vazios, dica da planta | reprova AA em toda superfície |
| gold-600 / paper | 3,63 | **eyebrows** (13 px/600), `text-warning` 12 px, "· required", rótulo selecionado na planta, hover do accent | reprova (doc diz 4,6) |
| paper / gold-600 | 3,63 | badge "N warnings", `Dot` de aviso (10 px) | reprova |
| gold-300 anel de foco / paper | 1,80 | `:focus-visible` global; shadcn sobrescreve com `ring/50` (≈1,3) — três estilos de foco coexistem | reprova 3:1 não-texto |
| err / gold-btn | 2,36 | "Remove wall/opening" ghost em hover (hover vira accent) | reprova |
| gold / gold-600 | 1,30 | parede selecionada vs parede com aviso | indistinguíveis |
| gold / paper-2 | 2,58 | stroke de seleção | sinal só por cor |
| paper / ok · err | 4,59 · 5,18 | badges Ready / to fix | passa |
| ink-2 / white · paper-2 | 7,82 · 6,80 | — | substituto de ink-3 |
| navy / gold-btn | 6,44 | botão accent | ok |

- **Um matiz, três significados**: seleção (`gold`), aviso (`gold-600`), ação principal (`gold-btn`). Um
  problema sobrescreve a cor de seleção: parede selecionada com problema é só uma linha vermelha mais grossa.
- Badges cheios de status (fundo err/ok/warning com papel) gritam ao lado de uma paleta de papel; `Badge` não
  tem as variantes `success`/`warning` que o doc exige — as cores são sobrescritas à mão em 5 arquivos.
- Externa/interna só por `gold-100` vs `paper-3` sobre `paper-2`, sem legenda; a casa flutua num bege.
- Drift de tokens: `--color-line` não existe no `@theme` (o separador `bg-line` da toolbar é invisível;
  `border-line` só funciona porque `* { border-border }` coincide); `gold-btn`, `ok`, `err` não expostos;
  `text-white`/`bg-black/50` puros no destructive e no overlay; Alert `rounded-lg` sem borda navy e
  `role="alert"` fixo; Dialog `rounded-lg shadow-lg`; Skeleton `bg-accent` (bloco dourado pulsando no passo
  3); Card `rounded-xl` = 28 px (por isso ninguém usa o Card e cada card é feito à mão, com e sem sombra);
  Tabs do resultado em pílula `bg-muted` em vez do sublinhado gold; Table sem cabeçalho 13 px uppercase e sem
  `scope`; botões `xs`/`sm`/`lg` são `rounded-md`, então o "Generate panels" da top bar não é pill.
- Folha de fabricação: fora do tema de propósito. Mantida.

### D. Movimento

- Existe: `step-enter` nas trocas de passo, `stagger` (drop-zone, chips, lista de folhas), hover/arraste da
  drop-zone, sublinhado da `StepBar`, spinner, espera da extração, shadcn via `tw-animate-css`.
- Falta no editor: transição de stroke/halo na seleção; hover; interpolação do viewport em Fit/`focusWall`;
  fade na troca do inspetor; micro-feedback ao confirmar campo e nos consertos rápidos (a issue some 600 ms
  depois sem aviso); transição do chip de status; entrada do workspace e do card "Before you review".
- Defeitos: `stagger` sem teto (100 painéis = 6 s), reaplicado a cada troca de aba; `hover:pl-4` na lista
  de folhas treme o texto; Button `transition-all` 150 ms padrão em vez de 200 ms `ease-site`; hover de
  outline/ghost vira gold-btn sólido (Back, Fit e toolbar parecem o CTA); `prefers-reduced-motion` não cobre
  tw-animate, `animate-pulse/spin/fade-in`, `scale-*`, `-translate-y-px`, barra de progresso de 1 s nem o
  `scrollTo smooth`.

### E. Acessibilidade (além do contraste)

- Canvas não focável, sem pan/zoom por teclado, alças `aria-hidden`, sem nudge; nada diz que o inspetor é a
  alternativa.
- Pontos de confiança e contadores só em `title` (leitor de tela ouve "W01 ext · bearing … 2 1");
  `aria-label` em `<p>`/`<div>` ignorado.
- Alvos < 24 px: chips de id (~17 px), `Dot` (16 px), filtros (~22 px), breadcrumb `h-auto`, toolbar `xs`.
- Botões dentro de `<summary>`; hints/erros sem `aria-describedby` (`error` de `Field` nunca é passado).
- `aria-live` barulhento: lista inteira de issues, "About N min left" a cada minuto, callout a cada seleção.
- Atalhos escritos "Ctrl+Z" também no macOS.

## Plano recomendado (ordem de execução)

Cada item cabe numa sessão do `03-sessoes.md`; nenhum toca `packages/core` salvo onde indicado. Regra do
`10-design`: toda mudança de token/componente passa primeiro pelo doc.

### M1 — Tokens, contraste e semântica de cor (1 sessão, CSS + `ui/` + doc)

- `globals.css`: expor `--color-line`, `--color-gold-btn`, `--color-ok`, `--color-err`; novo `--gold-700`
  (≈ `#8C6723`, 4,6:1 sobre papel) para eyebrow, `text-warning` em texto e "· required"; `--ink-3` sobe para
  ≈ `#5B6880` (≥ 4,5:1 sobre paper-2) e fica proibido abaixo de 12 px; legendas de 11 px passam a 12 px ink-2.
- Foco único: tirar `outline-none focus-visible:ring-*` dos componentes shadcn e deixar o `:focus-visible`
  global, com anel `navy-600` 2 px (6,97:1) + offset 2 px; gold-300 só sobre navy (header).
- **Seleção ≠ aviso**: seleção = `navy-600` com halo `navy-600/15` na planta (`plan-canvas.tsx:325,367,395`)
  e `bg-navy-600/8` + borda esquerda navy nas listas (`wall-rows.tsx:102,135`, lista de folhas); aviso
  continua gold-600/700; problema = err. Parede selecionada com problema: halo navy + stroke err.
- `Badge` ganha `success`/`warning`/`destructive` em chip claro (fundo `ok/10`, `gold-100`, `err/10`; texto
  ok / gold-700 / err; borda 1 px do tom) e substitui as sobrescritas à mão (`editor-top-bar.tsx:96-115`,
  `result-view.tsx:78-85`, `Dot`, `TONE_*`). Ícone junto da cor (triângulo/círculo) para não ser só cor.
- Hover de `outline`/`ghost` = `paper-2` (não gold-btn); `destructive`/ghost de remover = `err/10`. Button
  `transition-colors 200ms ease-site`; `xs`/`sm` também pill. Alert raio 3 px, borda navy no default,
  `role` por variante; Dialog `shadow-2`; Skeleton `bg-paper-3`; Card com raio 3 px e `shadow-1` e **usar o
  Card** nos lugares feitos à mão; Tabs do resultado com sublinhado gold; Table cabeçalho 13 px uppercase +
  `scope`; sem `text-white`/`bg-black`.
- Corrigir `10-design §2/§8` (valores medidos, gold-700, foco navy, 300 MB, colunas) e §3 (Badge, Card).
- Verificação: `packages/web/src/app/theme.test.ts` lê os tokens de `globals.css` e falha abaixo de 4,5:1
  (texto) / 3:1 (foco, bordas) nos pares declarados; conferência visual nas três telas.

### M2 — Não perder trabalho (1 sessão)

- `lib/editor/persist.ts`: auto-save do `EditorState` (draft, source, outcome) em `localStorage` por commit
  (debounce 500 ms), chave por `slug`; ao abrir `/app`, banner "Resume *nome* (edited 5 min ago)" com
  Resume / Discard; `beforeunload` quando `dirty`; job de extração em voo registrado para avisar no reload.
- Navegação: passo 2 entra em `done` assim que há draft; passo 3 entra em `done` com resultado e mostra
  chip "Result from an earlier revision — regenerate" quando `revision` mudou; `UploadForm` deixa de ser
  desmontado (mover o early return para dentro do layout, ou guardar `files` no estado do `NewProjectView`).
- Confirmação (`Dialog` já existente de "Discard your edits?") em Start over e Back to drawings com draft
  editado ou resultado; toast "Removed W03 · Undo" ao remover; `use-editor-shortcuts` só apaga quando o foco
  está no canvas ou no `body` (nunca em botão/summary); `Backspace` fora.
- Arquivo único `.panelizer.json` com `project` + `reading` (proveniência) no download e no `AdvancedImport`;
  o zip do passo 03 inclui esse arquivo.
- Testes: reducer + persist + `done` em vitest; resume após F5 conferido no browser.

### M3 — Resultado que mostra a entrega (1–2 sessões; toca `core/output/planSvg.ts`)

- Aba **Materials** antes de Files: BOM (seção × comprimento comercial × qtd, pré-corte e `oversize`
  marcados) com totais por seção e peso total; lista de corte por painel recolhível. O service devolve
  `bom`/`cutlist` tipados em `types/panels.ts` (já calculados pelo `build`), não parse de CSV.
- **Planta clicável**: `planSvg.ts` escreve `data-panel-id` nos grupos (snapshot regenerado); `SvgView` faz
  hit-test e abre a folha; hover realça o painel. Folha com anterior/próximo (← →), lightbox com zoom
  (Dialog cheio, `shadow-2`), "Open in new tab", download/impressão da folha avulsa; lista com peso e nº de
  avisos; "Show all" com `stagger` limitado a 12 itens e só na primeira montagem; `hover:pl-4` fora.
- Avisos do resultado por `groupIssues`/`ISSUE_HELP` (`problems.tsx` → `IssueGroupsList` em modo leitura;
  chip abre a folha do painel). Resumo de sucesso em uma linha; estado vazio com ação; um só "Download all".
- Passos 2 e 3 sem o hero repetido (`NewProjectView` esconde o `<header>`; `StepBar` cheia fica).

### M4 — Motion no editor (1 sessão)

- `plan-canvas.tsx`: `style={{ transition: 'stroke 200ms, stroke-width 200ms' }}` nas paredes/aberturas; halo
  de seleção com `opacity` animada; hover `navy-600` 1,75 px; alças com `animate-pop`; workspace e card
  "Before you review" com `step-enter`.
- `viewport.ts`: `lerpViewport(a, b, t)`; Fit e `focusWall` interpolam 250 ms com rAF e `ease-site`
  (cancela se o usuário mexer; reduced-motion = salto).
- Inspetor: `animate-fade-in` 150 ms na troca por id; `CommitInput` e consertos rápidos piscam borda `ok` por
  600 ms (`commit-flash`); chip de status com `transition-colors` + `animate-pop` ao mudar; `lift` nos cards
  do passo 01.
- `prefers-reduced-motion` passa a cobrir tudo: tw-animate (`motion-reduce:animate-none`), spin/pulse/fade,
  `scale-*`, translate, barra de progresso, `scrollTo` sem `smooth`.

### M5 — Facilidade de uso no editor (1–2 sessões)

- Planta: controles + / − / 100 % / Fit e barra de escala; grade de 12" a partir de certo zoom (`blueprint`);
  cota e valor do snap junto ao cursor durante o arraste; pinch-zoom e pan a dois dedos (`touch-none` só
  durante o arraste); canvas focável (`tabIndex=0`) com setas = nudge da seleção 1" (Shift 1/8", Alt 12"),
  `+`/`−`/`F`; legenda externa/interna/aviso/problema num canto; "plan doesn't close" com o texto visível.
  Filtro de pavimento compartilhado entre planta e lista.
- `Tooltip` do shadcn em todos os botões da toolbar com atalho (Ctrl/⌘ conforme a plataforma); "Add wall"
  explica "continues from the selected wall's end, turning left"; `?` abre a lista de atalhos.
- Inspetor: "← previous / next →" no breadcrumb; checkbox **Reviewed** por parede (A14), guardado no draft
  como `$reviewed`, filtro "Not reviewed", contador "12 of 28 reviewed" na top bar (não bloqueia o Generate).
- Dialog de configurações com um só conjunto de campos: o bloco Building/heights em `CommitInput` manda; o
  `ProjectDataForm` só no card "Before you review" (A10). Glossário único de rótulos (`lib/editor/labels.ts`)
  usado por upload, card e inspetor; mensagens do motor traduzidas pela família antes de chegar ao Details.
- Projeto solto: no lugar da caixa vazia, **elevação esquemática** da parede selecionada (comprimento, RO como
  vãos, cotas) desenhada por `lib/editor` sem motor — serve de mini-elevação sob a planta nos projetos em planta.
- Mobile: top bar em duas linhas fixas (passos + nome | chip + Generate + ⋯), toolbar com overflow em menu,
  `useMediaQuery` com `initial` lido no primeiro efeito (sem flash), texto da caixa vazia sem "left".
- Passo 01: "or try a sample" na linha do CTA e sample/Advanced só com `NODE_ENV !== 'production'` ou flag;
  sem chave, o Alert aponta o sample e não cita a variável; drop-zone filtra tipo/tamanho, mostra total e o
  erro de vazio inline; `onDragEnter`/`onDragLeave` com contador; miniaturas das páginas do PDF
  (`pdfjs-dist` legacy no cliente) com seleção por clique no lugar do campo "PDF pages".

### M6 — Planta do arquiteto por baixo (1–2 sessões, depende das miniaturas de M5)

- Página do PDF como `<image>` no `PlanCanvas` a 35 % de opacidade, calibrada por dois pontos (clicar em dois
  cantos conhecidos e digitar a distância) → `draft.$underlay = { file, page, scale, offset, rotation }`
  (prefixo `$` para o CLI ignorar); toggle e opacidade na barra da planta. É o item de maior valor para a
  revisão: a confiança baixa da IA passa a ser conferível na tela.

### M7 — Extração honesta (1 sessão)

- Antes de pagar: "These N pages will be sent" com miniaturas e custo estimado (calibrar com as duas leituras
  reais: 21 k entrada / 70 k saída ≈ US$ 1,50); `pages` por arquivo.
- Progresso real e cancelamento: a action grava progresso (`text_delta` contados) num arquivo temporário por
  job e o cliente consulta por action a cada 5 s (sem `/api/*`, regra do doc); `AbortController` no
  `client.ts`; botão Cancel; job em `localStorage` para o reload retomar a espera.

### M8 — Desempenho da checagem (meia sessão)

- `panels.service.check` chama `panelizeProject` (painéis + avisos) sem gerar SVGs/CSVs; abortar pedido em
  voo ao mudar a revisão; medir com a leitura de 28 paredes. No cliente, memoizar `planGeometry` por parede
  (hash do `DraftWall`) para o arraste não refazer `frameWalls` das outras.

### M9 — PDF e impressão (1 sessão, antes do piloto na fábrica)

- `@resvg/resvg-js` no service (previsto em S17): "Download PDF" com todas as folhas (carta paisagem, rodapé
  "x de y") e a planta; `window.print()` continua como fallback.

### M10 — Testes de interação (1 sessão)

- `jsdom` + `@testing-library/react` no vitest do web: `CommitInput` (Enter + blur = um commit), atalhos (foco
  em botão não apaga), `use-project-check` (resposta velha descartada), arraste por pointer events, persist/
  resume, navegação de folhas, `done` da barra de passos. Playwright depois da S22.

Itens já adiados em `04-decisoes` (catálogo editável, parede com dois cliques, mover parede inteira, DXF,
blocking desenhado, seleção múltipla) continuam depois da S22; a quebra manual de painel (A12/P37) entra
junto com o catálogo, porque muda o formato do projeto.

## Verificação (para cada sessão do plano)

- `pnpm test` e `pnpm typecheck` verdes; `next build` limpo.
- Teste de contraste (M1) verde; conferência visual no browser embutido em 1280 px e 375 px com a 28x40, o
  Ringgold solto e a leitura gravada `ringgold-st-multifamily-reading.json` (28 paredes): seleção distinta de
  aviso, badges legíveis, foco visível, Fit animado, resume após F5, voltar ao editor pela barra de passos,
  BOM na tela batendo com `bom.csv`, clique na planta abrindo a folha, pinch-zoom em tablet.
- Atualizar `docs/10-design.md` (tokens, componentes, motion) e `docs/03-sessoes.md` (marcar S20; registrar
  M1–M10 como subitens antes/depois da S22 — o humano decide a ordem em relação à S22).
