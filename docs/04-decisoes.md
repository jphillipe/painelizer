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
