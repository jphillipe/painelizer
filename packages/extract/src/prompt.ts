/**
 * O prompt da extração (S18). Determinístico: mesma entrada, mesmas mensagens. O system prompt é
 * fixo (cacheável); a parte variável — as páginas do PDF e o texto posicionado — vai na mensagem
 * do usuário. As convenções abaixo são as do CLI (`packages/cli/src/project.ts`) e de
 * `docs/02-framing.md`; mudou lá, muda aqui.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { formatPageText, type PageText } from './pdf';

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
Páginas de um PDF vetorial: a planta de um pavimento (A-1xx) e, quando houver, a folha de tipos de parede e schedules de portas e janelas (A-8xx). Junto vem o texto posicionado de cada página (x, y em pontos, y crescendo para baixo; \`rot=90\` ou \`rot=-90\` marca texto de cotas verticais). Use a imagem para entender a geometria e o texto posicionado para ler cada cota sem erro.

## Convenções de saída
- Medidas sempre como texto copiado do desenho (\`16' - 0"\`, \`8' - 5 7/8"\`, \`56"\`). Faça contas só quando a convenção abaixo exigir, e mostre a conta em \`evidence\`.
- Paredes no EIXO (centro da espessura do stud). Cotas externas tomadas da face externa do stud (leia as notas gerais da planta) viram eixo somando metade da espessura: 1 3/4" para 2x4 (3 1/2"), 2 3/4" para 2x6 (5 1/2"). Cotas internas entre faces de GWB: some a espessura do GWB de cada lado mais metade do stud.
- Planta fechada: dê \`start\` e \`end\` de cada parede, paralelas aos eixos, com origem no canto externo do prédio que você escolher (diga qual em \`origin\`), x para leste e y para norte, ambos no eixo das paredes. Parede que encontra outra num canto termina no cruzamento dos dois eixos; em T, termina no eixo da parede atravessada. Deixe \`length\` null.
- Se não dá para fechar a planta (trecho isolado, cotas insuficientes), use \`length\` no eixo e deixe \`start\`/\`end\` null. Não misture as duas formas num mesmo projeto.
- \`endsStart\`/\`endsEnd\`: só quando o desenho mostra qual parede atravessa o canto; senão null.
- Aberturas: posição pelo EIXO da abertura medido do \`start\` da parede (\`center\`), como as plantas de arquiteto cotam portas e janelas. Se a planta cota a borda do RO, use \`offset\`. Tag do schedule em \`tag\`; sem schedule, \`type\` + RO se o desenho der.
- Altura do topo do RO (\`headerHeight\`) só se a elevação ou o schedule der head height; senão null. Peitoril de janela vai em \`openingTypes[].sillHeight\`.
- Tipos de parede: leia a folha de partition types (stud 2x4 ou 2x6, externa ou interna) e dê \`wallType\` em cada parede com a tag que a planta usa; sem tag na parede, deduza pela nota geral ("all exterior walls are type X1") e diga isso em \`evidence\`.
- \`bearing\`: externa é portante. Interna só é portante se o desenho disser; na dúvida, false e uma nota.
- Pavimento: \`level\` 1 para a planta do primeiro piso habitável (1st Floor), 2 para a de cima.
- Altura da parede: dos cortes ou das notas (pé-direito + estrutura do piso). Sem isso, null.
- Dados estruturais (neve, vento, largura, espécie) só se estiverem nas notas; a planta de arquiteto normalmente não traz — deixe null.
- Confiança: 1.0 quando a cota está explícita e a conta é direta; 0.7–0.9 quando precisou interpretar (qual cota é de qual parede, conversão de face para eixo); abaixo de 0.7 quando chutou ou faltou cota. Seja honesto: o revisor confia no número.
- Ids curtos e estáveis: externas pela orientação (\`N1\`, \`S1\`, \`S2\`, \`E1\`, \`W1\`), internas \`I1\`, \`I2\`…; aberturas \`<parede>-<tag ou tipo><n>\`.

## O que NÃO fazer
- Não escolher header, jacks ou kings: isso é do motor e das tabelas do IRC.
- Não arredondar cotas nem converter para decimal.
- Não omitir paredes porque faltou cota: inclua com confiança baixa e explique em \`notes\`.`;

export interface PromptInput {
  /** PDF já recortado às páginas enviadas (ver `subsetPdf`). */
  pdf: Uint8Array;
  /** Texto posicionado das mesmas páginas, na mesma ordem. */
  pages: readonly PageText[];
  hints?: ExtractHints;
}

function hintsText(h: ExtractHints | undefined): string {
  const parts: string[] = [];
  if (h?.level !== undefined) parts.push(`Pavimento pedido: ${h.level}.`);
  if (h?.projectName !== undefined) parts.push(`Nome do projeto: ${h.projectName}.`);
  if (h?.extra !== undefined && h.extra.trim() !== '') parts.push(h.extra.trim());
  return parts.join('\n');
}

/** Conteúdo da mensagem do usuário: PDF recortado, texto posicionado de cada página, dicas e a ordem. */
export function buildUserContent(input: PromptInput): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(input.pdf).toString('base64') },
      title: 'Páginas selecionadas do projeto de arquitetura',
    },
  ];
  for (const p of input.pages) {
    blocks.push({ type: 'text', text: formatPageText(p) });
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
