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
| gold-600 | `#A2782B` | eyebrow em fundo papel, hover do acento |
| **paper** | `#F6F4EE` | **fundo de página** |
| paper-2 | `#EFEBE1` | fundo secundário, cards em fundo papel |
| paper-3 | `#E7E1D3` | muted, separadores grossos |
| white | `#FCFBF7` | cards sobre papel quando precisam contrastar |
| **ink** | `#152238` | **texto** |
| ink-2 | `#43506A` | texto secundário |
| ink-3 | `#6B7890` | texto terciário, placeholders |
| muted | `#505D6C` | legendas |
| line | `rgba(16,36,65,.16)` | bordas |
| line-faint | `rgba(16,36,65,.07)` | divisórias finas |
| line-strong | `rgba(16,36,65,.34)` | bordas de input em foco sem anel |
| ok | `#2E7D4F` | sucesso |
| err | `#B3402A` | erro, destrutivo |
| warn | `#A2782B` (gold-600) | aviso: dourado escuro, não amarelo genérico |

Fundo de página é sempre papel; branco puro não existe. Modo escuro: **não nesta fase** (sem `.dark`).

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
--success     ok           (token extra, Badge/Alert "success")
--warning     gold-600     (token extra, Badge/Alert "warning")
--border      line         --input line         --ring gold-300
--radius      3px
```
Tailwind v4: tudo em `@theme inline` como `--color-*`, mais `--font-sans`, `--font-display`, `--font-mono`
e `--shadow-1`, `--shadow-2`. Classes utilitárias usam só esses nomes (`bg-primary`, `text-accent`…); nunca
hex solto em componente.

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
- Transições 200ms `cubic-bezier(.22,.61,.2,1)`; nada anima por mais de 300ms no app.

## 3. Componentes (shadcn/ui, só os usados)

| Componente | Variantes e regras |
|---|---|
| Button | `default` navy pill (texto papel); `accent` gold pill (texto navy) para a ação principal da tela; `outline` borda line; `ghost`; `link` navy com "↗" quando abre outra página. Altura 40px, texto 15px/600. Loading: spinner + texto no passado contínuo ("Generating…"). |
| Card | fundo white, borda line, raio 3px, shadow-1; `CardHeader` com eyebrow opcional. |
| Tabs | sublinhado gold de 2px na ativa; texto 14px/600. |
| Table | cabeçalho 13px uppercase ink-3; linhas com borda line-faint; números alinhados à direita em mono. |
| Badge | `success` ok, `warning` gold-600, `destructive` err, `outline`; texto 12px/600 mono para códigos. |
| Alert | `default` (info, borda navy), `destructive` (err), `warning` (gold-600). Mensagem do motor em `<pre>` mono dentro do Alert. |
| Form, Input, Textarea, Select, Checkbox | sempre via `Form` do shadcn com react-hook-form; erro de campo em err 13px abaixo do campo; Textarea de JSON em mono 13px. |
| Dialog | shadow-2, raio 3px; só para confirmações. |
| Separator, Skeleton, Sonner | padrão. Toast só para resultado de ação assíncrona longa. |

Estados obrigatórios em toda tela de resultado: **vazio** (texto ink-3 e a ação sugerida), **carregando**
(Skeleton no lugar do conteúdo; na extração, "This can take a few minutes."), **erro** (Alert destructive),
**aviso** (Alert warning, nunca escondido num accordion), **sucesso** (resumo em uma linha + conteúdo).

## 4. Layout

### App shell
- Header 64px, fundo navy-900, texto papel: logotipo "Panelizer" (Barlow 600) + "· National Lumber" (ink
  claro), nav à direita ("Viewer", "Extract", depois "Projects"). Link ativo com sublinhado gold.
- Conteúdo: `max-w-[1200px]`, gutter do site, padding vertical 32px. Telas de trabalho em grid 2/5 + 3/5
  (entrada à esquerda, resultado à direita); abaixo de 1024px vira uma coluna.
- Rodapé mínimo: versão, "National Lumber · WR Group".

### Landing (futura, não implementar agora)
Mesmos tokens. Hero em navy-950 com eyebrow gold-300, h1 display em papel, parágrafo papel/80, CTA pill gold
+ link papel. Seções alternando papel e navy; cards de 28px com eyebrow numerado em mono ("01 ·", "M-01");
números grandes em Barlow Condensed com unidade em eyebrow. Rotas `/`, `/how-it-works`, `/contact`.

## 5. Rotas

| Rota | Conteúdo | Sessão |
|---|---|---|
| `/` | landing; por ora `redirect('/app')` | S20.0 |
| `/app` | visualizador: JSON → painéis | S20.1–S20.2 |
| `/app/extract` | PDF → JSON com IA (ou resposta gravada) | S20.3 |
| `/app/projects`, `/app/projects/[id]` | projetos salvos | S22 |
| `/login` | auth | S22 |

Rotas de API: **nenhuma**. Sem route handlers.

## 6. Folhas e planta na tela

SVG gerado pelo core entra inline (`dangerouslySetInnerHTML`, é código nosso), dentro de Card papel-2, com
`svg { width: 100%; height: auto }`. As folhas mantêm o visual atual (não passam pelo tema; a fábrica lê a
folha, não o site). Impressão: `@media print` esconde `.no-print`, cada `.sheet` com `break-after: page`,
`@page { size: letter landscape; margin: 0.4in }`.

## 7. Arquitetura de requisições (padrão único)

```
componente (client)  →  server action (next-safe-action, zod)  →  service (server-only)  →  core / cli / extract (em processo)
Server Component     →  service                                                           →  ky (HTTP externo: Supabase, APIs)
```

- **Mutações** só por server actions em `src/actions/*.ts` (`'use server'`,
  `actionClient.inputSchema(schema).action(async ({ parsedInput }) => service(...))`). Cliente chama por
  `useAction`. Nunca `fetch` para `/api/*`.
- **Leituras** em Server Components pelo service, passadas como props. Estado no cliente é só de UI.
  Revalidação por `revalidatePath`/`revalidateTag` dentro da action.
- **Services** (`src/services/*.service.ts`, `import 'server-only'`): toda a regra de negócio do app.
  Funções puras ou com `deps` injetáveis, testadas no vitest sem Next. Nenhum componente importa `core`,
  `cli` ou `extract`: só o service. `panels.service` (gerar), `extract.service` (PDF → JSON, resposta
  gravada, checagem da chave), `projects.service` (S22).
- **ky** (`src/lib/http.ts`): instância única (`prefixUrl`, `timeout`, `retry`, hooks que convertem erro
  HTTP em `ServiceError`), usada só dentro de services e só onde há HTTP de verdade. Motor e extração rodam
  em processo. Nunca ky em componente, nunca `fetch` solto.
- **Erros**: `handleServerError` do `actionClient` traduz `ProjectError`, `BuildError`, `ExtractError`,
  `ServiceError` e erros da API em mensagem; problemas de projeto não são erro de servidor, voltam em `data`
  como `{ ok: false, problems }` para a UI listar.
- **Formulários**: schema zod em `src/schemas/*.ts` (compartilhado), `useForm` + `zodResolver` + `Form` do
  shadcn; `returnValidationErrors` para erro de campo. Upload: `FormData` com `z.instanceof(File)`;
  `serverActions.bodySizeLimit` 50 MB.

## 8. Acessibilidade e idioma

`<html lang="en">`. Contraste mínimo 4.5:1 no texto (navy sobre papel 12.6:1; navy sobre gold-btn 6.1:1;
gold-600 sobre papel 4.6:1 — por isso o eyebrow em papel usa gold-600, não gold). Foco visível: anel 2px
gold-300 com offset 2px. Toda ação assíncrona anuncia o resultado (toast ou texto `aria-live`). Tabelas com
`<th scope>`; SVGs inline com `role="img"` e `aria-label` com o id do painel.
