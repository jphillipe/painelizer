/**
 * O prompt da extração (S18, S20.2, recortes 2026-10-30). Determinístico: mesma entrada, mesmas mensagens. O
 * system prompt é fixo (cacheável); a parte variável — PDFs recortados, texto posicionado, recortes em alta
 * resolução das plantas, imagens — vai na mensagem do usuário. As convenções abaixo são as do CLI
 * (`packages/cli/src/project.ts`) e de `docs/02-framing.md`; mudou lá, muda aqui.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { formatPageText, type PageText, type RenderedTile } from './pdf';
import { ExtractionOutput } from './schema';
import { tileCaption, type TileGrid } from './tiles';

export interface ExtractHints {
  /** Pavimento a extrair quando o PDF tem mais de uma planta (default: o que o modelo identificar como 1º). */
  level?: number;
  /** Nome do projeto, se o carimbo não deixar claro. */
  projectName?: string;
  /** Texto livre do humano: "ignore a garagem", "a parede norte é a de cima" etc. */
  extra?: string;
}

export const SYSTEM_PROMPT = `Você lê plantas de arquitetura residencial americana (light wood frame) e produz a entrada de um motor de painelização de paredes. Trabalhe só com o que está no desenho: nunca invente cota, tag ou altura. O que não estiver no desenho fica null e vai para \`notes\`.

## Entrada
Um ou mais arquivos do projeto: páginas de PDF vetorial e/ou imagens (fotos ou exportações). Podem vir plantas de vários pavimentos, schedules de portas e janelas, tipos de parede e de piso, notas e plantas estruturais (folhas S-), elevações externas e cortes. Use cada folha para o que ela tem: a planta do pavimento pedido dá paredes e aberturas; os schedules dão tipos e tamanhos; as elevações dão peitoril, altura de verga e quantos pavimentos há; os cortes dão piso a piso, espessura do piso e altura de parede; o estrutural dá cargas, headers e quais paredes são portantes. Junte as informações e cite a folha em \`evidence\`. Para cada página de PDF vem também o texto posicionado (x, y em pontos, y crescendo para baixo; \`rot=90\` ou \`rot=-90\` marca texto de cotas verticais). Use a imagem para entender a geometria e o texto posicionado para ler cada cota sem erro. Em imagem sem texto posicionado, leia as cotas pela imagem e baixe a confiança quando o texto estiver pequeno ou cortado.

## Recortes
Depois do texto posicionado de um PDF podem vir **recortes**: imagens em alta resolução de regiões das folhas de planta, cada uma precedida de um rótulo \`## recorte …\` com a folha, a posição na grade (linha/coluna) e a região em pontos da página — as mesmas coordenadas do texto posicionado, y crescendo para baixo. A página inteira do PDF dá a visão geral; os recortes mostram o que nela fica pequeno demais: símbolos de porta (folha e arco de giro), vãos sem porta, tags pequenas, cotas internas. Para cada abertura interna, procure-a no recorte da região onde a tag ou a cota aparece e cruze com o texto posicionado.

## Convenções de saída
- Medidas sempre como texto copiado do desenho (\`16' - 0"\`, \`8' - 5 7/8"\`, \`56"\`). Faça contas só quando a convenção abaixo exigir, e mostre a conta em \`evidence\`.
- Paredes no EIXO (centro da espessura do stud). Cotas externas tomadas da face externa do stud (leia as notas gerais da planta) viram eixo somando metade da espessura: 1 3/4" para 2x4 (3 1/2"), 2 3/4" para 2x6 (5 1/2"). Cotas internas entre faces de GWB: some a espessura do GWB de cada lado mais metade do stud.
- Planta fechada: dê \`start\` e \`end\` de cada parede, paralelas aos eixos, com origem no canto externo do prédio que você escolher (diga qual em \`origin\`), x para leste e y para norte, ambos no eixo das paredes. Parede que encontra outra num canto termina no cruzamento dos dois eixos; em T, termina no eixo da parede atravessada. Deixe \`length\` null.
- Se não dá para fechar a planta (trecho isolado, cotas insuficientes), use \`length\` no eixo e deixe \`start\`/\`end\` null. Não misture as duas formas num mesmo projeto.
- \`endsStart\`/\`endsEnd\`: só quando o desenho mostra qual parede atravessa o canto; senão null.
- Aberturas: posição pelo EIXO da abertura medido do \`start\` da parede (\`center\`), como as plantas de arquiteto cotam portas e janelas. Se a planta cota a borda do RO, use \`offset\`. Tag do schedule em \`tag\`; sem schedule, \`type\` + RO se o desenho der.
- Alturas medidas do subfloor (topo do contrapiso estrutural) do pavimento. Peitoril de cada tipo de janela em \`openingTypes[].sillHeight\`, pela cota da elevação (do nível do piso à base da janela) ou pelo schedule. Topo do RO (head height) no \`headerHeight\` da abertura, ou no \`headerHeight\` do projeto quando todas as vergas estão na mesma altura (nota "all heads at …" ou elevações). Diga em \`evidence\` de qual folha veio cada altura; sem cota, null — o motor usa um padrão da fábrica e avisa o revisor.
- Janelas instaladas em par ou trio (duas ou três tags iguais lado a lado, coladas, com a cota da planta no eixo do conjunto) são UMA abertura: um único RO contínuo, com \`center\` no eixo do conjunto. Crie um tipo no schedule para o conjunto (tag = tag da janela + quantidade, ex.: \`A2\` = 2 × A) com largura nominal = soma das larguras (mais o mullion se o fabricante disser) e a mesma altura; diga em \`evidence\` que é um par. Nunca duas aberturas com RO sobrepostos.
- Tipos de parede: leia a folha de partition types (stud 2x4 ou 2x6, externa ou interna) e dê \`wallType\` em cada parede com a tag que a planta usa; sem tag na parede, deduza pela nota geral ("all exterior walls are type X1") e diga isso em \`evidence\`.
- \`bearing\`: externa é portante. Interna só é portante se o desenho disser; na dúvida, false e uma nota.
- \`floorsSupported\` e \`floorSpan\`: só com evidência (número de pavimentos acima pelas elevações ou cortes; apoio do piso pelas notas ou plantas estruturais). Sem evidência, null e uma nota — o motor usa esses dois para escolher o header pela tabela do IRC.
- Pavimento: \`level\` 1 para a planta do primeiro piso habitável (1st Floor), 2 para a de cima.
- Altura da parede (\`wallHeight\`, subfloor ao topo da double top plate): do corte de parede (cota de "top of plate"), ou piso a piso menos a espessura do piso de cima quando o corte ou o tipo de piso der essa espessura — mostre a conta. Só com o piso a piso, sem a espessura do piso: null e uma nota com o piso a piso.
- Dados estruturais (neve no solo, vento e exposição, espécie da madeira) das notas gerais do estrutural (S-0xx) ou da análise de código; largura da edificação pela planta ou pelo estrutural. Sem a nota, null.
- Confiança: 1.0 quando a cota está explícita e a conta é direta; 0.7–0.9 quando precisou interpretar (qual cota é de qual parede, conversão de face para eixo); abaixo de 0.7 quando chutou ou faltou cota. Seja honesto: o revisor confia no número.
- Ids curtos e estáveis: externas pela orientação (\`N1\`, \`S1\`, \`S2\`, \`E1\`, \`W1\`), internas \`I1\`, \`I2\`…; aberturas \`<parede>-<tag ou tipo><n>\`.

## Aberturas internas e sem cota
- Todo símbolo de porta (folha com arco de giro, porta de correr ou de bolso, vão com linhas de batente) é uma abertura da parede em que está, com tag ou sem. Sem tag: \`type: "door"\`, com \`roughWidth\` quando a planta cota o vão, ou a tag do tipo do schedule quando a largura desenhada só cabe num tipo; senão RO null e uma nota.
- Tags de porta no texto posicionado (\`U2\`, \`1\`, \`114\`, \`103A\`, os tipos numéricos de um "DOOR SCHEDULE - UNITS") marcam uma porta na parede mais próxima da tag. Registre em \`notes\` todas as tags de porta encontradas e o destino de cada uma: abertura \`<id>\` na parede \`<id>\`, ou o motivo de não ser porta (delta de revisão, bolha de vista, carimbo, tabela).
- Posição de cada abertura, nesta ordem, declarando a fonte em \`positionSource\`: \`dimension\` — cota explícita até o eixo (ou até a borda: use \`offset\`), inclusive pelas notas gerais ("dimensions to doors are taken to the center line"); \`rule\` — regra escrita na folha ("single doors to be located 4\\" from adjacent face of stud", "double doors centered on closet"): aplique a regra com as cotas da parede e mostre a conta em \`evidence\`; \`scaled\` — não há cota nem regra: meça no recorte, pela escala da planta e a partir de uma cota próxima conhecida, e dê a medida em polegadas inteiras com confiança ≤ 0.5. Uma porta nunca fica de fora nem sem posição por falta de cota: \`scaled\` é o último recurso, marcado para o revisor conferir.
- Plantas ampliadas (ENLARGED UNIT PLANS, A-4xx) são a fonte do interior das unidades: paredes, portas e regras de posicionamento de lá valem sobre a planta geral quando divergem; cite a folha em \`evidence\`.
- Janelas sem tag na planta: a tag vem da elevação externa pela posição ao longo da fachada; o peitoril idem.
- Autochecagem em \`rooms\`: um item por cômodo fechado do pavimento (bedroom, bathroom, closet, kitchen, living, hall, vestibule, mech…) com os ids das portas que dão acesso a ele. Cômodo sem nenhuma porta encontrada fica com \`doors: []\` e uma \`note\` dizendo por quê (vão aberto sem porta, símbolo não visível, fora do pavimento). Use a lista para voltar à planta antes de responder: todo quarto, banheiro e closet tem porta.
- Planta com paredes fora dos eixos (rotação de poucos graus): mantenha a premissa de eixos, leia as cotas como estão e registre em \`notes\`.

## O que NÃO fazer
- Não escolher header, jacks ou kings: isso é do motor e das tabelas do IRC.
- Não arredondar cotas nem converter para decimal — a exceção é a posição \`scaled\`, que já nasce medida e marcada.
- Não omitir paredes porque faltou cota: inclua com confiança baixa e explique em \`notes\`.
- Não omitir aberturas porque faltou cota: posição \`scaled\`, confiança baixa e uma nota.`;

/** JSON Schema do `ExtractionOutput`, gerado do zod: vai no system prompt em vez de structured outputs. */
export const RESPONSE_SCHEMA = z.toJSONSchema(ExtractionOutput) as Record<string, unknown>;

/**
 * System prompt completo: convenções + formato da resposta. Sem structured outputs: a API recusa o schema
 * (33 campos nullable, gramática grande demais), então o modelo recebe o JSON Schema em texto e o zod valida
 * a resposta depois (`finish`).
 */
export const FULL_SYSTEM_PROMPT =
  SYSTEM_PROMPT +
  '\n\n## Formato da resposta\n' +
  'Responda SOMENTE com um objeto JSON válido, sem markdown, sem cerca de código e sem texto antes ou depois, ' +
  'que satisfaça este JSON Schema (todo campo é obrigatório; use null onde o schema permite e o desenho não dá o dado):\n' +
  JSON.stringify(RESPONSE_SCHEMA);

export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

/** Um recorte de uma página de planta, pronto para a mensagem: a imagem e o que a legenda precisa dizer. */
export interface PageTile {
  /** Número original da página no PDF (o mesmo do `# página N` do texto posicionado). */
  page: number;
  sheet?: string;
  title?: string;
  grid: TileGrid;
  tile: RenderedTile;
}

/** Um PDF já recortado às páginas enviadas, com o texto posicionado dessas páginas na mesma ordem. */
export interface PdfInput {
  name: string;
  pdf: Uint8Array;
  pages: readonly PageText[];
  /** Recortes em alta resolução das páginas de planta deste PDF (ordem de página, linha, coluna). */
  tiles?: readonly PageTile[];
}

export interface ImageInput {
  name: string;
  data: Uint8Array;
  mediaType: ImageMediaType;
}

export interface PromptInput {
  pdfs: readonly PdfInput[];
  images?: readonly ImageInput[];
  hints?: ExtractHints;
}

function hintsText(h: ExtractHints | undefined): string {
  const parts: string[] = [];
  if (h?.level !== undefined) parts.push(`Pavimento pedido: ${h.level}.`);
  if (h?.projectName !== undefined) parts.push(`Nome do projeto: ${h.projectName}.`);
  if (h?.extra !== undefined && h.extra.trim() !== '') parts.push(h.extra.trim());
  return parts.join('\n');
}

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/**
 * Conteúdo da mensagem do usuário: cada PDF como `document` seguido do texto posicionado de cada página e dos
 * recortes das suas plantas (legenda + imagem), cada imagem do usuário como `image` precedida do nome, as
 * dicas e a instrução final. Determinístico.
 */
export function buildUserContent(input: PromptInput): Anthropic.ContentBlockParam[] {
  if (input.pdfs.length === 0 && (input.images?.length ?? 0) === 0) {
    throw new RangeError('buildUserContent: nenhum PDF nem imagem');
  }
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const doc of input.pdfs) {
    blocks.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: toBase64(doc.pdf) },
      title: doc.name,
    });
    for (const p of doc.pages) {
      blocks.push({ type: 'text', text: `## ${doc.name}\n${formatPageText(p)}` });
    }
    for (const t of doc.tiles ?? []) {
      blocks.push({
        type: 'text',
        text: tileCaption({ name: doc.name, page: t.page, ...(t.sheet === undefined ? {} : { sheet: t.sheet }), ...(t.title === undefined ? {} : { title: t.title }), grid: t.grid, tile: t.tile }),
      });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: t.tile.mediaType, data: toBase64(t.tile.data) } });
    }
  }
  for (const img of input.images ?? []) {
    blocks.push({ type: 'text', text: `## imagem: ${img.name}` });
    blocks.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: toBase64(img.data) } });
  }
  const hints = hintsText(input.hints);
  blocks.push({
    type: 'text',
    text:
      (hints === '' ? '' : `${hints}\n\n`) +
      'Extraia as paredes do pavimento, com aberturas, tipos de parede e schedules, no formato pedido. ' +
      'Explique em `evidence` cada conta e em `notes` tudo que ficou em dúvida.',
  });
  return blocks;
}
