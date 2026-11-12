# Issues por causa — desenho (2026-11-12)

Aprovado pelo humano na conversa de 2026-11-12 ("Sim, esse desenho"), a partir do projeto real Matilda Pines.
O que ele decidiu está marcado **[humano]**; o que eu preenchi está marcado **[proposta]** e pode ser trocado.

## Por quê

Quem revisa a leitura no passo 02 não consegue resolver as issues sozinho. Na Matilda (44 paredes, 31 aberturas) a
aba Issues mostra **50** itens, mas são **4 causas**: dentro de cada tipo, todas as ocorrências têm os mesmos valores.

| A lista mostra | Causa real |
|---|---|
| 10 `HEADER_OUT_OF_TABLE` | o prédio tem 50' de largura; a tabela do IRC para em 36' |
| 18 `FLAT_HEADER_CRIPPLES` | portas internas (tipos A, B, C) com a peça deitada a 24 1/8" da top plate |
| 18 `DOOR_RO_HEIGHT_MISMATCH` | as mesmas 18 portas: RO de 82 1/2", header a 81 1/2" |
| 4 `STUDS_OVERLAP` | o mesmo encontro de studs; a fábrica resolve na bancada |

Três coisas atrapalham hoje (`issue-groups-list.tsx`, `issue-help.ts`, `inspector.tsx`):
1. O número (50) e os chips (até 18 por grupo) contam ocorrências, não decisões a tomar.
2. O clique num chip seleciona a parede ou a abertura, mas o campo que resolve fica numa seção recolhida ou fora da
   tela ("Header and studs" é a última seção da abertura). Grupo com mais de 12 itens mostra chip por parede, não
   por abertura. Cerca de 60 dos 95 tipos de issue não têm texto de "como resolver".
3. Cada ocorrência é resolvida uma a uma: 18 portas = 18 edições iguais. Aviso aceito não sai da lista.

## Objetivo, fora do objetivo, o que não pode acontecer

**Objetivo:** o revisor abre a aba Issues, vê quantas decisões tem a tomar, e resolve cada uma sem procurar o campo
e sem repetir a mesma edição.

**Fora do objetivo (pedidos seguintes do humano, cada um com o seu desenho):** o motor listar todas as aberturas
com erro de uma parede (hoje só a primeira); sugestão de resolução por IA; a leitura trazer o header do estrutural;
quebra de linha dos avisos na folha.

**Não pode acontecer:**
- Um aviso sumir da folha do painel ou do `panels.csv` porque foi marcado como revisado no app — a fábrica vê tudo.
- Um conserto ser aplicado sem um clique do humano, ou mudar o framing sem dizer que muda.
- Um problema que trava a geração ficar recolhido, ser marcável como revisado ou sair da contagem.
- Motor ou CLI mudarem: tudo aqui é `packages/web`.

## Abordagens consideradas

- **A — Uma linha por causa, com conserto em grupo e "revisado"** (escolhida **[humano]**). Reduz 50 para 4 e
  resolve 18 portas com uma edição.
- **B — Só um botão para esconder avisos.** Mais simples, mas esconde sem resolver: o engenheiro continua com 18
  edições e a lista continua contando ocorrências. Rejeitada.
- **C — Um formulário dentro de cada issue.** Duplicaria o painel de propriedades inteiro na lista. Rejeitada; o
  clique leva ao campo que já existe.

## O desenho

Esboço da aba Issues da Matilda depois da mudança (textos do app em inglês):

```
Issues  4     1 to fix · 2 to review · 1 fine to leave

MUST FIX
✖ Header outside the IRC table · 10 walls
  The building is 50' wide, outside IRC table R602.7(1).
  [Set header by type: E2 · F · E1 · J1 · A]      Show openings ▸

TO REVIEW
⚠ 18 interior doors (types A, B, C): flat header 24 1/8" below the top plate
  [Set a header for all 18]  [Mark as reviewed]   Show openings ▸
⚠ Same 18 doors: RO height 6'-10 1/2", header at 6'-9 1/2"
  [Fix in door types A, B, C]  [Mark as reviewed] Show openings ▸

FINE TO LEAVE (1) ▸
```

### 1. Lista por causa (contagem, níveis, frase-resumo)

- **Uma linha por causa [humano].** Causa = a família da issue, que já é a chave do grupo de hoje (`groupKey`: o
  `kind` do editor ou o código do motor/leitura) **[proposta]**. Não se subdivide por valores: a linha continua uma
  só quando as ocorrências divergem, e a frase-resumo muda (abaixo).
- **Contagem por causa [humano].** O número da aba e o resumo do topo contam linhas, separados em três níveis:
  - **Must fix** — severidade `problem` (trava "Generate").
  - **To review** — avisos que pedem uma decisão.
  - **Fine to leave** — avisos que a fábrica resolve sem decisão do revisor; seção recolhida por padrão.
    Conjunto inicial **[proposta]**: só `STUDS_OVERLAP` (o único cuja ajuda já diz "Fine to leave" sem condição).
    O nível é um campo explícito por código, não lido do texto da ajuda.
- **Chip do topo [proposta]:** "N to fix" passa a contar causas ("1 to fix"), com o número de paredes no `title`;
  o selo de avisos conta só as causas "To review".
- **Fora da aba Issues [proposta]:** só "Must fix" e "To review" contam nos contadores da lista de paredes, na cor
  da parede na planta e no topo. "Fine to leave" (e, depois da S50, o que foi revisado) não acende parede nem conta,
  mas continua aparecendo no aviso do topo do inspetor da parede/abertura, com a etiqueta do nível.
- O parâmetro do erro de header não traz o limite da tabela (36'): a frase cita a largura do prédio e a tabela, não
  o limite (o motor não muda aqui).
- **Frase-resumo por causa [humano].** Uma frase com os valores que todas as ocorrências têm em comum (parâmetros
  iguais em todos os itens) e, quando a issue é de abertura, os tipos (tags) envolvidos. Quando os valores divergem,
  a frase cai para a genérica de hoje (`help.what`) com a contagem. Modelos escritos para as famílias da tabela
  acima e para as do editor que já têm ajuda; as demais usam a genérica **[proposta]**.
- **Chips sempre por abertura** quando todos os itens têm abertura (cai o limite de 12) **[humano]**; até 6 chips
  aparecem direto, acima disso ficam atrás de "Show openings (N)" **[proposta]**.
- **Frase de lista parcial [humano]:** enquanto houver problema e a checagem tiver montado alguma parede, uma linha
  no fim: "Walls with a problem are not framed yet — they may add warnings once fixed."

### 2. Clique que leva ao campo

- **Cada família sabe qual campo a resolve [humano].** Um mapa família → alvo (`opening` / `wall` / `project` +
  nome do campo). Alvos iniciais **[proposta]**: header (`HEADER_OUT_OF_TABLE`, `FLAT_HEADER_CRIPPLES`,
  `FLAT_HEADER_SPAN`, `HEADER_TOO_THICK`, `opening.headerMark`) → campo "Header" da abertura; alturas
  (`DOOR_RO_HEIGHT_MISMATCH`, `HEADER_ABOVE_TOP_PLATE`, `SILL_NO_ROOM`, `HEADER_NO_ROOM_FOR_JACK`) → "Top of RO";
  posição (`OPENING_NEAR_CORNER`, `OPENING_AT_TEE`, `OPENING_NUDGED`, `OPENINGS_TOO_CLOSE`, `OPENING_OFF_PLATE`,
  `OPENING_OUT_OF_WALL`, `opening.position`) → posição; tamanho/tipo (`opening.size`, `opening.type`,
  `opening.tag`) → os campos correspondentes; parede (`wall.height`, `wall.section`, `wall.exterior`,
  `wall.bearing`, `wall.wallType`, `wall.floorsSupported`, `STUD_LENGTH_MISMATCH`, `STUD_HEIGHT_ABOVE_LIMIT`) → o
  campo da parede; projeto (`WIND_SPEED_MISSING`, `SPECIES_NOT_IN_TABLE`, `config.*`, `PANEL_OVERWEIGHT`) → o campo
  em Project settings. Família sem alvo: seleciona a parede/abertura como hoje.
- **O clique [humano]:** seleciona o item, abre a seção que contém o campo, rola até ele, põe o cursor nele e o
  destaca por um instante (respeitando `prefers-reduced-motion`). Vale para chip, título da linha e linhas de
  "Details".
- **Mecanismo [proposta]:** a ação `select` do editor ganha um `focus` opcional (campo + contador, para o mesmo
  clique repetido funcionar); o inspetor reage num efeito, usando os `id` que os campos já têm (`o-<id>-hby`…).
- **"Como resolver" para toda família [humano].** Escrever `what`/`fix` para as ~60 que faltam, citando o campo pelo
  nome que aparece na tela. Um teste passa a exigir ajuda para todo código de `WARNING_CODES`, `ENGINE_ERROR_CODES`,
  dos avisos da leitura e dos `kind` do editor.

### 3. Conserto em grupo

Um botão na linha aplica a mesma edição a todas as aberturas da causa, num passo só de desfazer (Ctrl+Z) **[humano]**.
Conjunto inicial **[proposta]**; os três consertos rápidos de hoje (vento, altura de header, abertura que faltou)
continuam:

- **"Set header"** — `HEADER_OUT_OF_TABLE`, `FLAT_HEADER_CRIPPLES`, `FLAT_HEADER_SPAN`. Pede seção, plies e,
  opcional, jacks por lado (vazio = 1, o padrão do motor para header do projeto). Escopo: as aberturas **listadas
  na linha** — todas, ou por tipo (tag) quando há mais de um. Aplica gravando `header` direto em cada abertura
  **[proposta]**. Não usa o header schedule: uma entrada do schedule exige jacks **e kings**, e os kings dela
  substituiriam os da tabela de vento (R602.7.5) nas paredes externas — mudaria o framing sem avisar.
- Como o motor hoje lista só a primeira abertura com erro de cada parede, o conserto em grupo só fica completo
  depois da sessão do motor que lista todas (ver "Sessões"): por isso ela vem antes.
- **Altura de porta × header** — `DOOR_RO_HEIGHT_MISMATCH`. Dois botões, porque só o humano sabe qual medida vale:
  "Use the header height as the door RO height" (muda `roughHeight` dos tipos de porta envolvidos; **não muda o
  framing**) e "Raise the header to the door RO height" (muda `headerHeight` das aberturas; **muda o framing** — o
  botão diz isso). Na Matilda a segunda opção também tira os 18 avisos de peça deitada (o vão cai para 23 1/8").
- Depois de aplicar, a linha some sozinha quando a checagem seguinte não trouxer mais a issue; nada é marcado à mão.

### 4. "Mark as reviewed"

- Só para avisos (níveis To review e Fine to leave) **[humano]**. Problema nunca.
- Marca as ocorrências daquela linha naquele momento. A linha vai para a seção recolhida "Reviewed (N)" no fim, com
  "Undo review". Grava com o projeto **[humano]**.
- **Identidade [proposta]:** por ocorrência — código + parede + abertura + assinatura dos parâmetros. Se a medida
  mudar ou surgir uma porta nova com o mesmo aviso, a linha volta para "To review" só com as ocorrências novas
  ("+ 17 reviewed").
- **Onde grava [proposta]:** chave `$reviewedIssues` na raiz do arquivo do projeto, como o `$underlay` e o
  `$reviewed` das paredes (o CLI ignora chaves com `$`; conferido: chaves `$` da raiz sobrevivem ao salvar e não
  vão para a checagem do motor, então marcar não refaz a checagem). Não grava quem nem quando.
- **Fora da aba [proposta]:** o que foi revisado deixa de contar na lista de paredes, na planta e no topo; no
  inspetor da abertura/parede o aviso continua, apagado, com "Reviewed" e "Undo review".
- A folha do painel e o `panels.csv` continuam trazendo o aviso **[humano]**.

## Restrições

- Só `packages/web`. `packages/core` e `packages/cli` não mudam.
- Textos da tela em inglês; docs do projeto em português.
- Segue `docs/10-design.md` (tokens, shadcn/ui, variantes em uso); atualizar o §4 "Workspace do editor".
- Uma sessão = um item de `docs/03-sessoes.md`, com teste antes do código, `pnpm check` e
  `pnpm --filter web build` antes do commit, sem `prettier --write` no repo.

## Sessões (ordem)

1. **S46 — Lista por causa** (§1).
2. **S47 — Clique que leva ao campo e "como resolver" para toda família** (§2).
3. **S48 — Motor lista todas as aberturas com erro de uma parede.** Fora deste documento (muda `packages/core`;
   desenho próprio, explicado antes de implementar). Entra aqui na ordem **[proposta]** porque o conserto em grupo
   depende de a linha listar as 13 aberturas, não 10.
4. **S49 — Conserto em grupo** (§3).
5. **S50 — "Mark as reviewed"** (§4).

**Aceite.** Testes automáticos usam um projeto pequeno e inventado que reproduz as quatro causas (o projeto real do
cliente não entra no repositório) **[proposta]**. A conferência na tela usa a planta salva da Matilda, numa cópia em
`out/matilda/` (pasta ignorada pelo git). No fim da S46 a aba Issues mostra 4 linhas (1 to fix · 2 to review · 1 fine
to leave). No fim da S50, com os dois avisos de porta marcados como revisados, mostra 2 linhas e "Reviewed (2)".

## Fica com quem constrói

- Nomes de tipos, funções e arquivos; como dividir `issue-groups-list.tsx` se ele crescer.
- O texto exato das frases-resumo e das ~60 ajudas (inglês, tom do app).
- O visual do destaque do campo e das seções recolhidas, dentro do `docs/10-design.md`.
- Como abrir uma seção do inspetor por fora (hoje são `<details>` não controlados) e de onde sai a lista dos `kind`
  do editor para o teste de cobertura da ajuda (hoje são textos soltos em `problems.ts` e `geometry.ts`).

## Achado fora do escopo

O botão "Add mark" do header schedule (`catalog-editor.tsx`) cria a entrada só com seção e plies; o parser do CLI
exige também jacks e kings e recusaria o projeto. Não é tocado aqui; fica anotado para uma correção própria.
