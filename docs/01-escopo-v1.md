# 01 — Escopo v1

## Critério de sucesso
Dado um painel real já fabricado pela equipe (medidas, lista de peças), o motor gera o mesmo painel com a mesma
lista de corte, peça a peça. Em seguida: uma casa térrea simples inteira painelizada, e um painel montado pela
equipe usando só o desenho gerado.

## Dentro (v1)

### Entrada
- Paredes retas, ângulos de 90° apenas.
- Atributos: comprimento, altura, seção (2x4 / 2x6; espessura derivada), externa/interna, portante/não.
- Aberturas: porta ou janela; RO largura × altura; posição a partir do início da parede; altura do sill (janela).
- Configuração: espaçamento (16"/24" OC), largura da edificação, carga de neve no solo, pavimentos suportados,
  altura padrão de header (opcional; ausente = encostado na top plate), comprimento e peso máximos de painel,
  estilo de canto e de interseção T.
- Entrada v1 = arquivo JSON. (IA lendo PDF e tela vêm depois — ver Ordem de construção em `00-visao.md`.)

### Motor
- Plates: bottom, top, double top; laps em cantos e emendas.
- Studs a 16"/24" OC; último stud encostado no fim.
- Aberturas: king, jack, header, sill, cripples acima e abaixo.
- Headers por tabela prescritiva IRC R602.7 (JSON). Fora da tabela → `requiresEngineer: true`.
- Cantos L (California / 3-stud) e interseções T (ladder / stud de encosto), configuráveis.
- Blocking horizontal quando altura exceder limite configurável.
- Divisão em painéis por comprimento/peso máximo; nunca dentro de abertura; preferir quebra em stud de layout
  múltiplo de 48" (módulo do OSB), depois qualquer stud de layout.
- Aberturas vizinhas com zonas sobrepostas compartilham king stud.
- Numeração `{pavimento}-{parede}-P{n}`.
- Validações como avisos, não erros.

### Saídas
- Desenho de elevação por painel (SVG → PDF), com cotas, ID, orientação, lista de peças na margem.
- Lista de corte por painel (papel, seção, comprimento, quantidade).
- Lista de material consolidada por comprimento comercial (8', 10', 12', 14', 16') + % sobra. CSV/XLSX.
- Planta de painéis (vista superior numerada).
- Orçamento = lista consolidada × tabela de preços (JSON).

## Fora (explicitamente)
- Treliças de telhado/piso; análise estrutural; qualquer coisa que exija selo de engenheiro.
- Importação Revit/BIM. (DXF fica para v2.)
- Integração com serras ou mesas de montagem.
- Gestão de fábrica, faturamento, ERP.
- Paredes curvas, rake walls, paredes com desnível (v2).
- IA como motor de cálculo.

## Backlog v2
- Leitura de PDF com Claude (visão) → `Wall[]` com confiança; confirmação humana obrigatória.
- Importação/exportação DXF. Se os arquitetos entregarem DXF, a importação sobe para a Fase 4 no lugar da visão
  sobre PDF (ver P12 em `05-pendencias.md`): cotas vetoriais são mais confiáveis que leitura de imagem.
- Rake walls.
- Sheathing (OSB) com aproveitamento.
- Visualizador 3D no navegador.
- Backend multiusuário (Supabase: auth, tabela `projects` com coluna `data jsonb`, storage para PDFs).
