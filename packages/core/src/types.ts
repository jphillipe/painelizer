/**
 * Tipos do motor de painelização.
 *
 * Convenções (ver docs/02-framing.md):
 * - Todas as medidas em polegadas decimais.
 * - x=0 no início da parede (esquerda); y=0 na base da bottom plate.
 * - `Member.x` / `Member.y` = canto inferior esquerdo da peça.
 */

/** Seção nominal de madeira serrada. */
export type Section = '2x4' | '2x6' | '2x8' | '2x10' | '2x12';

/** Seções admitidas para studs e plates de parede. */
export type WallSection = Extract<Section, '2x4' | '2x6'>;

/** Espessura real de qualquer peça "2x" (polegadas). */
export const NOMINAL_2X_THICKNESS = 1.5;

/** Profundidade real (largura da face) de cada seção nominal, em polegadas. */
export const SECTION_DEPTH: Readonly<Record<Section, number>> = {
  '2x4': 3.5,
  '2x6': 5.5,
  '2x8': 7.25,
  '2x10': 9.25,
  '2x12': 11.25,
};

/** Profundidade real da seção. Sempre derivada; nunca é entrada. */
export function sectionDepth(section: Section): number {
  return SECTION_DEPTH[section];
}

export type OpeningType = 'window' | 'door';

/** Piso suportado pela parede: apoiado no centro (center-bearing) ou vão livre (clear span). */
export type FloorSpan = 'center' | 'clear';

/**
 * De onde veio o header de uma abertura: `'project'` (structural drawings, `Opening.header`),
 * o id da tabela (`'R602.7(1)'`, `'R602.7(2)'`) ou `'R602.7.4'` (peça deitada em parede não portante).
 */
export type HeaderSource = string;

/** Header especificado no projeto (structural drawings / header schedule). Manda sobre a tabela (P10). */
export interface OpeningHeader {
  section: Section;
  plies: number;
  /** Jacks de cada lado pedidos pelo projeto. `Opening.jackStuds`, se presente, prevalece. */
  jackStuds?: number;
}

/** Dados da edificação para a tabela de headers. Vêm das notas estruturais do projeto. */
export interface Building {
  /** Carga de neve no solo, psf. */
  groundSnowLoad: number;
  /** Largura da edificação, em polegadas. */
  buildingWidth: number;
}

/**
 * Abertura bruta (rough opening) na parede.
 * `offset` é a distância do início da parede (x=0) até a borda esquerda do RO.
 * Topo do RO = base do header; base do RO = topo − `roughHeight`.
 */
export interface Opening {
  id: string;
  type: OpeningType;
  offset: number;
  roughWidth: number;
  roughHeight: number;
  /** King studs de cada lado (inteiro ≥ 1). Ausente = 1. */
  kingStuds?: number;
  /**
   * Jack studs de cada lado (inteiro ≥ 1). O header apoia em todos. Ausente = os do header
   * (`header.jackStuds` do projeto ou NJ da tabela) ou 1. Menor que o NJ da tabela gera aviso
   * `HEADER_JACKS_BELOW_TABLE`.
   */
  jackStuds?: number;
  /**
   * y da base do header desta abertura, medido da base da bottom plate (= subfloor).
   * Sobrescreve `config.headerHeight` — o projeto manda (P2).
   */
  headerHeight?: number;
  /** Header do projeto. Ausente = tabela IRC (parede portante) ou peça deitada R602.7.4 (não portante). */
  header?: OpeningHeader;
}

export interface Wall {
  id: string;
  length: number;
  height: number;
  /** Seção nominal; a espessura real (3.5 / 5.5) vem de `sectionDepth`. */
  section: WallSection;
  exterior: boolean;
  bearing: boolean;
  openings: Opening[];
  /** Largura da edificação para esta parede, em polegadas; sobrescreve `config.building` (casa em L). */
  buildingWidth?: number;
  /** Pavimentos acima da parede que ela suporta (0 = só telhado e forro). Obrigatório para usar a tabela. */
  floorsSupported?: number;
  /** Ausente = pior caso entre center-bearing e clear span. */
  floorSpan?: FloorSpan;
  /**
   * x, nesta parede, da marca 0 do layout do prédio (S11). Ausente = 0 (parede solta). Negativo quando
   * a marca 0 fica antes da plate: `−t` da parede que atravessa, para a parede que encosta num canto;
   * `−x` do início do painel, para um painel no meio da parede. Os studs são centrados nas marcas
   * `layoutOrigin + k·studSpacing`; o primeiro stud fica sempre em 0.
   */
  layoutOrigin?: number;
}

export type MemberRole =
  | 'bottomPlate'
  | 'topPlate'
  | 'doubleTopPlate'
  | 'stud'
  | 'kingStud'
  | 'jackStud'
  | 'header'
  | 'sill'
  | 'cripple';

export type Orientation = 'horizontal' | 'vertical';

/** Uma peça do painel. */
export interface Member {
  role: MemberRole;
  section: Section;
  /** Comprimento de corte da peça. */
  length: number;
  x: number;
  y: number;
  orientation: Orientation;
  /** Número de camadas lado a lado (header). Ausente = 1. */
  plies?: number;
  /** Só no header: de onde veio a seção. */
  headerSource?: HeaderSource;
  /** Só no header: peça deitada (1.5" de altura na elevação, como o sill), não em pé. Ausente = em pé. */
  flat?: boolean;
}

/** Aviso de validação. Nunca interrompe a geração. */
export interface Warning {
  code: string;
  message: string;
}

/**
 * Corte a fazer na obra, marcado na folha do painel. Hoje só a bottom plate no vão da porta:
 * a plate sai inteira e é cortada depois de o painel estar em pé (P4).
 */
export interface FieldCut {
  role: MemberRole;
  openingId: string;
  /** Início do trecho a remover, medido de x=0. */
  x: number;
  length: number;
}

export interface Panel {
  id: string;
  wallId: string;
  length: number;
  height: number;
  section: WallSection;
  members: Member[];
  fieldCuts: FieldCut[];
  warnings: Warning[];
  /** `Wall.layoutOrigin` da parede (0 quando ausente); o SVG desenha as marcas a partir dele. */
  layoutOrigin?: number;
}

export interface Config {
  /** Espaçamento OC entre studs (16 ou 24). */
  studSpacing: number;
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
}
