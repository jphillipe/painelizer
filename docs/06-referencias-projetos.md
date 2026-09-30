# 06 — O que os projetos em `docs/examples` dizem sobre painéis

Análise feita em 2026-09-29 sobre os documentos de projeto (arquitetura, estrutura e especificações) colocados
em `docs/examples`. **Nenhum deles é folha de painel da fábrica**: são documentos de arquiteto e engenheiro.
Por isso respondem "o que o projeto exige", não "como a fábrica monta". Cada item abaixo diz de onde veio e
qual pendência de `05-pendencias.md` ele toca. Nada aqui altera hipótese sem confirmação humana.

## Os projetos

| Projeto | Local / código | Tipo | O que tem de útil |
|---|---|---|---|
| **49 Matilda St** (Jack Ryan Architect + Structures Workshop, out/2021, 80 pág.) | Providence RI — RI SBC-1 2019 / IRC 2015 | Residencial multifamiliar, 3 pav. + porão, wood frame | Tabela de headers do engenheiro, notas de madeira, tipos de parede, RO cotado nas plantas estruturais, altura de head/sill acima do subfloor |
| **26 Ringgold St** (SOL and Associates, set/2025, 15 pág.) + **Certified structural plans** (SAB Engineering, out/2025, 5 pág.) | Providence RI — RI SBC 2021 | Residencial multifamiliar, wood frame | Tipos de parede 2x4/2x6 @ 16", headers em LVL, shear walls |
| **Horace H. Strong School Housing** (WRT + DCI Engineers, 2025–2026, ~525 arquivos) | New Haven CT — IBC 2021 / CT 2022 | R-2, 4 pav., Type VA, wood frame sobre pódio | Detalhes típicos de header em parede 2x4 e 2x6, espécie/grau da madeira, splice de plate, schedule de shear wall, especificação 061000 |

A pasta `docs/examples/Architectural` é cópia da pasta homônima do Horace. A pasta `gerados/` é teste de QA de
uma ferramenta de divisão de PDF (ignorar).

## Achados por tema

### Layout, plates e espécie (perguntas 5–8, P7)
- **16" OC em todas as paredes de todos os projetos.** Horace: "all studs are spaced at 16"OC maximum" (S-310).
  Nenhum 24" OC em parede. Hipótese atual confirmada.
- **Double top plate + single bottom plate** em todos: Matilda A030 ("double 2x4 top plate", "single 2x4 bottom
  plate"); Horace A-602 ("2x wd double top plate"); Matilda SA0.0 nota 12: "all walls shall be capped with double
  top plates… top plate joints offset not less than 48 inches". Horace S-502 det. 4: **splice da double top plate
  com lap mínimo de 4'-0", sempre sobre stud**. Isso alimenta S14 (laps) e S12 (quebra em stud).
- **Exterior 2x6, interior 2x4** (Matilda, Ringgold, Horace). Interior portante pode ser 2x4 ou 2x6 conforme a
  planta estrutural (Matilda: "UP: 2X4 BEARING WALL", "UP: 2X6 BEARING WALL"). Paredes de shear/demising em
  2x6 dupla ("(2) 2X6 SHEAR WALL" = duas paredes 2x6 paralelas, não stud duplo).
- **Espécie e grau** (afeta S9): Matilda SA0.0 nota 2: "dimensional lumber… **Spruce Pine Fir #2** or better
  (Fb 775, Fv 135, E 1.1M psi)". Horace S-003: "wall stud/top and bottom plates 2x4, 3x4, 2x6, 3x6 **Hem Fir
  No. 2**; sill plates (at concrete) PT Southern Yellow Pine No. 2; **finger-jointed studs acceptable at
  interior walls only**". Spec 061000: interior não portante = Construction ou No. 2 (SP, SPF ou Hem-fir);
  portante = No. 2. Ou seja: **a espécie muda por projeto (SPF em RI, Hem-fir em CT)**. A tabela IRC da S9
  precisa ter a espécie como entrada, não fixa.
- **Pré-corte de stud / altura**: nenhum projeto dá o pré-corte (é decisão da fábrica). Matilda tem pé-direito
  variado por pavimento (RCPs: 9'-0 1/8", 8'-1", 9'-0 1/2" AFF), então a fábrica deve trabalhar com mais de uma
  altura de stud. P7 continua aberta.

### Headers, king, jack, cripple, sill (perguntas 10–13, P3)
- **Tabela do engenheiro do Matilda (SA6.x, "Typ opening sheathing and header requirements")** — a única tabela
  de header encontrada, e vale só para aquele projeto:

  | RO width | Header mín. | Jack por lado | King por lado |
  |---|---|---|---|
  | < 3'-8" | (2) 2x8 | 1 | 1 |
  | 3'-8" a 5'-4" | (2) 2x10 | 1 | 2 |
  | 5'-4" a 7'-0" | (2) 2x12 | 2 | 2 |
  | > 7'-0" | ver elevações | 3 | 3 |

  Observações: (a) header sempre 2 plies de 2x em parede 2x6 também; (b) **king dobra antes do jack** (3'-8" →
  2 kings, 1 jack); (c) a planta manda "minimum (1) king stud; at basement level (2) king studs each side";
  (d) headers maiores aparecem como "(2) 2X12 SPF", "(3) 2X12 SPF", "(3)/(4) LVL 11 7/8" nas plantas.
  Ringgold usa "(2) 1.75x16 LVL" para aberturas grandes. **Impacto no motor:** `Config` precisa de
  `jackStuds` e `kingStuds` por abertura (hoje é 1 e 1 fixo), e a S9 deve aceitar uma tabela por projeto além
  da IRC. A hipótese "1 king + 1 jack" continua válida para RO < 3'-8".
- **Header em parede 2x6 (Horace S-502 det. 1):** "(2) 2x header or beam" com **1/2" sheathing spacer** entre
  os plies, ou "(3) 2x header" com dois spacers de 1/2". Em parede 2x4: (2) 2x, spacer 1/2". Ou seja, o header
  preenche a espessura da parede (2×1.5 + 0.5 = 3.5; 3×1.5 + 2×0.5 = 5.5). Isso é material (OSB) que hoje não
  está na BOM. Matilda: "built up 2x header, see plan".
- **Cripples acima do header:** Horace S-502: "2x cripple studs to match typ studs per plan **where hdr is not
  tight to plate**". Confirma a regra da S7 (cripple acima só quando o header não encosta na top plate) e
  confirma que existem os dois casos: header encostado (Matilda "HIGH HEADER" com "2x nailer, may need double")
  e header baixo ("LOW HEADER") com cripples.
- **Jack e king vão até a bottom plate:** Horace S-501 det. 6: "jack & king studs cont to bot plate"; "bundled
  jack studs indicated as (2) on plan [(1) min, typ]"; "king studs per plan [(1) min]". Matilda "typ header to
  column": "jack or trimmer studs".
- **Sill:** Horace S-501: "sill at windows" simples; **"double sill plate for openings larger than 6'-0""**
  (S-507/S-508/S-509). Regra candidata: sill dupla quando RO > 72". Ringgold: "2x6 wood sill".
- **P3 (cripple colado ao jack):** nenhum detalhe mostra. Continua só com a fábrica.

### Altura de header e RO (P2, P4, pergunta 16)
- **Matilda cota a abertura pelo RO, medido a partir do subfloor**, nas elevações estruturais (SA5.x):
  "5'-0" R.O.", "6'-11" R.O.", "7'-5 5/8" HEAD ABV SUBFL", "7'-6 3/8" HEAD ABV SUBFL", "7'-11 1/8" HEAD ABV
  SUBFL", "2'-5 5/8" SILL ABV SUBFL", "2'-8 3/8" SILL ABV SUBFL". Isso é exatamente a convenção do motor
  (y=0 = base da bottom plate = topo do subfloor; `config.headerHeight` = topo do RO). **A altura de head não é
  única na casa: varia por pavimento e por janela**, então `headerHeight` provavelmente precisa ser por abertura,
  com default por parede/projeto.
- **RO vs. tamanho da esquadria (Matilda A801, Andersen 100):** porta de correr "8'-0" R.O." / "7'-11 1/2"
  FRAME"; janela "5'-5 1/2" FRAME" com RO acima. Ou seja, **RO = frame + 1/2"** (1/4" por lado) nesse fabricante.
  Horace A-604 desenha "window rough opening" vs "window width" também com folga de 1/4" por lado.
  Regra candidata para a Fase 4: se a planta der o tamanho da esquadria, RO = tamanho + 1/2"; se der RO, usar.
- **Porta (P4):** Matilda A801: porta 6'-0" × 7'-0" com RO 6'-5" × 7'-3 1/2" (portas de alumínio, folga maior).
  Portas de madeira interiores: schedules dão só tamanho da folha; RO fica a cargo da fábrica → P4 segue aberta.
- Head das janelas do Matilda (7'-5 5/8" a 7'-11 1/8") fica bem **abaixo** da top plate em paredes de 9' →
  cripples acima do header são o caso comum nesse projeto, não a exceção.

### Cantos, T, blocking, fire blocking (P5, P11, pergunta 20)
- Nenhum detalhe de canto (California / 3-stud) ou de T em nenhum projeto — é convenção de montagem, não de
  projeto. P5 segue só com a fábrica.
- **Blocking em toda borda de painel de sheathing** (Matilda: "provide blocking @ all sheathing edge locations";
  "add blocking at edges of wall panels"; Horace S-310 nota 3). Se a fábrica coloca sheathing, cada emenda
  horizontal de OSB exige blocking horizontal — peça que o motor não gera hoje (fora do escopo v1, mas anotar).
- Horace S-501: "**full depth vert blkg to match studs above cont thru to fdn**" e "addl stud(s) to match studs
  above" — studs extras sob cargas pontuais e alinhados com o pavimento de cima. Fora do escopo do motor
  (exige engenheiro), mas explica por que folhas reais têm studs "a mais".
- Fire blocking: nada específico além do IBC. P11 segue.

### Sheathing e shear walls (fora do escopo v1, mas o painel real vai ter)
- Todos os projetos têm shear walls com nailing schedule (Horace S-310: W12/W6/W4/W3/2W2, ZIP R-12 ou 15/32",
  pregos a 6"/4"/3"/2" OC; Matilda: 8d @ 6" bordas / 12" campo; Ringgold: 15/32" ext + 5/8" ply int).
- Hold-downs (HDU2…HD19, CS16/MST48 straps) nas extremidades de shear walls, "center hold-down in stud wall",
  "stud walls shall be 2x6" onde há hold-down. Os posts de hold-down são (2) 2x, (3) 2x, 4x6 ou 6x6 — mais
  studs agrupados que o motor não conhece.
- Horace S-502 det. 3 "Non-shear wall typical exterior wall panel fastening pattern": 8d @ 16" máx. — o projeto
  chama a parede de "wall panel", mas se refere ao painel de OSB, não ao painel pré-fabricado.

### Entrada de dados (P12, perguntas 33–35)
- **Todos os PDFs são vetoriais** (texto extraível), gerados em Revit. Isso favorece a Fase 4 por PDF vetorial
  e sugere pedir DXF/Revit ao arquiteto (P12).
- A planta **estrutural** é a que traz o que o motor precisa (seção da parede, portante/shear, RO, header);
  a arquitetônica traz tipos de parede (rating, camadas) e schedules de esquadria. A Fase 4 deve ler as duas.
- Matilda numera paredes por eixos (A6, A7, C.1, D…) e por tipo (WALL TYPE 1–7); Horace por partição
  (E01…E16, P1…P12). Nenhum tem numeração de painel (S13 é convenção da fábrica).

## O que muda (proposta, a confirmar)
1. **S7/S8:** prever `kingStuds` e `jackStuds` por abertura (default 1/1) e sill dupla opcional (default simples).
2. **S9:** tabela de header com espécie como entrada e possibilidade de tabela por projeto (engenheiro) além da
   IRC; header de 2x6 wall = plies + spacers de 1/2" (contar OSB na BOM ou ao menos avisar).
3. **`headerHeight`:** por abertura (topo do RO acima do subfloor), com default por projeto — o Matilda cota
   exatamente assim.
4. **Fase 4:** regra RO = frame + 1/2" quando a planta der tamanho de esquadria.
5. **05-pendencias:** P2 ganha evidência (projeto cota head acima do subfloor, varia por janela); P7, P3, P4,
   P5, P11 continuam só com a fábrica; P12 ganha evidência (PDF vetorial de Revit).

## O que continua sem resposta (só a fábrica)
Pré-corte de stud (P7), cripple colado ao jack (P3), RO de porta de madeira (P4), cantos e T (P5), comprimento
e peso máximos de painel (P6), estoque (P9), fire blocking (P11), formato da folha e da lista de corte, e —
acima de tudo — **painéis reais (P1)**. Os projetos dizem o que deve ser construído; só a folha da fábrica diz
como o painel é montado.
