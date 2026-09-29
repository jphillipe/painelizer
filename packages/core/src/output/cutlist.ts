/**
 * Lista de corte de um painel: quantas peças de cada (papel, seção, comprimento)
 * a serra precisa produzir.
 *
 * Convenções (fixture `wall-144-plain.json`, `$comment` e `expected.cutList`):
 * - As três plates (bottom, top, double top) aparecem sob um único papel `plates`:
 *   para a serra são a mesma peça. Os demais papéis mantêm o nome do `MemberRole`.
 * - `qty` conta peças cortadas, não members: um header de 2 plies vale 2 peças.
 * - Comprimentos são arredondados ao 1/64" para agrupar (mesma tolerância de
 *   `panelizeWall`), evitando que ruído de ponto flutuante gere linhas duplicadas.
 * - Ordem: papel na sequência da folha de fabricação (`docs/00-visao.md`) e,
 *   dentro do papel, comprimento decrescente; empate desfeito pela seção.
 */

import type { Member, MemberRole, Panel, Section } from '../types';

/** Papel na lista de corte. `plates` reúne bottom, top e double top plate. */
export type CutRole = 'plates' | Exclude<MemberRole, 'bottomPlate' | 'topPlate' | 'doubleTopPlate'>;

export interface CutLine {
  role: CutRole;
  section: Section;
  /** Comprimento de corte, arredondado ao 1/64". */
  length: number;
  /** Número de peças a cortar (plies contam como peças). */
  qty: number;
}

/** Ordem de apresentação: a sequência da folha de fabricação em `docs/00-visao.md`. */
export const CUT_ROLE_ORDER: readonly CutRole[] = [
  'plates',
  'stud',
  'kingStud',
  'jackStud',
  'header',
  'sill',
  'cripple',
];

/** Ordem das seções, da menor para a maior profundidade. */
export const SECTION_ORDER: readonly Section[] = ['2x4', '2x6', '2x8', '2x10', '2x12'];

/** Resolução usada para agrupar comprimentos (1/64"). */
const LENGTH_RESOLUTION = 64;

export function cutRoleOf(role: MemberRole): CutRole {
  switch (role) {
    case 'bottomPlate':
    case 'topPlate':
    case 'doubleTopPlate':
      return 'plates';
    default:
      return role;
  }
}

/** Arredonda ao 1/64" mais próximo. */
export function roundLength(length: number): number {
  return Math.round(length * LENGTH_RESOLUTION) / LENGTH_RESOLUTION;
}

/** Número de peças físicas que um member representa (plies; ausente = 1). */
export function pieceCount(member: Pick<Member, 'plies'>): number {
  const plies = member.plies ?? 1;
  if (!Number.isInteger(plies) || plies < 1) {
    throw new RangeError(`cutList: plies inválido (${plies}); esperado inteiro ≥ 1`);
  }
  return plies;
}

/**
 * Lista de corte do painel, agrupada por (papel, seção, comprimento) e ordenada
 * por papel (`CUT_ROLE_ORDER`) e comprimento decrescente.
 */
export function cutList(panel: Pick<Panel, 'members'>): CutLine[] {
  const lines = new Map<string, CutLine>();

  for (const m of panel.members) {
    const role = cutRoleOf(m.role);
    const length = roundLength(m.length);
    const key = `${role}|${m.section}|${length}`;
    const qty = pieceCount(m);
    const line = lines.get(key);
    if (line) {
      line.qty += qty;
    } else {
      lines.set(key, { role, section: m.section, length, qty });
    }
  }

  return [...lines.values()].sort(compareCutLines);
}

export function compareCutLines(a: CutLine, b: CutLine): number {
  const byRole = CUT_ROLE_ORDER.indexOf(a.role) - CUT_ROLE_ORDER.indexOf(b.role);
  if (byRole !== 0) return byRole;
  if (a.length !== b.length) return b.length - a.length;
  return SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
}
