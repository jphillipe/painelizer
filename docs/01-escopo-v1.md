# 01 — Escopo v1

## Critério de sucesso
Dado um painel real já fabricado pela equipe (medidas, lista de peças), o motor gera o mesmo painel com a mesma
lista de corte, peça a peça. Em seguida: uma casa térrea simples inteira painelizada, e um painel montado pela
equipe usando só o desenho gerado.

## Dentro (v1)

### Entrada
- Paredes retas, ângulos de 90° apenas.
- Atributos: comprimento, altura, seção (2x4 / 2x6; espessura derivada), externa/interna, portante/não.
- Aberturas: porta ou janela; RO largura × altura; posição a partir do início da parede; altura do sill (janela);
  nº de king e jack studs por lado (opcional, default 1 e 1).
- Configuração: espaçamento (16"/24" OC), largura da edificação, carga de neve no solo, pavimentos suportados,
  altura padrão de header (opcional; ausente = encostado na top plate), comprimento e peso máximos de painel,
  estilo de canto e de interseção T.
- Três caminhos, todos para o mesmo formato de projeto (`packages/cli/src/project.ts`):
  - **arquivo JSON** (CLI ou "Project file" no app);
  - **leitura do conjunto de PDFs por IA** (`packages/extract`, S18–S19, S25): a IA devolve paredes e aberturas com
    confiança e evidência; o humano revisa e corrige no editor antes de gerar (confirmação humana obrigatória). A
    IA só lê: o motor continua determinístico;
  - **editor do app** (S21): planta, propriedades, planta do arquiteto por baixo.

### Motor
- Plates: bottom, top, double top; laps em cantos e emendas.
- Studs a 16"/24" OC; último stud encostado no fim.
- Aberturas: king, jack, header, sill, cripples acima e abaixo.
- Headers por tabela prescritiva IRC R602.7 (JSON). Fora da tabela → `requiresEngineer: true`.
- Cantos L (California / 3-stud) e interseções T (ladder / stud de encosto), configuráveis.
- Blocking horizontal quando altura exceder limite configurável; blocking por altura para armários e acessórios
  (presets por uso e por wall type) — pedido da fábrica em 2026-10-28, S36.
- Sheathing (OSB/plywood) por painel: chapas, avanço no canto e na linha de piso, pregação como nota —
  pedido da fábrica em 2026-10-28 (era backlog v2), S38. Sem otimização de corte. Desligado por padrão.
- Posts 4x4/4x6/6x6 do projeto no lugar dos studs de layout, com conectores como texto — S37.
- Ligações na saída: bloco "Wall content" na folha (o que vai na parede, com "engineer to verify" nos itens de
  hipótese) e selos L/T/+ com legenda na planta — S39.
- Divisão em painéis por comprimento/peso máximo; nunca dentro de abertura; preferir quebra em stud de layout
  múltiplo de 48" (módulo do OSB), depois qualquer stud de layout.
- Aberturas vizinhas com zonas sobrepostas compartilham king stud.
- Numeração `{pavimento}-{parede}-P{n}`.
- Wall types do projeto (`config.wallTypes`, por tag): dão seção, posição e carga à parede que não disser; a tag
  sai na folha, na planta e no `panels.csv` — pedido da fábrica em 2026-10-28, S35.
- Validações como avisos, não erros.

### App e dados (Fase 5–6)
- App web (`packages/web`, Next.js no Cloud Run — `docs/12`) com login e projetos salvos no **Supabase** (S22:
  auth, tabela `projects` com `data jsonb`, revisão para conflito; S22.3: desenhos no bucket `drawings`; S24:
  jobs de leitura no banco). Ferramenta interna; desde a S32, projetos por time com papéis admin/editor, convite
  por e-mail, lixeira e histórico de retratos.

### Saídas
- Desenho de elevação por painel (SVG → PDF), com cotas, ID, orientação, lista de peças na margem.
- Lista de corte por painel (papel, seção, comprimento, quantidade).
- Lista de material consolidada por comprimento comercial (8', 10', 12', 14', 16') + % sobra. CSV/XLSX.
- Planta de painéis (vista superior numerada).
- Orçamento = lista consolidada × tabela de preços (`config.prices`; editável no app desde a S40). Chapas de sheathing
  na lista de material, ainda sem preço.

## Fora (explicitamente)
- Treliças de telhado/piso; análise estrutural; qualquer coisa que exija selo de engenheiro.
- Importação Revit/BIM. (DXF fica para v2.)
- Integração com serras ou mesas de montagem.
- Gestão de fábrica, faturamento, ERP.
- Paredes curvas, rake walls, paredes com desnível (v2).
- IA como motor de cálculo.

## Backlog v2
- Importação/exportação DXF. Se os arquitetos entregarem DXF, a importação sobe para a Fase 4 no lugar da visão
  sobre PDF (ver P12 em `05-pendencias.md`): cotas vetoriais são mais confiáveis que leitura de imagem.
- Rake walls.
- Aproveitamento de chapa de sheathing (corte otimizado); o sheathing em si entrou na v1 em 2026-11-04.
- Visualizador 3D no navegador.

Entraram na v1 (antes backlog v2): leitura de PDF por IA (Fase 4, S18–S19) e o backend no Supabase (S22) —
revisão de 2026-11-04 (`docs/13`, S27).
