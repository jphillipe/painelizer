# 07 — Perguntas para o arquiteto

Criado em 2026-10-05. A parte 1 está em inglês, pronta para copiar e enviar. A parte 2 é interna: qual resposta
destrava o quê. Cada resposta vira linha em `04-decisoes.md` e, quando for o caso, fecha a pendência em
`05-pendencias.md`. Perguntas que só a fábrica responde ficam na parte 3, para não misturar.

## Parte 1 — Para enviar

> We are building software that turns house plans into wall panel shop drawings (light wood frame, 2x4/2x6,
> panels up to 20'). The engine follows the IRC prescriptively and stops whenever something needs an engineer.
> To finish the header and opening logic, we need to know how your drawings carry the following information.
>
> **Code**
> 1. Which IRC edition does the current Massachusetts 780 CMR (10th edition) adopt for one- and two-family
>    dwellings? Are there Massachusetts amendments to R602.7 (headers), R602.7.5 (king studs) or R602.3 (studs)?
>
> **Design loads**
> 2. Where do your drawings state the ground snow load (pg) and the ultimate design wind speed? Is it always on
>    the cover sheet or the structural general notes? If not, which source should we use per town?
> 3. "Building width" for the IRC header tables (measured perpendicular to the ridge): do you dimension it on the
>    drawings? For L-shaped or irregular houses, which width do you expect us to use for each wall?
>
> **Bearing walls**
> 4. How do you mark load-bearing walls? Is every bearing wall identified, or should we infer it from framing
>    direction?
> 5. For each bearing wall, can the drawings tell us what it supports: roof and ceiling only, or roof plus one or
>    two floors? Are floor joists clear span or center-bearing (on an interior wall or beam)?
>
> **Headers**
> 6. Do your structural drawings specify the header for every opening, or only for some (large openings,
>    point loads)? Is there a header schedule?
> 7. What notation do you use? E.g. "(2) 2x10", "3-ply 2x8", "1 3/4 x 11 7/8 LVL (2 ply)". Do you specify the
>    number of jack and king studs when it differs from the minimum?
> 8. When a header is not specified, is it acceptable for us to size it from IRC Tables R602.7(1)/(2) (No. 2 SPF)?
>    When several sizes work, do you have a preference (e.g. always 2-ply, never a single-ply header)?
> 9. Openings in non-bearing walls: what header do you expect? A flat 2x4 per R602.7.4, the same header as a
>    bearing wall, or none?
> 10. Which engineered lumber sizes do you usually call out (LVL/PSL depths and ply widths)?
>
> **Openings**
> 11. Do your door and window schedules give rough openings (RO) or unit sizes? If unit sizes, which RO allowance
>     do you assume?
> 12. Our standard top of rough opening is 82 1/2" above the subfloor for doors and windows. Where do you show a
>     different header height when you need one (elevations, schedule, notes)?
> 13. When two openings are closer than 4 1/2" (rough opening to rough opening), what do you expect? A continuous
>     header over both with a jack post, moving one opening, or an engineered detail?
>
> **Walls and drawings**
> 14. Plate heights per floor (8'-1 1/8", 9'-1 1/8"…) and stud spacing: 16" o.c. everywhere, or 24" o.c. in some
>     walls? Exterior 2x6 and interior 2x4 by default?
> 15. Can you send DWG/DXF together with the PDF? If so, are walls, doors and windows on separate layers?
> 16. Could you share one finished project (PDF + structural drawings) that we can use as a test case?

## Parte 2 — Mapa interno (não enviar)

| Pergunta | Destrava | Pendência / sessão | Hipótese em vigor |
|---|---|---|---|
| 1 | Edição da tabela carregada (IRC 2021) | P10 — S9 | IRC 2021 sem emendas |
| 2 | `config.building.groundSnowLoad`; vento para king studs | S9.2; R602.7.5 futura | Neve entra à mão por projeto |
| 3 | `config.building.buildingWidth`, `Wall.buildingWidth` | S9.2 | Largura única por projeto |
| 4, 5 | `Wall.bearing`, `Wall.floorsSupported`, `Wall.floorSpan` | S9.2; Fase 4 | Sem `floorSpan` = pior caso |
| 6, 7 | `Opening.header` e formato de leitura do estrutural | S9.2; Fase 4 | Header do projeto manda (P10) |
| 8 | Regra de escolha quando vários headers servem | P17a | Menor altura, depois menos plies |
| 9 | Header em parede não portante | P17b | Header padrão do config |
| 10 | Tipo de seção para LVL/PSL | Fora da S9.2 | Ainda não suportado |
| 11 | Entrada de RO | Fase 4 | Projeto dá RO |
| 12 | `Opening.headerHeight` | P2 (respondida) | 82.5" |
| 13 | Aberturas próximas | P16 | < 4.5" = erro |
| 14 | Pré-cortes, `studSpacing`, `Wall.section` | P7 (respondida) | 16" OC; 2x6 ext. / 2x4 int. |
| 15 | Entrada DXF | P12 (respondida), Fase 4 | PDF principal, DXF quando houver |
| 16 | Fixture real de projeto (não de painel) | P1 (parcial) | Fixtures sintéticos |

## Parte 3 — Continua com a fábrica (não é do arquiteto)
- **P1** — 2 ou 3 painéis já fabricados (folha + lista de corte), para virar `test/fixtures/real-*.json`.
- **P8** — Peso por pé linear de 2x4 e 2x6 SPF No. 2 (ou o que usam para estimar peso do painel).
- **P13** — A partir de quantas polegadas do jack o cripple é omitido.
- **P14** — Emenda de plates em painel acima de 16': sempre sobre stud? Defasagem entre top e double top?
- **P15** — Peso máximo do painel (içamento e transporte).
- **P16 / P17a** — Mesmas perguntas 8 e 13, do ponto de vista de quem monta: o que a fábrica faz hoje.
