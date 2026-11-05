/**
 * Peso estimado da madeira de um painel (S15, hipótese P8).
 *
 * - Serrada (2x e posts 4x4/4x6/6x6, S37): lb por pé linear por seção em `src/data/lumber.json` (SPF a ~35 pcf). Header de N plies pesa
 *   N vezes a peça.
 * - Engenheirada (LVL/PSL): seção real (espessura × profundidade) a `engineeredPcf`.
 * - Sheathing (S38, P8 revista): só no painel com `sheathing` — a área instalada × `sheathingPsfPerInch` × espessura
 *   (`PanelSheathing.weightLb`, calculado em `rules/sheathing.ts`). Sem chapa, só a madeira, como antes. Pregos e
 *   isolamento nunca. A fábrica pediu o peso estimado em cada folha (P15) e vai dizer o limite do equipamento; até lá
 *   `config.panel.maxWeight` é opcional.
 * - `panelWeight` arredonda a 0.1 lb; `memberWeightLb` não arredonda.
 */

import { pieceCount, type Panel, type PanelSheathing } from '../panel';
import { isSawnSection, parseEngineeredSection, type SawnSection, type Section } from '../sections';
import lumber from '../data/lumber.json';

/** lb por pé linear de cada seção serrada, 2x e posts (P8, P45). */
export const POUNDS_PER_FOOT: Readonly<Record<SawnSection, number>> = lumber.poundsPerFoot;

/** lb por pé² de chapa por polegada de espessura (S38, P8 revista): 3.2 → 1.4 lb/pé² para 7/16". */
export const SHEATHING_PSF_PER_INCH: number = lumber.sheathingPsfPerInch;

/** Densidade usada para LVL/PSL, lb/ft³ (P8). */
export const ENGINEERED_PCF: number = lumber.engineeredPcf;

/** lb por pé linear de uma peça da seção (serrada pela tabela; engenheirada pela seção real). */
export function poundsPerFoot(section: Section): number {
  if (isSawnSection(section)) return POUNDS_PER_FOOT[section];
  const e = parseEngineeredSection(section);
  if (e === undefined) throw new RangeError(`weight: unknown section (${String(section)})`);
  return ((e.width * e.depth) / 144) * ENGINEERED_PCF;
}

/** Peso de um member, lb (plies contam). */
export function memberWeightLb(m: { section: Section; length: number; plies?: number }): number {
  if (!Number.isFinite(m.length) || m.length < 0) throw new RangeError(`weight: invalid length (${m.length})`);
  return (m.length / 12) * poundsPerFoot(m.section) * pieceCount(m);
}

/** Peso estimado do painel, lb, arredondado a 0.1: a madeira e, quando há, a chapa (S38). */
export function panelWeight(panel: Pick<Panel, 'members'> & { sheathing?: Pick<PanelSheathing, 'weightLb'> | undefined }): number {
  const total = panel.members.reduce((sum, m) => sum + memberWeightLb(m), 0) + (panel.sheathing?.weightLb ?? 0);
  return Math.round(total * 10) / 10;
}
