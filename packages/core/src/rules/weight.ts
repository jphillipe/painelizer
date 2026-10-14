/**
 * Peso estimado da madeira de um painel (S15, hipótese P8).
 *
 * - Serrada: lb por pé linear por seção em `src/data/lumber.json` (SPF a ~35 pcf). Header de N plies pesa
 *   N vezes a peça.
 * - Engenheirada (LVL/PSL): seção real (espessura × profundidade) a `engineeredPcf`.
 * - Só a madeira: sem sheathing, pregos ou isolamento (a folha anota). A fábrica pediu o peso estimado em
 *   cada folha (P15) e vai dizer o limite do equipamento; até lá `config.panel.maxWeight` é opcional.
 * - `panelWeight` arredonda a 0.1 lb; `memberWeightLb` não arredonda.
 */

import { isLumberSection, parseEngineeredSection, type LumberSection, type Member, type Panel } from '../types';
import { pieceCount } from '../output/cutlist';
import lumber from '../data/lumber.json';

/** lb por pé linear de cada seção serrada (P8). */
export const POUNDS_PER_FOOT: Readonly<Record<LumberSection, number>> = lumber.poundsPerFoot;

/** Densidade usada para LVL/PSL, lb/ft³ (P8). */
export const ENGINEERED_PCF: number = lumber.engineeredPcf;

/** lb por pé linear de uma peça da seção (serrada pela tabela; engenheirada pela seção real). */
export function poundsPerFoot(section: Member['section']): number {
  if (isLumberSection(section)) return POUNDS_PER_FOOT[section];
  const e = parseEngineeredSection(section);
  if (e === undefined) throw new RangeError(`peso: seção desconhecida (${String(section)})`);
  return ((e.width * e.depth) / 144) * ENGINEERED_PCF;
}

/** Peso de um member, lb (plies contam). */
export function memberWeightLb(m: Pick<Member, 'section' | 'length' | 'plies'>): number {
  if (!Number.isFinite(m.length) || m.length < 0) throw new RangeError(`peso: comprimento inválido (${m.length})`);
  return (m.length / 12) * poundsPerFoot(m.section) * pieceCount(m);
}

/** Peso estimado da madeira do painel, lb, arredondado a 0.1. */
export function panelWeight(panel: Pick<Panel, 'members'>): number {
  const total = panel.members.reduce((sum, m) => sum + memberWeightLb(m), 0);
  return Math.round(total * 10) / 10;
}
