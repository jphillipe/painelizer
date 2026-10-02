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
- **OC (on center)** — espaçamento entre studs; na prática medido borda a borda (16" entre marcas).
- **Ply** — camada. Header "2 plies" = duas peças lado a lado.
- **Seções nominais → reais:** 2x4 = 1.5 × 3.5; 2x6 = 1.5 × 5.5; 2x8 = 1.5 × 7.25; 2x10 = 1.5 × 9.25; 2x12 = 1.5 × 11.25.

## Convenções do motor (não mudar sem registrar em 04-decisoes.md)
- Unidades internas: polegadas decimais.
- Eixo x: da esquerda para a direita, x=0 no início da parede. Eixo y: de baixo para cima, y=0 na base da bottom plate.
- `Member.x`, `Member.y` = canto inferior esquerdo da peça.
- Layout: borda esquerda do stud na marca (0, 16, 32…). Último stud em x = comprimento − 1.5.
- Altura padrão de parede: 97.125" (8'-1 1/8") = 3 plates × 1.5 + stud 92.625.
- Parede declara `section` ('2x4' | '2x6'); espessura real (3.5 / 5.5) é derivada, nunca entrada.
- Zona de abertura = [offset − (kings + jacks)·1.5, offset + roughWidth + (kings + jacks)·1.5]. `kingStuds` e
  `jackStuds` são por abertura, default 1 e 1 (zona = RO ± 3"). Kings na borda externa da zona, jacks colados
  ao RO; o header apoia em todos os jacks (comprimento = roughWidth + 2·jacks·1.5).
  Studs de layout cujo intervalo [x, x+1.5] se sobreponha à zona são removidos; o que só encosta no king fica.
- Zonas que se sobrepõem ou se tocam são fundidas; as aberturas compartilham o king entre elas.
- Base do header: `opening.headerHeight` (y) se definido — o projeto manda; senão `config.headerHeight`;
  senão, encostado na face inferior da top plate.
  Topo do RO = base do header. **Padrão da fábrica: 82.5"** do subfloor (= y) à face inferior do header, igual
  para portas e janelas; o projeto pode indicar outra (P2, respondida em 2026-10-01).
- Sill: mesma seção da parede, deitado (1.5" de altura), comprimento = largura do RO.
- Cripples abaixo do sill nas marcas de layout que caem dentro do RO, exceto a marca que fica colada ao jack
  (ex.: marca 48 com jack em 46.5–48) — confirmado pela fábrica (P3); a tolerância de "praticamente junto" é P13.
- Cripples acima do header: mesmas marcas dos cripples abaixo do sill (inclusive a omissão da marca colada
  ao jack), só se houver espaço ≥ 1.5" entre header e top plate. Abaixo do sill vale o mesmo mínimo de 1.5".
- Porta: RO medido a partir do subfloor (y=0), porque a bottom plate é cortada na obra; `roughHeight` é entrada
  e, se ≠ base do header, aviso (P4). Porta 6'-8" padrão: RO 82.5, header em 82.5, jack 81.
- Porta: bottom plate sai inteira no painel; a folha indica o corte na obra.

## Regras e referências (IRC 2021/2024)
| Regra | Ref. | Comportamento |
|---|---|---|
| Espaçamento de studs | R602.3, Tabela R602.3(5) | 16" OC padrão; 24" configurável |
| Altura máx. de stud | Tabela R602.3.1 | 2x4 portante 16" OC: 10'. Acima → aviso |
| Top plate dupla, emendas | R602.3.2 | Emendas defasadas ≥ 24"; lap em cantos e T |
| Headers externos portantes | Tabela R602.7(1) | Entrada: largura da edificação, neve, pavimentos → seção, plies, nº de jacks |
| Headers internos portantes | Tabela R602.7(2) | Idem sem neve |
| Headers não portantes | R602.7.4 | Single flat até 8' |
| King studs | Nota R602.7(1) | Metade dos studs interrompidos vira king (arredondar p/ cima) |
| Fire blocking | R302.11 | Bloqueio horizontal a cada 10' de altura; a fábrica só coloca com cavidade > 120" (P11) |
| Cantos e T | Prática da equipe | Default California corner + ladder (P5); 3-stud e stud de encosto configuráveis |

As tabelas do IRC não são reproduzidas aqui (direitos do ICC). Digitá-las em `src/data/irc-headers.json`
é a tarefa da sessão S9, a partir da edição em vigor no estado (Massachusetts adota o IRC com emendas — ver P10).
A tabela assume espécie/grau (#2 DF-L, Hem-fir, SPF, SP); conferir com a madeira comprada.

## Exemplo resolvido — parede 144" com janela
Parede: 144" × 97.125", 2x6, externa, portante. Janela: RO 36 × 48, offset 48.

1. Plates: bottom (y=0), top (y=94.125), double top (y=95.625), todas 2x6 × 144, x=0.
2. Layout: marcas 0,16,32,48,64,80,96,112,128 + fechamento 142.5.
3. Zona da abertura: [45, 87]. Removidos: 48, 64, 80. Studs restantes: 0,16,32,96,112,128,142.5 (7), y=1.5, L=92.625.
4. King: x=45 e x=85.5, L=92.625, y=1.5.
5. Header 2x10, 2 plies: L=39 (36 + 2×1.5), x=46.5, y=84.875 (94.125 − 9.25). Topo do RO = 84.875.
6. Jack: x=46.5 e x=84, y=1.5, L=83.375 (84.875 − 1.5).
7. RO base = 84.875 − 48 = 36.875. Sill 2x6 deitado: x=48, y=35.375, L=36.
8. Cripples abaixo do sill: marcas 64 e 80 (marca 48 fica colada ao jack — omitida, P3). y=1.5, L=33.875 (35.375 − 1.5).
9. Cripples acima do header: header toca a top plate → nenhum.

Total: 18 peças. Fixture: `test/fixtures/wall-144-window.json`.
Este exemplo usa o header encostado (sem `headerHeight`). O caso típico da fábrica é `headerHeight: 82.5`:
jacks de 81, base do RO em 34.5, sill em 33, cripples de 31.5 abaixo e de 2.375 acima do header (20 peças) —
fixture `test/fixtures/wall-144-window-82.5.json`.
A seção do header (2x10) neste exemplo é **hipótese** até a tabela estar carregada — o fixture marca isso.
