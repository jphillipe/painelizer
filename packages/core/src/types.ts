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
  /** Jack studs de cada lado (inteiro ≥ 1). Ausente = 1. O header apoia em todos. */
  jackStuds?: number;
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
}

/** Aviso de validação. Nunca interrompe a geração. */
export interface Warning {
  code: string;
  message: string;
}

export interface Panel {
  id: string;
  wallId: string;
  length: number;
  height: number;
  section: WallSection;
  members: Member[];
  warnings: Warning[];
}

export interface Config {
  /** Espaçamento OC entre studs (16 ou 24). */
  studSpacing: number;
  /** Espessura do stud (1.5). */
  studThickness: number;
  /** Espessura de cada plate (1.5). */
  plateThickness: number;
  /** Comprimento de pré-corte do stud (92.625 para parede de 97.125). */
  studLength: number;
  /**
   * y da base do header, medido da base da bottom plate.
   * Ausente = header encostado na face inferior da top plate (pendência P2).
   */
  headerHeight?: number;
  /** Seção do header enquanto a tabela IRC (S9) não existe. */
  defaultHeaderSection?: Section;
  defaultHeaderPlies?: number;
}
