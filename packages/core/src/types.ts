/**
 * Tipos do motor de painelização.
 *
 * Convenções (ver docs/02-framing.md):
 * - Todas as medidas em polegadas decimais.
 * - x=0 no início da parede (esquerda); y=0 na base da bottom plate.
 * - `Member.x` / `Member.y` = canto inferior esquerdo da peça.
 */

/** Seção nominal de madeira serrada. */
export type LumberSection = '2x4' | '2x6' | '2x8' | '2x10' | '2x12';

/** Madeira engenheirada de header (S12.5): LVL e PSL, com dimensões reais no nome. */
export type EngineeredMaterial = 'LVL' | 'PSL';

/**
 * Seção de madeira engenheirada, no formato `"LVL 1.75x9.25"` (material, espessura x profundidade em
 * polegadas decimais). Só aparece em header; studs e plates são sempre serrados.
 */
export type EngineeredSection = `${EngineeredMaterial} ${number}x${number}`;

/** Qualquer seção de peça: serrada ou engenheirada. */
export type Section = LumberSection | EngineeredSection;

/** Seções admitidas para studs e plates de parede. */
export type WallSection = Extract<LumberSection, '2x4' | '2x6'>;

/** Espessura real de qualquer peça "2x" (polegadas). */
export const NOMINAL_2X_THICKNESS = 1.5;

/** Comprimentos comerciais em estoque, polegadas: 8', 10', 12', 14', 16' (P9). */
export const DEFAULT_STOCK_LENGTHS: readonly number[] = [96, 120, 144, 168, 192];

/** Profundidade real (largura da face) de cada seção nominal, em polegadas. */
export const SECTION_DEPTH: Readonly<Record<LumberSection, number>> = {
  '2x4': 3.5,
  '2x6': 5.5,
  '2x8': 7.25,
  '2x10': 9.25,
  '2x12': 11.25,
};

export function isLumberSection(section: string): section is LumberSection {
  return section in SECTION_DEPTH;
}

const ENGINEERED_RE = /^(LVL|PSL) (\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/;

/** Decompõe `"LVL 1.75x9.25"`; `undefined` quando a string não é seção engenheirada. */
export function parseEngineeredSection(
  section: string,
): { material: EngineeredMaterial; width: number; depth: number } | undefined {
  const m = ENGINEERED_RE.exec(section);
  if (m === null) return undefined;
  const width = Number(m[2]);
  const depth = Number(m[3]);
  if (!(width > 0) || !(depth > 0)) return undefined;
  return { material: m[1] as EngineeredMaterial, width, depth };
}

/** Monta a string canônica de uma seção engenheirada. */
export function engineeredSection(material: EngineeredMaterial, width: number, depth: number): EngineeredSection {
  if (!(width > 0) || !(depth > 0)) throw new RangeError(`seção ${material} com dimensão inválida (${width}x${depth})`);
  return `${material} ${width}x${depth}` as EngineeredSection;
}

/** Profundidade real da seção. Sempre derivada; nunca é entrada. */
export function sectionDepth(section: Section): number {
  if (isLumberSection(section)) return SECTION_DEPTH[section];
  const e = parseEngineeredSection(section);
  if (e === undefined) throw new RangeError(`seção desconhecida (${String(section)})`);
  return e.depth;
}

/** Espessura real de uma peça da seção: 1.5" para serrada, a largura declarada para LVL/PSL. */
export function sectionThickness(section: Section): number {
  if (isLumberSection(section)) return NOMINAL_2X_THICKNESS;
  const e = parseEngineeredSection(section);
  if (e === undefined) throw new RangeError(`seção desconhecida (${String(section)})`);
  return e.width;
}

/**
 * Largura em x que uma peça vertical ocupa na elevação: a espessura da madeira (1.5") em pé, a profundidade
 * da seção quando deitada (`flat`, stud do canto California — S14).
 */
export function verticalWidth(m: { section: Section; flat?: boolean }): number {
  return m.flat === true ? sectionDepth(m.section) : NOMINAL_2X_THICKNESS;
}

/** Ponto em planta, polegadas (S13). Eixos x/y quaisquer — a origem é do arquiteto. */
export interface Point {
  x: number;
  y: number;
}

export type OpeningType = 'window' | 'door';

/** Piso suportado pela parede: apoiado no centro (center-bearing) ou vão livre (clear span). */
export type FloorSpan = 'center' | 'clear';

/**
 * De onde veio o header de uma abertura: `'project'` (structural drawings, `Opening.header`),
 * o id da tabela (`'R602.7(1)'`, `'R602.7(2)'`) ou `'R602.7.4'` (peça deitada em parede não portante).
 */
export type HeaderSource = string;

/**
 * Header especificado no projeto (structural drawings / header schedule). Manda sobre a tabela (P10).
 * `section` pode ser engenheirada (`"LVL 1.75x9.25"`, S12.5); a espessura total `plies × espessura`
 * precisa caber na parede.
 */
export interface OpeningHeader {
  section: Section;
  plies: number;
  /** Jacks de cada lado pedidos pelo projeto. `Opening.jackStuds`, se presente, prevalece. */
  jackStuds?: number;
}

/** Categoria de exposição ao vento (ASCE 7). A Tabela R602.7.5 só cobre B e C. */
export type Exposure = 'B' | 'C' | 'D';

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

/** Espécies comuns nas notas estruturais americanas. */
export type LumberSpecies = 'SPF' | 'Hem-Fir' | 'DF' | 'SP';

/** Tipo de batente de porta; define a folga do RO quando o projeto não a dá (S12.5). */
export type DoorFrame = 'wood' | 'hm' | 'al';

/**
 * Uma linha do window/door schedule do projeto (S12.5): o que a tag (W41, porta 114) significa.
 * `width`/`height` são o tamanho nominal do caixilho ou da folha, como na tabela do arquiteto.
 * O RO sai de `roughWidth`/`roughHeight` quando dados; senão de `width + folga` (ver `rules/catalog.ts`).
 */
export interface OpeningCatalogEntry {
  kind: OpeningType;
  width: number;
  height: number;
  /** Só porta. Ausente = `wood`. */
  frame?: DoorFrame;
  /** Só janela: altura do peitoril (base do RO) acima do subfloor, como no schedule. */
  sillHeight?: number;
  /** RO explícito do fabricante; manda sobre a folga default. */
  roughWidth?: number;
  roughHeight?: number;
  /** Texto livre do schedule (ex.: "vinyl double-hung"); vai para a UI. */
  description?: string;
}

/** Uma linha do wood header schedule do estrutural (S12.5): marca → header, jacks e kings. */
export interface HeaderScheduleEntry {
  section: Section;
  plies: number;
  jackStuds: number;
  kingStuds: number;
  description?: string;
}

/**
 * Abertura como o projeto a descreve (S12.5), antes de `resolveOpening` virar `Opening`:
 * tag do schedule, eixo do RO e marca de header, com os campos diretos de `Opening` como sobrescrita.
 */
export interface OpeningSpec {
  id: string;
  /** Tag do `Config.openingTypes` (W41, "114"). Ausente = `type`, `roughWidth` e `roughHeight` obrigatórios. */
  tag?: string;
  type?: OpeningType;
  /** x do eixo do RO (como a planta cota). Alternativa a `offset`. */
  center?: number;
  offset?: number;
  roughWidth?: number;
  roughHeight?: number;
  /** Marca do `Config.headerSchedule` (HDR2). Alternativa a `header`. */
  headerMark?: string;
  header?: OpeningHeader;
  /** Base do RO acima do subfloor (janela); deriva `headerHeight = sillHeight + roughHeight`. */
  sillHeight?: number;
  headerHeight?: number;
  kingStuds?: number;
  jackStuds?: number;
}

/**
 * Stud de altura inteira adicional pedido pelo projeto (post de hold-down, carga pontual, "studs to match
 * above"): `count` studs colados a partir de `x` para a direita (ausente = 1). Stud de layout que se
 * sobrepõe a um extra sai; extra dentro de uma zona de abertura ou fora da parede é erro.
 */
export interface ExtraStud {
  /** x da borda esquerda do primeiro stud. */
  x: number;
  count?: number;
  /** Texto livre do projeto (ex.: "HDU2 post"); vai para o `<title>` da peça no SVG. */
  label?: string;
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
  /**
   * King studs de cada lado (inteiro ≥ 1). Ausente = Tabela R602.7.5 em parede externa (vento de
   * `config.building.windSpeed`; sem ele, 1 e aviso `WIND_SPEED_MISSING`), 1 em parede interna.
   * Menor que a tabela gera aviso `HEADER_KINGS_BELOW_TABLE`.
   */
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
  /** Studs de altura inteira adicionais pedidos pelo projeto (S12). */
  extraStuds?: ExtraStud[];
  /** Pavimento da parede (1 = térreo). Ausente = 1. Entra no id dos painéis (S16): `{level}-{wallId}-P{n}`. */
  level?: number;
  /**
   * Ligações desta parede com as vizinhas, em x do painel (S14). Derivadas pela planta (`frameWalls`);
   * ausente = parede solta. Definem as peças de canto e T e os laps da double top plate.
   */
  joints?: WallJoints;
}

/** Como uma ponta da parede se liga à vizinha (S14). `otherThickness` = espessura real da outra parede. */
export type EndJoint =
  | {
      kind: 'corner';
      /** Esta parede atravessa o canto (plate até a face externa da outra) ou encosta nela. */
      through: boolean;
      otherThickness: number;
      wallId?: string;
    }
  | {
      /** Esta parede encosta em T no interior da outra. */
      kind: 'tee';
      otherThickness: number;
      wallId?: string;
    }
  | {
      /**
       * Junta com o painel vizinho da mesma parede (S15, hipótese P23). No `end` do painel i a double top
       * avança `lap` sobre o seguinte; no `start` do painel i+1 ela recua `lap`. `cuts` são vãos (faixa de um T
       * do painel vizinho) que caem no trecho avançado, em x deste painel.
       */
      kind: 'panel';
      lap: number;
      cuts?: { x: number; width: number }[];
      panelId?: string;
    };

/** Parede que encosta em T no interior desta, em x do painel: ocupa `[x − width/2, x + width/2]`. */
export interface TeeJoint {
  /** x do eixo da parede que encosta. */
  x: number;
  /** Espessura real da parede que encosta. */
  width: number;
  wallId?: string;
}

export interface WallJoints {
  start?: EndJoint;
  end?: EndJoint;
  tees?: TeeJoint[];
}

/** Montagem do canto externo (P5): California (stud deitado) ou três studs. */
export type CornerStyle = 'california' | 'three-stud';

/** Montagem do T (P5): ladder blocking ou studs de encosto (backer). */
export type TeeStyle = 'ladder' | 'backer';

export type MemberRole =
  | 'bottomPlate'
  | 'topPlate'
  | 'doubleTopPlate'
  | 'stud'
  | 'kingStud'
  | 'jackStud'
  | 'header'
  | 'sill'
  | 'cripple'
  | 'block';

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
  /**
   * Peça deitada (face larga virada para a face da parede). No header: 1.5" de altura na elevação, como o
   * sill (R602.7.4). No stud: stud do canto California (S14), que ocupa `sectionDepth` em x e 1.5" na
   * espessura da parede. Ausente = em pé.
   */
  flat?: boolean;
  /** Texto do projeto para a peça (stud extra: `ExtraStud.label`); vai para o `<title>` no SVG. */
  label?: string;
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
  /** `{level}-{wallId}-P{n}` (S16): pavimento, parede e ordem do painel de start para end, sempre com `-P1`. */
  id: string;
  wallId: string;
  /** Pavimento da parede (`Wall.level`, 1 quando ausente). */
  level?: number;
  length: number;
  height: number;
  section: WallSection;
  members: Member[];
  fieldCuts: FieldCut[];
  warnings: Warning[];
  /** `Wall.layoutOrigin` da parede (0 quando ausente); o SVG desenha as marcas a partir dele. */
  layoutOrigin?: number;
  /** x, na parede, onde este painel começa (S15). Ausente = 0 (parede de um painel só). */
  wallOffset?: number;
  /** Peso estimado da madeira, lb, sem sheathing (S15, hipótese P8). */
  weightLb?: number;
  /**
   * Pontas da plate deste painel em planta (S16): `start` é o x=0 do painel, `end` o `length`. Só na casa em
   * planta (`panelizeHouse`); parede solta não tem.
   */
  plan?: { start: Point; end: Point };
}

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

export const DEFAULT_PANEL_CONFIG: Readonly<PanelConfig> = { maxLength: 240, module: 48, lap: 48, minLap: 24 };

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
}
