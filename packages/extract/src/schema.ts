/**
 * O que o modelo devolve (S18): um objeto plano, validado por zod, que `convert.ts` transforma no JSON
 * de projeto do CLI. O modelo não escreve o formato do CLI diretamente porque structured outputs não
 * lida bem com chaves dinâmicas (`openingTypes` por tag) nem com campos que mudam de forma; aqui tudo
 * é lista, e campo ausente é `null`, nunca omitido.
 *
 * Medidas são texto como no desenho (`16' - 0"`, `8' - 5 7/8"`, `56"`): `parseFeetInches` do core lê
 * esse formato, e manter a string preserva a evidência para a revisão humana.
 *
 * `positionSource` e `rooms` (2026-10-30) têm default para as leituras gravadas antes deles continuarem
 * válidas; no JSON Schema que vai ao modelo eles aparecem como campos normais.
 */

import { z } from 'zod';

export const Measure = z
  .string()
  .describe('Medida copiada do desenho, em pés-polegadas-fração: `16\' - 0"`, `8\' - 5 7/8"`, `56"`.');

export const Point = z.object({
  x: Measure.describe('x no eixo da parede, a partir da origem declarada em `origin`; leste positivo.'),
  y: Measure.describe('y no eixo da parede; norte positivo.'),
});

export const PositionSource = z.enum(['dimension', 'rule', 'scaled']);

export const OpeningOut = z.object({
  id: z.string().describe('Id único no projeto, ex.: `N1-A`, `S2-D1`.'),
  tag: z.string().nullable().describe('Tag do schedule (janela `A`, porta `1`, `U2`), quando a planta usa tag.'),
  type: z.enum(['window', 'door']).nullable().describe('Obrigatório quando não há tag no schedule.'),
  center: Measure.nullable().describe('Eixo da abertura medido do `start` da parede, como a planta cota (notas de cota).'),
  offset: Measure.nullable().describe('Só quando a planta cota a borda do RO em vez do eixo.'),
  positionSource: PositionSource.nullable()
    .default(null)
    .describe(
      'De onde veio a posição: `dimension` (cota explícita), `rule` (regra escrita na folha, conta em `evidence`), `scaled` (medida no recorte pela escala; confiança ≤ 0.5). Null só quando não há posição.',
    ),
  roughWidth: Measure.nullable().describe('RO explícito na planta, se houver; senão null (o catálogo decide).'),
  roughHeight: Measure.nullable(),
  headerHeight: Measure.nullable().describe('Topo do RO acima do subfloor, se a elevação ou o schedule der; senão null.'),
  confidence: z.number().min(0).max(1),
  evidence: z.string().describe('As cotas e tags do desenho usadas, com a conta feita quando houve conversão.'),
});

export const WallOut = z.object({
  id: z.string().describe('Curto e único: `N1`, `S2`, `I1`, ou `W01`… quando a planta não sugere nome.'),
  start: Point.nullable().describe('Ponto inicial no eixo (planta fechada). Null quando se usa `length`.'),
  end: Point.nullable(),
  length: Measure.nullable().describe('Só para parede solta (sem planta fechada), no eixo. Null quando há start/end.'),
  endsStart: z
    .enum(['through', 'butt'])
    .nullable()
    .describe('No canto, se a planta mostra qual parede atravessa; null deixa a regra padrão (a mais longa).'),
  endsEnd: z.enum(['through', 'butt']).nullable(),
  wallType: z.string().nullable().describe('Tag do tipo de parede na planta (`X1`, `1`, `1B`).'),
  section: z.enum(['2x4', '2x6']),
  exterior: z.boolean(),
  bearing: z.boolean().describe('Externa = true. Interna: só true se o estrutural ou a planta indicar.'),
  floorsSupported: z.number().int().min(0).nullable().describe('Pavimentos acima desta parede, se o projeto permitir saber.'),
  floorSpan: z
    .enum(['center', 'clear'])
    .nullable()
    .describe('Como o piso apoia nesta parede, só se as notas estruturais disserem: `center` (viga central) ou `clear` (vão livre).'),
  height: Measure.nullable().describe('Altura da parede (subfloor ao topo da double top plate) se diferente de `wallHeight`.'),
  level: z.number().int().min(1).nullable(),
  openings: z.array(OpeningOut),
  confidence: z.number().min(0).max(1),
  evidence: z.string().describe('Cotas usadas e a conta da conversão para o eixo (face externa + t/2 etc.).'),
});

export const OpeningTypeOut = z.object({
  tag: z.string(),
  kind: z.enum(['window', 'door']),
  width: Measure.describe('Tamanho nominal da esquadria ou folha.'),
  height: Measure,
  frame: z.enum(['wood', 'hm', 'al']).nullable().describe('Portas: batente de madeira, metálico (HM) ou alumínio.'),
  sillHeight: Measure.nullable().describe('Peitoril acima do subfloor (janelas), do schedule ou da elevação.'),
  roughWidth: Measure.nullable(),
  roughHeight: Measure.nullable(),
  description: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
});

export const WallTypeOut = z.object({
  tag: z.string(),
  section: z.enum(['2x4', '2x6']),
  exterior: z.boolean(),
  description: z.string(),
  evidence: z.string(),
});

export const HeaderScheduleOut = z.object({
  mark: z.string(),
  section: z.string().describe('`2x10`, `LVL 1.75x9.25`…'),
  plies: z.number().int().min(1),
  jackStuds: z.number().int().min(1),
  kingStuds: z.number().int().min(1),
  description: z.string().nullable(),
});

export const BuildingOut = z.object({
  groundSnowLoad: z.number().nullable().describe('psf, das notas estruturais.'),
  buildingWidth: Measure.nullable().describe('Largura da casa na direção das vigas.'),
  windSpeed: z.number().nullable().describe('mph, Vult.'),
  exposure: z.enum(['B', 'C', 'D']).nullable(),
  species: z.enum(['SPF', 'Hem-Fir', 'DF', 'SP']).nullable(),
});

/** Autochecagem do modelo: cada cômodo fechado do pavimento e as portas que dão acesso a ele. */
export const RoomOut = z.object({
  name: z.string().describe('Como a planta chama (`Bedroom`, `Bathroom`, `Closet`, `Unit 2 Kitchen`).'),
  level: z.number().int().min(1).nullable(),
  doors: z.array(z.string()).describe('Ids das aberturas (portas ou vãos) que dão acesso ao cômodo; vazio = nenhuma encontrada.'),
  note: z.string().nullable().describe('Obrigatório quando `doors` está vazio: por que não há porta.'),
});

export const ExtractionOutput = z.object({
  projectName: z.string(),
  level: z.number().int().min(1).describe('Pavimento da planta lida.'),
  sheets: z.object({
    plan: z.string().nullable(),
    schedule: z.string().nullable(),
    elevations: z.string().nullable(),
  }),
  origin: z.string().describe('Onde fica (0,0) e como os eixos foram orientados, em uma frase.'),
  wallHeight: Measure.nullable().describe('Altura típica de parede do pavimento, se os cortes ou notas derem.'),
  headerHeight: Measure.nullable().describe('Topo de RO padrão do projeto, se houver; senão null.'),
  building: BuildingOut,
  wallTypes: z.array(WallTypeOut),
  openingTypes: z.array(OpeningTypeOut),
  headerSchedule: z.array(HeaderScheduleOut),
  walls: z.array(WallOut),
  rooms: z.array(RoomOut).default([]).describe('Um item por cômodo fechado do pavimento lido, com as portas que dão acesso a ele.'),
  notes: z.array(z.string()).describe('Tudo que não coube nos campos: dúvidas, cotas ausentes, conflitos, destino de cada tag de porta.'),
});

export type ExtractionOutput = z.infer<typeof ExtractionOutput>;
export type WallOut = z.infer<typeof WallOut>;
export type OpeningOut = z.infer<typeof OpeningOut>;
export type RoomOut = z.infer<typeof RoomOut>;
export type PositionSource = z.infer<typeof PositionSource>;
