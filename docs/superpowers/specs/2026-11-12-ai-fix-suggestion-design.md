# Sugestão de resolução por IA — desenho (2026-11-12)

Pedido do humano em 2026-11-12: "usar IA para sugerir resoluções das issues, mesmo que gaste créditos, tipo um botão,
sugerir resolução, e já edita automaticamente e a pessoa só aprova". Ele pediu para implementar sem esperar a
aprovação deste documento ("amanhã eu reviso e se não gostar desfaço"). **Tudo aqui é proposta minha** — o que ele
decidiu está marcado **[humano]**.

## Por quê

Depois das S46–S50 a aba Issues mostra uma linha por causa, leva ao campo e resolve em grupo os casos conhecidos. Sobra
o caso em que o revisor não sabe **o que** mudar: a issue descreve um conflito (aberturas coladas, header acima da top
plate, peitoril sem espaço) e várias edições o resolveriam. A IA olha a causa e o trecho do projeto e propõe a edição.

## Objetivo, fora do objetivo, o que não pode acontecer

**Objetivo:** um botão "Suggest a fix" na linha da causa devolve uma proposta — o que mudar, por quê, e o efeito medido
pelo motor — que o revisor aplica com um clique ou dispensa **[humano]**.

**Fora do objetivo (próximo passo, desenho próprio):** a IA olhar os desenhos (as folhas do PDF) para achar o valor que
não está no projeto — por exemplo o header que o estrutural dá para cada abertura. Esta versão só vê o projeto e as
notas da leitura.

**Não pode acontecer:**
- Edição aplicada sem o clique do humano **[humano]**.
- IA dentro do motor: o motor continua determinístico (`CLAUDE.md`). A IA só propõe edições do projeto; quem diz se a
  proposta resolve é a checagem do motor, rodada antes e depois.
- Valor estrutural inventado (seção e plies de header, jacks, kings, neve, largura do prédio, vento, parede
  portante, pavimentos). O prompt proíbe; a tela marca toda proposta que mexe nesses campos com "Structural value —
  confirm with the engineer"; e quando a informação não está no projeto a resposta certa é **nenhuma edição** mais o
  que falta e onde achar.
- Edição fora do vocabulário: a resposta é validada campo a campo; alvo que não existe ou valor inválido é descartado
  e dito na tela.

## Abordagens consideradas

- **A — IA propõe, motor confere, humano aplica** (escolhida). A resposta da IA vira uma lista de `DraftEdit` (a mesma
  da S49); o servidor aplica numa cópia, roda a checagem antes e depois e devolve "resolve N de M, nenhum problema
  novo". O revisor vê o efeito antes de aceitar.
- **B — IA aplica direto e o humano desfaz se não gostar.** Mais rápido, mas edita sem aprovação. Rejeitada.
- **C — Sem IA: mais consertos calculados (como os da S49).** Exato e de graça, e deve continuar crescendo, mas cada
  família precisa do seu conserto escrito à mão; a IA cobre as que ainda não têm. Complementar, não substituto.

## O desenho

- **Onde:** botão "Suggest a fix" nas linhas "Must fix" e "To review" (não em "Fine to leave" nem "Reviewed"),
  desligado enquanto a checagem está atrasada.
- **O que vai para a IA:** a causa (família, título, "o que é" / "como resolver", frase-resumo, até 40 ocorrências com
  parede, abertura, mensagem e parâmetros), o trecho do projeto que ela toca (config sem as chaves do editor, as
  paredes citadas com as aberturas, os tipos de abertura usados) e as notas da leitura por IA, quando o projeto veio de
  uma. Nenhum desenho, nenhum dado de conta.
- **O que volta:** JSON validado por schema: `explanation` (1 a 3 frases), `confidence` (high / medium / low),
  `needsFromHuman` (o que falta e onde achar; vazio quando nada) e `edits` — lista plana
  `{ target, wallId, openingId, tag, field, value }` com um vocabulário fechado de campos.
- **No servidor:** valida e converte para `DraftEdit` (descarta o que não existe ou não é válido), aplica numa cópia,
  roda a checagem do motor antes e depois, e devolve: as edições, a descrição de cada uma em inglês, o efeito
  (ocorrências desta causa antes → depois; famílias de problema e de aviso que **apareceram**), e se mexe em valor
  estrutural.
- **Na tela:** um cartão na linha — explicação, edições, efeito medido, avisos ("confirm with the engineer", "adds a
  new problem") — com "Apply" (um passo de desfazer, pela ação `applyEdits`) e "Dismiss". Sem edições, o cartão diz o
  que falta. Erro da API vira uma frase, sem quebrar a lista.
- **Modelo e custo:** `claude-opus-5-5` (o mesmo da leitura), raciocínio adaptativo, effort `medium`, saída estruturada
  pelo schema, fallback do servidor ligado (`fallbacks: "default"`). Uma chamada por clique, só texto: alguns milhares
  de tokens de entrada e centenas de saída — centavos de dólar, contra ~US$ 1,50 de uma leitura de desenhos.
- **Onde mora o código:** a chamada à API fica em `packages/extract` (`suggest.ts`), o único pacote que fala com a
  rede; o prompt, a validação e a descrição das edições em `packages/web/src/lib/ai/`; a regra (checar antes e depois)
  em `packages/web/src/services/suggest.service.ts`.

## O que fica para quem constrói

Nomes, texto exato do prompt e do cartão, visual dentro do `docs/10-design.md`.
