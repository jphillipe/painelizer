# 09 — Checkpoint 3: casa inteira na fábrica

Roteiro da visita (sem Claude). Preparado em 2026-10-14. O que levar, o que montar, o que anotar e como a
resposta volta para o repositório. As perguntas gerais continuam em `07-perguntas-fabrica.md`; a lista de
hipóteses em vigor, em `08-revisar.md`.

## O que levar

Gerar na véspera (a pasta `out/` não vai para o git):

```bash
pnpm panelizer build packages/cli/examples/house-28x40.json --out out/checkpoint-3/house-28x40
```

```bash
pnpm panelizer build packages/cli/examples/ringgold-checkpoint.json --out out/checkpoint-3/ringgold
```

| Projeto | Entrada | Saída | Painéis | Peças (a cortar) | Avisos |
|---|---|---|---|---|---|
| Casa 28x40 (visão) | `packages/cli/examples/house-28x40.json` — a mesma entrada do fixture `house-28x40` | `out/checkpoint-3/house-28x40/` | 12 | 234 | nenhum |
| 26 Ringgold St (4 painéis do 1º pav.) | `packages/cli/examples/ringgold-checkpoint.json` | `out/checkpoint-3/ringgold/` | 4 | 97 | 2 × `HEADER_JACKS_BELOW_TABLE` na S2 (P30) |

Imprimir, em cada pasta: `plan.svg` (só a 28x40 tem planta), `panels/*.svg` (uma folha por painel, abre e
imprime no navegador), `panels.csv` (resumo), `cutlist.csv` e `bom.csv`. O Ringgold não é a casa inteira: são
os 4 painéis lidos da planta do arquiteto no Checkpoint 2, porque o estrutural da SAB (headers, altura de
parede, espécie — P27 a P31) não está no repositório. A casa inteira do início ao fim é a 28x40.

Alturas de abertura em cada projeto: 28x40 = padrão da fábrica (topo de todo RO a 82 1/2", P2; janelas de 48"
ficam com peitoril a 34 1/2"); Ringgold = schedule A-800 por tag + peitoril da A-200, topo derivado (ver item 10).

Observações sobre as listas, para não gerar divergência falsa:
- **"N peças"** no cabeçalho da folha, na lista da margem e em `panels.csv` conta peças a cortar: header de
  2 plies = 2 peças. O resumo que o CLI imprime no terminal (`227 peças`) conta members (header = 1).
- **`bom.csv` é um teto**: cada peça de corte sai de uma peça comercial própria, a menor em que cabe, sem
  aproveitar sobra (decisão de 2026-09-28). Por isso o 2x6 de 8' aparece com 58% de sobra: são cripples,
  blocos, sills e headers de 36"–41", um por peça de 8'. A fábrica deve dizer se compra assim ou se nesta.

## O que montar

Três painéis da 28x40 que, juntos, cobrem tudo que a Fase 3 introduziu: canto que atravessa, canto que
encosta, lap da double top entre vizinhos, T com ladder, porta com corte na obra.

| Painel | Peças | O que ele testa | Folha |
|---|---|---|---|
| **1-W01-P1** | 14 | Canto noroeste que **atravessa** (W01 é a mais longa, P21): stud flat de canto em x=1 1/2" (centro em 4 1/4" na cadeia), double top recuada 5 1/2" na quina e avançando 24" sobre a P2 (lap encurtado porque 48" cairia no header da porta, P23) | `panels/1-W01-P1.svg` |
| **1-W01-P2** | 22 | Vizinho da P1: recebe o lap de 24"; porta P1 (RO 38" × 82 1/2", header 2-2x10, bottom plate cortada na obra); **T da W05** em x=121"–124 1/2" com 3 blocos 2x6 deitados (centros 24/48/72, P22) e a double top cortada na faixa (duas peças, 97" + 67 1/2"); avança 48" sobre a P3 | `panels/1-W01-P2.svg` |
| **1-W04-P2** | 13 | Mesmo canto noroeste, do lado que **encosta**: layout contado da quina (origem −5 1/2", P21), double top avançando 5 1/2" sobre a W01 (P5/S14) | `panels/1-W04-P2.svg` |

Montagem no chão, como na obra: W04-P2 encostando na W01-P1 no canto (0,0) da planta, W01-P2 em seguida.
Se der tempo, um quarto painel com janela: **1-W02-P1** (janela J2, sill, cripples abaixo, avanço de
5 1/2" no canto sudeste que encosta e 24" para a P2).

## O que anotar em cada painel

Marcar na folha, a lápis, só o que diverge. Para cada divergência: qual peça, o que a folha diz, o que a
fábrica fez e por quê (regra deles ou preferência).

1. **Layout** — o stud ficou centrado na marca de 16" (borda em 15 1/4") ou com a borda na marca? (P19)
   Na W04-P2, a marca zero é a quina do prédio ou a ponta da plate? (P21)
2. **Canto** — a parede que atravessa é a que a fábrica escolheria? O stud flat de canto é assim (california)
   ou three-stud? (P5, P21)
3. **Double top plate** — o avanço de 48" (24" na W01-P1) sai preso ao painel ou a peça vai solta? Nos cantos,
   o lap de 5 1/2" é feito na fábrica ou na obra? (P23)
4. **T** — 3 blocos deitados nas alturas 24/48/72 ou outra coisa (backer, blocos em pé, 2 blocos)? Stud de
   ponta da W05 normal? (P22)
5. **Header e cripples** — cripple curto de 2 3/8" acima do header 2x10 da porta: a fábrica faz, troca por
   bloco deitado, ou sobe o header até a plate? (P20) Header 2-2x10 com spacer de OSB de 1/2" entre os plies
   (Horace) ou sem spacer? Isso é material que não está na BOM.
6. **Divisão em painéis** — W01 em 12' + 12' + 16'-5 1/2": a fábrica dividiria assim? Onde prefere a quebra:
   múltiplo de 48", longe da abertura, mais perto dos terços? (P35) Peso máximo que a mesa e o caminhão aceitam
   (P15) e a densidade que usam para estimar (P8).
7. **Emendas de plate** — W01-P3 (bottom 176" + 21 1/2", top 144" + 53 1/2") e W05-P1 (double top
   125" + 120 1/2"): a posição das emendas serve? (P36, P14)
8. **Folha** — a vista de fora (face externa para o leitor, x=0 à esquerda) é a que o montador quer na mesa?
   Falta alguma cota? Sobra alguma? (P24) A cadeia do rodapé (centro de cada peça a partir de x=0) é a
   referência que eles marcam na plate?
9. **Ringgold S2** — porta e janela com 8 1/4" entre os RO: o motor pôs 1 king da porta e 2 kings da janela
   com 3/4" de ar; a fábrica compartilha king, põe calço, ou pede para mover a abertura? (P30, P16) E os dois
   avisos de jacks abaixo da tabela: eles seguem a R602.7(1) ou o estrutural? (P31)
10. **Altura das aberturas** — na 28x40 todo RO tem o topo a 82 1/2" do subfloor (padrão da fábrica, P2); não
    há schedule porque a casa é a da visão. No Ringgold a altura vem do schedule A-800 por tag (`openingTypes`)
    mais o peitoril da elevação A-200 (1'-11 3/4"), e o motor deriva o topo do RO: 96 1/4" (P28). Perguntar: quando
    o arquiteto dá peitoril **e** altura de head (como o Matilda, "HEAD ABV SUBFL" por janela), qual dos dois a
    fábrica segue se o RO não fecha? Hoje o motor usa o peitoril e deriva o head; o head explícito por abertura
    (`headerHeight`) manda quando é dado.

## Como a resposta volta

1. Cada painel montado vira `packages/core/test/fixtures/real-<id>.json` (mesma entrada do painel, `expected`
   transcrito do painel físico: peças, posições, comprimentos). Fixture é a verdade: se o motor divergir, muda
   o motor.
2. Cada resposta vira uma linha em `05-pendencias.md` (pendência fecha, com a resposta) e uma linha datada em
   `04-decisoes.md`. Depois `pnpm hipoteses` regenera `08-revisar.md` com o que ainda falta e onde mexer.
3. Divergência que muda regra de framing é uma sessão nova em `03-sessoes.md` (abordagem explicada antes de
   editar, como manda CLAUDE.md). Só depois disso começa a Fase 4.
