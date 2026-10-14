# 09 — Checkpoint 3: casa inteira com hipóteses

Checkpoint interno, feito em 2026-10-14. A fábrica não responde por enquanto (decisão de 2026-10-13), então o
critério é: a casa inteira roda do início ao fim, as folhas, a planta e as listas fazem sentido para quem lê, e
fica registrado o que a casa exercita de cada hipótese. Nenhum fixture `real-*`; os sintéticos continuam sendo
a verdade. A lista do que revisar quando alguém responder é `08-revisar.md`.

## O que foi gerado

```bash
pnpm panelizer build packages/cli/examples/house-28x40.json --out out/checkpoint-3/house-28x40
```

```bash
pnpm panelizer build packages/cli/examples/ringgold-checkpoint.json --out out/checkpoint-3/ringgold
```

| Projeto | Entrada | Painéis | Peças a cortar | Avisos |
|---|---|---|---|---|
| Casa 28x40 (visão), casa inteira | `packages/cli/examples/house-28x40.json` — a mesma entrada do fixture `house-28x40`, com nome, data, revisão e norte | 12 | 234 | nenhum |
| 26 Ringgold St, 4 painéis do 1º pav. | `packages/cli/examples/ringgold-checkpoint.json` | 4 | 97 | 2 × `HEADER_JACKS_BELOW_TABLE` na S2 (P30) |

Em cada pasta de `out/checkpoint-3/` (fora do git): `plan.svg` (só a 28x40), `panels/<id>.svg`, `panels.csv`,
`cutlist.csv`, `bom.csv`. Relatório em PDF: `out/checkpoint-3/relatorio-checkpoint-3.pdf` (fonte `.html` ao lado).
O Ringgold segue com 4 painéis porque o estrutural da SAB (P27–P31) não está no repositório.

## Alturas das aberturas

Três fontes, nesta prioridade: `headerHeight` na própria abertura > schedule do projeto por tag
(`config.openingTypes`, com `sillHeight` e RO do fabricante; topo do RO derivado = peitoril + RO) > padrão da
fábrica (`config.headerHeight` = 82 1/2", resposta P2). Porta mede o RO do subfloor e ignora peitoril (P4).

- **28x40**: padrão de 82 1/2" nas 7 aberturas. Não há schedule porque a casa é a de `00-visao.md`. Janelas
  de 48" ficam com peitoril a 34 1/2".
- **Ringgold**: schedule A-800 por tag (A2, porta 1 HM, porta U2) + peitoril 1'-11 3/4" da elevação A-200.
  Janela A2: RO 58 1/2" × 72 1/2", peitoril 23 3/4", topo do RO 96 1/4" (P28). Portas com 82 1/2" explícito.

Quando o arquiteto dá peitoril **e** head por janela (Matilda: "HEAD ABV SUBFL" e "SILL ABV SUBFL" por
janela, variando por pavimento) e o RO não fecha a conta, o motor usa o peitoril e deriva o head; head
explícito por abertura manda. Fica como hipótese junto com P32 (RO = esquadria + 1/2" × + 3/4").

## O que cada painel exercita

| Painel | Peças | Hipóteses em jogo |
|---|---|---|
| 1-W01-P1 | 14 | Canto NO que atravessa (W01 é a mais longa, P21); stud flat de canto em x=1 1/2"; double top recuada 5 1/2" na quina e avançando 24" sobre a P2, lap encurtado porque 48" cairia no header da porta (P23); layout centrado na marca (P19) |
| 1-W01-P2 | 22 | Recebe o lap de 24"; porta P1 (RO 38" × 82 1/2", header 2-2x10, bottom plate cortada na obra); T da W05 em x=121"–124 1/2" com 3 blocos deitados em 24/48/72 (P22) e double top cortada na faixa (97" + 67 1/2"); cripple curto de 2 3/8" sobre o header (P20); avança 48" sobre a P3 |
| 1-W01-P3 | 27 | Janela J1; emendas de plate sobre stud, bottom 176" + 21 1/2" e top 144" + 53 1/2" (P36, P14); canto SE que atravessa |
| 1-W02-P1 / 1-W04-P1 | 25 | Lado que encosta no canto: layout contado da quina (origem −5 1/2", P21), double top avançando 5 1/2" (S14); janela com sill e cripples |
| 1-W04-P2 | 13 | Encosta no canto NO (0,0), fechando o trio com W01-P1 e W01-P2 |
| 1-W05-P1 | 23 | Interna 2x4 portante; T na W01; double top 125" + 120 1/2" emendada; porta P3 |
| W01 inteira | — | Divisão 12' + 12' + 16'-5 1/2": menor número de painéis ≤ 240", quebras em múltiplo de 48" (P35) |
| Ringgold 1-S2-P1 | 27 | Porta e janela com 8 1/4" entre os RO: 1 king da porta e 2 da janela com 3/4" de ar (P30, P16); 2 avisos de jacks abaixo da tabela (P31); parede de 9'-1 1/8" (P27) |

Todas as folhas são vista de fora, x=0 à esquerda, face indicada no topo (P24). Peso só da madeira, tabela
fixa (P8), sem limite de peso na divisão (P15).

## Leitura das listas

- **"N peças"** no cabeçalho da folha, na lista da margem e em `panels.csv` conta peças a cortar: header de
  2 plies = 2 peças. Corrigido neste checkpoint: o cabeçalho contava o header como 1 e a mesma folha mostrava
  dois números. O resumo do CLI no terminal (`227 peças`) continua contando members.
- **`bom.csv` é um teto**: cada peça de corte sai de uma peça comercial própria, a menor em que cabe, sem
  aproveitar sobra (decisão de 2026-09-28). Por isso o 2x6 de 8' aparece com 58% de sobra: 47 peças de 8' para
  cripples, blocos, sills e headers de 36"–41". Otimização de corte fica fora da v1.

## Conferência feita

- `pnpm test` (588 no core + 112 no CLI) e `pnpm typecheck` verdes.
- Planta e 8 folhas renderizadas em PNG (Chrome headless) e conferidas pelo Claude: 1-W01-P1, 1-W01-P2,
  1-W02-P1, 1-W03-P3, 1-W04-P2, 1-W05-P1, Ringgold 1-S2-P1 e `plan.svg`. Geometria, laps e cotas coerentes com
  S14 e S15. Cosmético: no rodapé da 1-W03-P3 as marcas 144" e 148" ficam encostadas.
- Conferência humana: a critério do humano, pelos PNGs em `out/checkpoint-3/png/`.

## Quando alguém responder

1. Resposta vira linha em `05-pendencias.md` (pendência fecha) e em `04-decisoes.md`; `pnpm hipoteses`
   regenera `08-revisar.md` com o que ainda falta e onde mexer.
2. Painel real, se um dia houver, vira `packages/core/test/fixtures/real-<id>.json`. Fixture é a verdade: se o
   motor divergir, muda o motor.
3. Mudança de regra de framing é sessão nova em `03-sessoes.md`, com a abordagem explicada antes de editar.
