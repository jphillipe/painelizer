/**
 * Lista de corte de um painel: quantas peças de cada (papel, seção, comprimento)
 * a serra precisa produzir.
 *
 * Convenções (fixture `wall-144-plain.json`, `$comment` e `expected.cutList`):
 * - As três plates (bottom, top, double top) aparecem sob um único papel `plates`:
 *   para a serra são a mesma peça. Os demais papéis mantêm o nome do `MemberRole`.
 * - `qty` conta peças cortadas, não members: um header de 2 plies vale 2 peças.
 * - Comprimentos são arredondados ao 1/64" para agrupar (`LENGTH_RESOLUTION`), evitando que ruído
 *   de ponto flutuante gere linhas duplicadas.
 * - Ordem: papel na sequência da folha de fabricação (`docs/00-visao.md`) e,
 *   dentro do papel, comprimento decrescente; empate desfeito pela seção.
 */

import { isPlateRole, pieceCount, type MemberRole, type Panel, type PlateRole } from '../panel';
import { sectionDepth, type Section } from '../sections';

/** Papel na lista de corte. `plates` reúne bottom, top e double top plate. */
export type CutRole = 'plates' | Exclude<MemberRole, PlateRole>;

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
  'block',
];

/** Ordem das seções serradas, da menor para a maior profundidade. */
export const SECTION_ORDER: readonly Section[] = ['2x4', '2x6', '2x8', '2x10', '2x12'];

/** Posição de ordenação: serradas na ordem da tabela; engenheiradas (LVL/PSL) depois, por profundidade. */
export function sectionRank(section: Section): number {
  const i = SECTION_ORDER.indexOf(section);
  return i >= 0 ? i : SECTION_ORDER.length + sectionDepth(section);
}

/** Resolução usada para agrupar comprimentos (1/64"). */
const LENGTH_RESOLUTION = 64;

export function cutRoleOf(role: MemberRole): CutRole {
  return isPlateRole(role) ? 'plates' : role;
}

/** Arredonda ao 1/64" mais próximo. */
export function roundLength(length: number): number {
  return Math.round(length * LENGTH_RESOLUTION) / LENGTH_RESOLUTION;
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
  return sectionRank(a.section) - sectionRank(b.section);
}
