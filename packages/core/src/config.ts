/**
 * Configuração do projeto: espaçamento, espessuras, pré-cortes, dados da casa, catálogo e divisão em painéis.
 * Todas as medidas em polegadas decimais; peso em lb.
 */

import type { HeaderScheduleEntry, OpeningCatalogEntry } from './opening';
import type { Section } from './sections';
import type { Wall } from './wall';

/** Espaçamento OC entre studs admitido no escopo v1 (docs/01-escopo-v1.md). */
export type StudSpacing = 16 | 24;

/** Comprimentos comerciais em estoque, polegadas: 8', 10', 12', 14', 16' (P9). */
export const DEFAULT_STOCK_LENGTHS: readonly number[] = [96, 120, 144, 168, 192];

/** Categoria de exposição ao vento (ASCE 7). A Tabela R602.7.5 só cobre B e C. */
export type Exposure = 'B' | 'C' | 'D';

/** Espécies comuns nas notas estruturais americanas. */
export type LumberSpecies = 'SPF' | 'Hem-Fir' | 'DF' | 'SP';

/** Dados da edificação para as tabelas de header e de kings. Vêm das notas estruturais do projeto. */
export interface Building {
  /** Carga de neve no solo, psf. */
  groundSnowLoad: number;
  /** Largura da edificação, em polegadas. */
  buildingWidth: number;
  /**
   * Velocidade básica de vento Vult, mph (Tabela R602.7.5: kings em parede externa). Ausente = 1 king
   * por lado e aviso `WIND_SPEED_MISSING` em cada abertura de parede externa.
   */
  windSpeed?: number;
  /** Categoria de exposição ao vento. Ausente = B. */
  exposure?: Exposure;
  /**
   * Espécie da madeira de framing nas notas estruturais (S12.5). As tabelas IRC carregadas são de SPF;
   * outra espécie gera aviso `SPECIES_NOT_IN_TABLE` quando o header vem da tabela. Guardada para a UI.
   */
  species?: LumberSpecies;
}

/** Montagem do canto externo (P5): California (stud deitado) ou três studs. */
export type CornerStyle = 'california' | 'three-stud';

/** Montagem do T (P5): ladder blocking ou studs de encosto (backer). */
export type TeeStyle = 'ladder' | 'backer';

/**
 * Divisão da parede em painéis transportáveis (S15; P6 respondida, P15 e P23 hipóteses).
 * Medidas em polegadas; `maxWeight` em lb.
 */
export interface PanelConfig {
  /** Comprimento máximo de um painel (P6: 240). */
  maxLength: number;
  /** Peso máximo de um painel, lb (P15: ausente = sem limite). */
  maxWeight?: number;
  /** Módulo preferido das quebras, contado da marca 0 do layout (P6: 48). */
  module: number;
  /** Avanço da double top plate sobre o painel seguinte (P23: 48). */
  lap: number;
  /** Avanço mínimo quando o de `lap` não cabe; também a defasagem mínima entre emendas de plate (P14: 24). */
  minLap: number;
}

/**
 * Preço de compra de uma peça (S31, orçamento): por peça de um comprimento de estoque (comercial ou pré-corte) ou por
 * pé linear da seção (o que vale para LVL/PSL, comprados no comprimento da peça). Moeda do projeto (sem conversão).
 */
export type PriceEntry =
  | { section: Section; /** Comprimento de estoque, polegadas. */ length: number; /** Preço por peça. */ price: number }
  | { section: Section; /** Preço por pé linear. */ perFoot: number };

export const DEFAULT_PANEL_CONFIG: Readonly<PanelConfig> = { maxLength: 240, module: 48, lap: 48, minLap: 24 };

export interface Config {
  /** Espaçamento OC entre studs. */
  studSpacing: StudSpacing;
  /** Espessura do stud (1.5). */
  studThickness: number;
  /** Espessura de cada plate (1.5). */
  plateThickness: number;
  /**
   * Pré-cortes de stud do projeto (P7): 92.625 para parede de 8' (97.125), 104.625 para 9' (109.125).
   * O stud derivado da altura deve estar na lista; senão, aviso `STUD_LENGTH_MISMATCH`.
   * A BOM usa a mesma lista como estoque pré-cortado (P9).
   */
  studLength: number[];
  /**
   * y da base do header, medido da base da bottom plate (= subfloor). Padrão da fábrica: 82.5 (P2).
   * `Opening.headerHeight` sobrescreve. Ausente nos dois = header encostado sob a top plate.
   */
  headerHeight?: number;
  /** Dados da casa, uma vez por projeto. Obrigatório para escolher header pela tabela. */
  building?: Building;
  /**
   * Janela com RO mais largo que isto (polegadas) leva sill dupla: duas peças deitadas, e os cripples
   * abaixo encurtam 1.5". Ausente = sill simples sempre. Hipótese de projeto: 72" (Horace S-507).
   */
  doubleSillOver?: number;
  /** Window/door schedule do projeto, por tag (S12.5). */
  openingTypes?: Record<string, OpeningCatalogEntry>;
  /** Wood header schedule do estrutural, por marca (S12.5). */
  headerSchedule?: Record<string, HeaderScheduleEntry>;
  /** Montagem do canto externo (S14). Ausente = `'california'` (P5). */
  corner?: CornerStyle;
  /** Montagem do T (S14). Ausente = `'ladder'` (P5, alturas por hipótese P22). */
  tee?: TeeStyle;
  /** Divisão em painéis (S15). Ausente = `DEFAULT_PANEL_CONFIG`. */
  panel?: PanelConfig;
  /**
   * Comprimentos comerciais em estoque, polegadas (P9). Plate de painel mais longa que o maior deles é
   * emendada sobre stud (S15, P14). Ausente = 8', 10', 12', 14', 16'. A BOM usa a mesma lista.
   */
  stockLengths?: number[];
  /**
   * Cavidade contínua (`height − 3·plateThickness`) acima disto leva fire blocking (R302.11; S31). Ausente = 120"
   * (P11); fileiras no meio dos trechos (P50).
   */
  fireBlockAt?: number;
  /** Tabela de preços para o orçamento (S31, `output/cost.ts`). Ausente = sem orçamento. */
  prices?: PriceEntry[];
}

/**
 * Comprimento do stud de altura inteira (stud, king, extra, de canto): da bottom plate à top plate,
 * `height − 3·plateThickness` (docs/02-framing.md).
 */
export function studLengthFor(wall: Pick<Wall, 'height'>, config: Pick<Config, 'plateThickness'>): number {
  return wall.height - 3 * config.plateThickness;
}
