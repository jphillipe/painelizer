# 00 — Visão do produto

## Em uma frase
Uma ferramenta interna que recebe as paredes de uma casa em light wood frame e devolve as **folhas de fabricação
de cada painel de parede**: desenho em elevação com todas as peças, lista de corte e lista de material.

É o mesmo papel que o MiTek Structure / eFrame Panel cumpre para a parte de paredes. Treliças, análise estrutural
e integração com máquinas ficam fora (ver `01-escopo-v1.md`).

## O fluxo completo (produto final)
1. Usuário sobe a planta (PDF do arquiteto).
2. IA (API do Claude, visão) lê a planta e devolve uma lista de paredes como **sugestão**, com nível de confiança.
3. Usuário confirma/corrige na tela (planta com as paredes por cima).
4. Botão "gerar painéis" chama o **motor** — determinístico, sem IA.
5. Saídas: uma folha por painel (PDF), lista de material consolidada, planta com painéis numerados.

A IA entra em (2), na leitura. Nunca em (4), no cálculo. Motivo: um painel de fabricação precisa estar exato
sempre; modelos de linguagem não garantem isso em geometria. A parte que pode errar é revisada por humano;
a parte que não pode errar é uma função testada.

## Exemplo concreto
Casa térrea 28' x 40', uma parede interna portante.

Entrada (após confirmação humana):
```
W01 externa 40'-0"  porta 3'-0" a 14'-0"; janela 3'x4' a 28'-0"
W02 externa 28'-0"  janelas 3'x4' a 6'-0" e a 18'-0"
W03 externa 40'-0"  porta de correr 6'-0" a 20'-0"
W04 externa 28'-0"  janela 3'x4' a 8'-0"
W05 interna portante 26'-6"  porta 2'-8" a 10'-0"
```

O motor divide paredes longas em painéis transportáveis (ex.: W01 → W01-P1..P4), calcula cada painel e produz:

**Folha W04-P1** (12'-0", 2x6, janela 3'x4' a 4'-0"):
- desenho em elevação: plates, studs a 16" OC, king/jack/header/sill/cripples
- lista de corte: 3 plates 2x6 × 144"; 7 studs 2x6 × 92 5/8"; 2 king 2x6 × 92 5/8"; 2 jack 2x6 × 83 3/8";
  header 2x10 × 39" (2 plies); sill 2x6 × 36"; 2 cripples 2x6 × 33 7/8"

**Lista de material da casa:** 2x6 × 8' × N, 2x6 × 12' × N, 2x10 × 8' × N…

**Planta de painéis:** vista de cima com W01-P1, W01-P2… numerados.

## O que é o "motor"
A função que transforma "parede externa de 144", 2x6, janela 36x48 em 48" na folha acima.
```ts
panelizeWall(wall: Wall, config: Config): Panel
```
Mesma entrada → mesma saída, sempre. Testável sem navegador. É a única parte "nova" do projeto;
upload, IA, tela e banco são trabalho de app web comum.

## Ordem de construção
1. Motor (JSON → lista de corte no terminal)
2. Motor → SVG da elevação
3. Aberturas (porta, janela)
4. IA lendo PDF → JSON de paredes (fluxo ponta a ponta, sem tela)
5. Tela de confirmação (Next.js), login e projetos (Supabase)
