/**
 * Painel e suas peças. Convenções (docs/02-framing.md):
 * - Todas as medidas em polegadas decimais.
 * - x=0 no início do painel (esquerda); y=0 na base da bottom plate.
 * - `Member.x` / `Member.y` = canto inferior esquerdo da peça.
 */

import { isCount } from './eps';
import type { HeaderSource, OpeningType } from './opening';
import type { Section, WallSection } from './sections';
import type { Point } from './wall';
import type { Warning } from './messages';

/** Aviso de validação (código, ids e parâmetros; frase em português montada em `messages.ts`). */
export type { Warning };

export type PlateRole = 'bottomPlate' | 'topPlate' | 'doubleTopPlate';

export type MemberRole =
  | PlateRole
  | 'stud'
  | 'kingStud'
  | 'jackStud'
  | 'header'
  | 'sill'
  | 'cripple'
  | 'block';

/** As três plates: para a serra são a mesma peça (lista de corte); só elas emendam sobre stud (S15). */
export const PLATE_ROLES: ReadonlySet<MemberRole> = new Set<MemberRole>(['bottomPlate', 'topPlate', 'doubleTopPlate']);

export function isPlateRole(role: MemberRole): role is PlateRole {
  return PLATE_ROLES.has(role);
}

export type Orientation = 'horizontal' | 'vertical';

interface MemberBase {
  section: Section;
  /** Comprimento de corte da peça. */
  length: number;
  x: number;
  y: number;
}

/** Bottom, top e double top plate: deitadas, da seção da parede. */
export interface PlateMember extends MemberBase {
  role: PlateRole;
  orientation: 'horizontal';
}

/** Stud de altura inteira: de layout, extra do projeto (`label`) ou de canto/encosto (S14). */
export interface StudMember extends MemberBase {
  role: 'stud';
  orientation: 'vertical';
  /**
   * Stud do canto California (S14): deitado, ocupa `sectionDepth` em x e 1.5" na espessura da parede.
   * Ausente = em pé.
   */
  flat?: boolean;
  /** Texto do projeto para o stud extra (`ExtraStud.label`); vai para o `<title>` no SVG. */
  label?: string;
}

/** King, jack e cripple: verticais em pé, da seção da parede. */
export interface OpeningStudMember extends MemberBase {
  role: 'kingStud' | 'jackStud' | 'cripple';
  orientation: 'vertical';
}

export interface HeaderMember extends MemberBase {
  role: 'header';
  orientation: 'horizontal';
  /** Número de camadas lado a lado. */
  plies: number;
  /** De onde veio a seção. */
  headerSource: HeaderSource;
  /** Peça deitada (R602.7.4): 1.5" de altura na elevação, como o sill. Ausente = em pé. */
  flat?: boolean;
}

/**
 * Uso de uma fileira de blocos: `'fire'` = fire blocking (S31; R302.11, P11/P50); `'backing'` = fileira por altura
 * pedida pelo projeto (S36, P44: armários, acessórios de banheiro), com o uso em `label`. Ausente = ladder do T.
 */
export type BlockingKind = 'fire' | 'backing';

/** Sill e bloco (ladder do T, fire blocking, fileira por altura): deitados, da seção da parede. */
export interface FlatMember extends MemberBase {
  role: 'sill' | 'block';
  orientation: 'horizontal';
  /** Só no bloco: uso da fileira. Ausente = ladder do T. */
  blocking?: BlockingKind;
  /** Só no bloco de fileira por altura (S36): o uso ("Countertop"); vai para a folha. */
  label?: string;
}

/** Uma peça do painel. O papel decide os campos: `plies`/`headerSource` só no header, `label` só no stud. */
export type Member = PlateMember | StudMember | OpeningStudMember | HeaderMember | FlatMember;

/** Texto do projeto para a peça (stud extra; uso da fileira de blocking, S36), `undefined` nas demais. */
export function labelOf(m: Member): string | undefined {
  return m.role === 'stud' || m.role === 'block' ? m.label : undefined;
}

/**
 * Número de peças físicas que um member representa (plies do header; 1 nas demais).
 *
 * @throws RangeError plies que não é inteiro ≥ 1
 */
export function pieceCount(member: Member | { plies?: number }): number {
  const plies = ('plies' in member ? member.plies : undefined) ?? 1;
  if (!isCount(plies)) {
    throw new RangeError(`cutList: invalid plies (${plies}); expected a whole number ≥ 1`);
  }
  return plies;
}

/** Peças a cortar do painel: header de n plies conta n (lista de corte, folha e panels.csv — Checkpoint 3). */
export function piecesOf(panel: Pick<Panel, 'members'>): number {
  return panel.members.reduce((n, m) => n + pieceCount(m), 0);
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

/**
 * Rough opening como fica no painel (S17): em x do painel, com o topo do RO (= base do header) medido da
 * base da bottom plate (= subfloor). Base do RO = `top − height` (0 na porta).
 */
export interface PanelOpening {
  id: string;
  type: OpeningType;
  /** x da borda esquerda do RO. */
  x: number;
  width: number;
  /** y do topo do RO = base do header. */
  top: number;
  /** Altura do RO (`Opening.roughHeight`). */
  height: number;
}

/**
 * Face da parede voltada para quem lê a folha, com o início da parede (x=0) à esquerda (S17, hipótese P24).
 * Só em parede externa em planta: `'exterior'` quando o lado de fora fica à direita do sentido start→end.
 */
export type PanelFacing = 'exterior' | 'interior';

export interface Panel {
  /** `{level}-{wallId}-P{n}` (S16): pavimento, parede e ordem do painel de start para end, sempre com `-P1`. */
  id: string;
  wallId: string;
  /** Pavimento da parede (`Wall.level`, 1 quando ausente). */
  level: number;
  length: number;
  height: number;
  section: WallSection;
  members: Member[];
  fieldCuts: FieldCut[];
  warnings: Warning[];
  /** Aberturas do painel, em x do painel (S17). */
  openings: PanelOpening[];
  /** `Wall.exterior` / `Wall.bearing` da parede de origem (S17), para o cabeçalho da folha. */
  exterior: boolean;
  bearing: boolean;
  /** Tag do tipo de parede (`Wall.wallType`, S35), para a folha e o `panels.csv`. Só quando a parede tem. */
  wallType?: string;
  /** Face voltada para quem lê a folha (S17). Só em parede externa em planta. */
  facing?: PanelFacing;
  /** `Wall.layoutOrigin` da parede (0 quando ausente); o SVG desenha as marcas a partir dele. */
  layoutOrigin: number;
  /** x, na parede, onde este painel começa (S15); 0 no primeiro painel. */
  wallOffset: number;
  /** Peso estimado da madeira, lb, sem sheathing (S15, hipótese P8). */
  weightLb: number;
  /**
   * Pontas da plate deste painel em planta (S16): `start` é o x=0 do painel, `end` o `length`. Só na casa em
   * planta (`panelizeHouse`); parede solta não tem.
   */
  plan?: { start: Point; end: Point };
}
