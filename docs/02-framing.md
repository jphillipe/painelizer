# 02 — Framing: glossário, convenções e regras

## Glossário
- **Stud** — peça vertical comum. Espaçada a 16" ou 24" OC. Pré-cortes da fábrica: 92 5/8" (parede de 8') e
  104 5/8" (9'), iguais em 2x4 e 2x6 (P7). `config.studLength` é a lista de pré-cortes do projeto.
- **Plate** — peça horizontal. Bottom plate (base), top plate e double top plate (topo). 1.5" de espessura cada.
- **Rough opening (RO)** — abertura bruta para porta/janela. Maior que a esquadria.
- **King stud** — stud inteiro de cada lado da abertura, do lado de fora do jack.
- **Jack stud (trimmer)** — stud curto encostado no king, do lado de dentro; suporta o header.
- **Header** — viga horizontal sobre a abertura. Seção e nº de plies pela tabela.
- **Sill** — peça horizontal na base da janela (portas não têm).
- **Cripple** — stud curto acima do header ou abaixo do sill, mantendo o layout.
- **OC (on center)** — espaçamento entre studs, de centro a centro (16" entre marcas). Na fita, a marca da
  borda fica em 15 1/4", 31 1/4"… para o stud ficar centrado em 16, 32…
- **Ply** — camada. Header "2 plies" = duas peças lado a lado.
- **Seções nominais → reais:** 2x4 = 1.5 × 3.5; 2x6 = 1.5 × 5.5; 2x8 = 1.5 × 7.25; 2x10 = 1.5 × 9.25; 2x12 = 1.5 × 11.25.

## Convenções do motor (não mudar sem registrar em 04-decisoes.md)
- Unidades internas: polegadas decimais.
- Eixo x: da esquerda para a direita, x=0 no início da parede. Eixo y: de baixo para cima, y=0 na base da bottom plate.
- `Member.x`, `Member.y` = canto inferior esquerdo da peça.
- Layout (S11, hipótese P19): marcas em `wall.layoutOrigin + k·studSpacing` (`layoutOrigin` = x da marca 0 do
  prédio nesta parede; 0 na parede solta, `−t` da parede que atravessa quando esta encosta num canto, negativo
  no painel que começa no meio da parede). Stud **centrado** na marca: borda esquerda em marca − 0.75
  (15.25, 31.25, 47.25…), para a emenda do OSB (48", 96") cair no meio do stud. Primeiro stud sempre em x=0;
  último sempre em x = comprimento − 1.5. Stud de marca que sobrepõe o de ponta ou o fechamento é mantido e
  a validação avisa (`STUDS_OVERLAP`); stud que coincide com o fechamento vira um só.
- Altura padrão de parede: 97.125" (8'-1 1/8") = 3 plates × 1.5 + stud 92.625.
- Parede declara `section` ('2x4' | '2x6'); espessura real (3.5 / 5.5) é derivada, nunca entrada.
- Zona de abertura = [offset − (kings + jacks)·1.5, offset + roughWidth + (kings + jacks)·1.5]. `kingStuds` e
  `jackStuds` são por abertura, default 1 e 1 (zona = RO ± 3"). Kings na borda externa da zona, jacks colados
  ao RO; o header apoia em todos os jacks (comprimento = roughWidth + 2·jacks·1.5).
  Studs de layout cujo intervalo [x, x+1.5] se sobreponha à zona são removidos; o que só encosta no king fica.
- Zonas que se sobrepõem ou se tocam são fundidas; as aberturas compartilham o king entre elas. Entre os dois RO
  ficam os jacks da esquerda, os kings compartilhados (o maior número de kings das duas aberturas; 1 no default)
  colados a esses jacks, eventual folga e os jacks da direita. Cada abertura mantém o próprio header. Com 1 king
  e 1 jack: funde quando os RO distam ≤ 6"; abaixo de 4.5" (jack + king + jack) é erro — P16.
  Fixture: `test/fixtures/wall-144-window-door.json` (janela e porta a 4.5", 24 peças).
- Base do header: `opening.headerHeight` (y) se definido — o projeto manda; senão `config.headerHeight`;
  senão, encostado na face inferior da top plate.
  Topo do RO = base do header. **Padrão da fábrica: 82.5"** do subfloor (= y) à face inferior do header, igual
  para portas e janelas; o projeto pode indicar outra (P2, respondida em 2026-10-01).
- Sill: mesma seção da parede, deitado (1.5" de altura), comprimento = largura do RO.
- Cripples abaixo do sill nos studs de layout que caem inteiros dentro do RO, exceto o colado ao jack ou o que
  o invade (ex.: RO em 48 com jack em 46.5–48: o stud da marca 48, em 47.25–48.75, invade o jack e sai) ou a até
  2" de folga livre dele — confirmado pela fábrica (P3, P13).
  A omissão só vale se o vão livre entre a face do jack e o apoio seguinte (próximo cripple ou o jack oposto)
  ficar ≤ 24"; se passar, o cripple fica. A 16" OC o stud a ≤ 2" sai sempre (vão ≤ 18"); a 24" OC fica sempre.
  O "espaçamento máximo entre apoios" da resposta P13 é hipótese (24"); a fábrica ainda não disse o número.
- Cripples acima do header: mesmas marcas dos cripples abaixo do sill (inclusive as omissões junto ao jack),
  só se houver espaço ≥ 1.5" entre header e top plate. Abaixo do sill vale o mesmo mínimo de 1.5".
- Porta: RO medido a partir do subfloor (y=0), porque a bottom plate é cortada na obra; `roughHeight` é entrada
  e, se diferir da base do header em 1/64" ou mais, aviso `DOOR_RO_HEIGHT_MISMATCH` sem mudar a geometria (P4).
  Porta 6'-8" padrão: RO 82.5, header em 82.5, jack 81. Sem sill e sem cripples abaixo; cripples acima do header
  com a mesma regra da janela.
- Porta: bottom plate sai inteira no painel; o trecho do RO vai em `Panel.fieldCuts` e a folha (SVG) o desenha
  hachurado com "cortar na obra". A lista de corte não muda. Fixture: `test/fixtures/wall-120-door.json` (16 peças).

## Regras e referências (IRC 2021/2024)
| Regra | Ref. | Comportamento |
|---|---|---|
| Espaçamento de studs | R602.3, Tabela R602.3(5) | 16" OC padrão; 24" configurável |
| Altura máx. de stud | R602.3.1, Tabela R602.3(5) | Portante: 10'; não portante: 2x4 14', 2x6 20' (conferir). Acima → aviso `STUD_HEIGHT_ABOVE_LIMIT` |
| Top plate dupla, emendas | R602.3.2 | Emendas defasadas ≥ 24"; lap em cantos e T |
| Headers externos portantes | Tabela R602.7(1) | Entrada: largura da edificação, neve, pavimentos → seção, plies, nº de jacks |
| Headers internos portantes | Tabela R602.7(2) | Idem sem neve |
| Headers não portantes | R602.7.4 | Single flat até 8' |
| King studs | Nota R602.7(1) | Metade dos studs interrompidos vira king (arredondar p/ cima) |
| Fire blocking | R302.11 | Bloqueio horizontal a cada 10' de altura; a fábrica só coloca com cavidade > 120" (P11) → aviso `FIRE_BLOCKING_REQUIRED`; o painel ainda não desenha a peça |
| Cantos e T | Prática da equipe | Default California corner + ladder (P5); 3-stud e stud de encosto configuráveis |

As tabelas do IRC não são reproduzidas aqui (direitos do ICC). Digitá-las em `src/data/irc-headers.json`
é a tarefa da sessão S9, a partir da edição em vigor no estado (Massachusetts adota o IRC com emendas — ver P10).
A tabela assume espécie/grau (#2 DF-L, Hem-fir, SPF, SP); conferir com a madeira comprada.

### Escolha do header pela tabela (S9, `rules/headers.ts`)
`headerFor({ span, exterior, bearing, buildingWidth, groundSnowLoad?, floorsSupported, floorSpan?, wallSection? })`
→ `{ section, plies, jackStuds, maxSpan, table }` | `{ requiresEngineer: true, reason }` | `{ nonBearing: true }`.
- `span` = largura do RO; `buildingWidth` em polegadas, como toda medida do core; neve em psf.
- Não portante: `{ nonBearing: true }`, sem consultar tabela (P17).
- Coluna: menor neve ≥ a pedida e, entre essas, menor largura ≥ a pedida. Nunca interpola. Acima da última
  coluna, pavimentos sem grupo ou vão acima de todos os headers → `requiresEngineer`.
- Sem `floorSpan` ('center' | 'clear'): pior caso entre os grupos com aquele número de pavimentos (menor vão,
  maior NJ).
- Entre os headers que atendem: 2 plies de menor seção; sem 2 plies que atenda, 3 plies, depois 4; 1 ply nunca
  (P17, respondida em 2026-10-05). Com `wallSection`, descarta header com plies·1.5 maior que a profundidade da
  parede (2x4: até 2 plies; 2x6: até 3).
- JSON: vão digitado como no livro, com apóstrofo (`"3'-6"`); célula `[vão, NJ]` ou `null` ("—"). Estrutura
  conferida por `validateHeaderTables`; coerência dos valores por `test/rules/headers-data.test.ts`.

### Header de cada abertura no painel (S9.2, `rules/openingHeader.ts`)
- Ordem: `opening.header` do projeto (`{ section, plies, jackStuds? }`, origem `project`) → parede portante:
  `headerFor` com `config.building` (neve, largura), `wall.buildingWidth` (sobrescreve a largura),
  `wall.floorsSupported`, `wall.floorSpan` e a seção da parede (origem = id da tabela) → parede não portante:
  peça deitada da seção da parede, 1 ply, `Member.flat`, apoiada em 1 jack por lado (origem `R602.7.4`;
  seção e jacks são hipóteses P18). Vale para RO ≤ 96" e ≤ 24" entre o topo da peça e a top plate; fora
  disso, erro pedindo `opening.header`. Sem cripples acima da peça deitada.
  Fixture: `test/fixtures/wall-120-door-nonbearing.json` (porta interna 2x4, 14 peças).
- Fora da tabela ou dado faltando: `Error` com parede, abertura e motivo. Nunca header chutado.
- Jacks por lado: `opening.jackStuds` → `opening.header.jackStuds` → NJ da tabela → 1. `opening.jackStuds`
  menor que o NJ: aviso `HEADER_JACKS_BELOW_TABLE`. O número de jacks entra na zona e na fusão de zonas
  (com NJ 2: zona = RO ± 4.5", mínimo de 7.5" entre RO vizinhos).
- A origem vai em `Member.headerSource` e aparece no `<title>` do header no SVG.
- Fixture: `test/fixtures/wall-144-window-irc.json` (50 psf, 28', só telhado → 2-2x6, NJ 2, 22 peças).

## Exemplo resolvido — parede 144" com janela
Parede: 144" × 97.125", 2x6, externa, portante. Janela: RO 36 × 48, offset 48.

1. Plates: bottom (y=0), top (y=94.125), double top (y=95.625), todas 2x6 × 144, x=0.
2. Layout: marcas 16,32,48,64,80,96,112,128 → studs centrados em 15.25, 31.25, 47.25, 63.25, 79.25, 95.25,
   111.25, 127.25; mais o stud de ponta em 0 e o fechamento em 142.5.
3. Zona da abertura: [45, 87]. Removidos: 47.25, 63.25, 79.25. Studs restantes: 0, 15.25, 31.25, 95.25, 111.25,
   127.25, 142.5 (7), y=1.5, L=92.625.
4. King: x=45 e x=85.5, L=92.625, y=1.5.
5. Header 2x10, 2 plies: L=39 (36 + 2×1.5), x=46.5, y=84.875 (94.125 − 9.25). Topo do RO = 84.875.
6. Jack: x=46.5 e x=84, y=1.5, L=83.375 (84.875 − 1.5).
7. RO base = 84.875 − 48 = 36.875. Sill 2x6 deitado: x=48, y=35.375, L=36.
8. Cripples abaixo do sill: studs 63.25 e 79.25 (o da marca 48, em 47.25–48.75, invade o jack — omitido, P3).
   y=1.5, L=33.875 (35.375 − 1.5).
9. Cripples acima do header: header toca a top plate → nenhum.

Total: 18 peças. Fixture: `test/fixtures/wall-144-window.json`.
Este exemplo usa o header encostado (sem `headerHeight`). O caso típico da fábrica é `headerHeight: 82.5`:
jacks de 81, base do RO em 34.5, sill em 33, cripples de 31.5 abaixo e de 2.375 acima do header (20 peças) —
fixture `test/fixtures/wall-144-window-82.5.json`.
A seção do header (2x10) neste exemplo entra como header do projeto (`opening.header`); é exemplo, não
dimensionamento. Pela tabela (fixture `wall-144-window-irc.json`) a mesma janela leva 2-2x6 com 2 jacks.
