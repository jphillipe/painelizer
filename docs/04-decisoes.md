# 04 — Log de decisões

Formato: data — decisão — motivo. Uma linha por decisão. Nunca apagar; se mudar, adicionar nova linha "substitui X".

- 2026-09-15 — Escopo v1 = painelização de paredes; treliças, análise estrutural e máquinas ficam fora — exigem selo de engenheiro / dados e protocolos proprietários da MiTek.
- 2026-09-23 — IA (Claude visão) só na leitura da planta, nunca no cálculo — painel de fabricação precisa ser exato; LLM não garante geometria.
- 2026-09-23 — Ordem: motor primeiro, depois IA de extração, depois tela — sem motor a IA não tem para onde mandar as paredes.
- 2026-09-23 — Unidades internas em polegadas decimais; formatação só na borda (units.ts).
- 2026-09-23 — x=0 no início da parede, y=0 na base da bottom plate; Member.x/y = canto inferior esquerdo.
- 2026-09-23 — Layout de studs: borda esquerda na marca; último stud encostado em comprimento − 1.5.
- 2026-09-23 — Altura padrão 97.125" = 3 plates de 1.5 + stud 92.625.
- 2026-09-23 — Zona de abertura = RO ± 3" (king + jack de cada lado, 1.5 cada).
- 2026-09-23 — Header encostado na top plate na v1; topo do RO = base do header. Altura de header configurável fica para v2.
- 2026-09-23 — Headers só por tabela IRC R602.7 em JSON; fora da tabela → requiresEngineer, nunca extrapolar.
- 2026-09-23 — Stack: TypeScript strict, Vitest, pnpm workspaces (core / cli / ui). Core sem DOM. UI em Next.js; backend Supabase (auth + projects.jsonb + storage), só na fase 5.
- 2026-09-23 — Fixtures são a verdade nos testes; alterar fixture exige confirmação humana.
- 2026-09-28 — Perguntas que só a fábrica responde vão para `docs/05-pendencias.md`; o motor segue com a hipótese registrada lá — painéis reais não disponíveis no início; não travar o desenvolvimento.
- 2026-09-28 — `Wall.section` ('2x4' | '2x6') é a entrada; espessura derivada — evita mapear 5.5 → "2x6" em cada regra. Substitui `thickness` nos fixtures (confirmado pelo humano).
- 2026-09-28 — `config.headerHeight` opcional na v1; ausente = header encostado na top plate — substitui a decisão de 23/09 ("configurável fica para v2"): fábricas usam altura padrão de header para toda a casa, e sem isso a porta com `roughHeight` de entrada não fecha. Default mantém os fixtures atuais válidos.
- 2026-09-28 — Porta: `roughHeight` é entrada; conflito com a base do header gera aviso, não erro — resposta definitiva em P4.
- 2026-09-28 — Zonas de abertura que se sobrepõem ou se tocam são fundidas e compartilham king — janela ao lado de porta é comum; sem isso o motor geraria kings sobrepostos.
- 2026-09-28 — Divisão em painéis prefere quebra em stud múltiplo de 48" — módulo do OSB, mesmo com sheathing fora do escopo v1.
- 2026-09-28 — Scripts `test` e `typecheck` na raiz delegam para os pacotes (`pnpm -r`) — CLAUDE.md manda rodar na raiz.
- 2026-09-28 — `Section` nominal ('2x4'…'2x12') com tabela `SECTION_DEPTH` e `sectionDepth()` em `types.ts`; `WallSection` restringe parede a 2x4/2x6, header pode usar qualquer seção — a profundidade real é derivada num único lugar, nunca digitada.
- 2026-09-28 — `Opening` não tem altura de sill como entrada: base do RO = base do header − `roughHeight` (segue `02-framing`, não `01-escopo`) — evita dois campos que podem conflitar; revisar se P2 indicar que a fábrica cota o sill.
- 2026-09-28 — `formatFeetInches` arredonda ao 1/16", omite pés abaixo de 12" (`1 1/2"`) e, com pés, sempre mostra a polegada inteira (`1'-0 1/16"`); `formatInches` extra dá só polegadas (`92 5/8"`) para listas de corte — é a notação da lista de corte em `00-visao`.
- 2026-09-28 — `parseFeetInches` aceita espaço ou hífen entre pés, polegadas e fração, aspas opcionais e decimal puro (`92.625`); string inválida lança `RangeError` — entrada JSON pode vir de humano ou de IA, melhor falhar cedo.
- 2026-09-28 — `layoutStuds`: marca de layout entra enquanto for estritamente menor que o fechamento (`length − t`); marca igual ao fechamento (ex.: 129.5 → 128) vira um stud só — evita peça duplicada na mesma posição.
- 2026-09-28 — `layoutStuds`: quando a última marca e o fechamento se sobrepõem (`length − últimaMarca < 2·t`, ex.: 130 → 128 e 128.5) os dois são mantidos e o layout não é deslocado — a marca preserva o módulo de 16"/48" para chapas; a sobreposição vira aviso `studs sobrepostos` na S10, e a fábrica decide se dobra o stud de ponta ou omite a marca (anotar em P-nova se surgir). Nota: o exemplo 143 do plano não dispara o caso (128 e 141.5 distam 13.5"); o gatilho real é comprimento entre 129.5 e 131 (exclusivos) para 16" OC.
- 2026-09-28 — `layoutStuds` lança `RangeError` para `length < t`, `spacing ≤ 0`, `t ≤ 0` ou não finito — parede que não comporta um stud é erro de entrada, não painel vazio.
