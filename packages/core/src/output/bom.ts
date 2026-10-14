/**
 * Lista de material (BOM) consolidada: quantas peças de cada comprimento
 * comercial comprar para cortar todos os painéis.
 *
 * Regra (S4): cada peça da lista de corte sai de uma peça comercial própria,
 * a menor em que ela cabe. Não há aproveitamento de sobra (uma peça comercial
 * gerando duas de corte) — isso é otimização de corte, fora do escopo v1; por
 * isso a sobra reportada é um teto, não a real.
 *
 * Pré-cortes (S7.1, P9): 92 5/8" e 104 5/8" também são estoque, mas só atendem
 * peça 2x4/2x6 de comprimento igual ao pré-corte (stud, king…), com sobra zero.
 * Peça mais curta (jack, cripple) não sai de pré-corte: vai para o comercial.
 *
 * Comprimentos comerciais default: 8', 10', 12', 14', 16' (P9, confirmado em
 * 2026-10-01; `DEFAULT_STOCK_LENGTHS` em `types.ts`). Peça serrada mais longa que
 * o maior comercial sai numa linha `oversize: true` (estoque = o próprio corte, sem
 * sobra) em vez de lançar erro: desde a S15 as plates acima do estoque são
 * emendadas pelo motor, e o que ainda passar é algo para a folha mostrar, não
 * para derrubar a lista inteira. `stockLengthFor` continua lançando.
 */

import { DEFAULT_STOCK_LENGTHS, isLumberSection, type Panel, type Section } from '../types';
import { DEFAULT_PRECUTS, matchPrecut } from '../rules/precuts';
import { cutList, sectionRank } from './cutlist';

/** Seções em que existe pré-corte de stud (P7: iguais para 2x4 e 2x6). */
const PRECUT_SECTIONS: readonly Section[] = ['2x4', '2x6'];

const EPS = 1e-9;

export interface BomLine {
  section: Section;
  /** Comprimento comercial ou do pré-corte (polegadas). */
  stockLength: number;
  /** `true` quando a linha é de pré-corte de stud, não de comprimento comercial. */
  precut: boolean;
  /** `true` para LVL/PSL: comprado no comprimento da peça (`stockLength` = corte), sem sobra. */
  engineered: boolean;
  /** `true` para peça serrada acima do maior comprimento comercial (S15): `stockLength` = corte, sem sobra. */
  oversize: boolean;
  /** Peças comerciais a comprar. */
  qty: number;
  /** Soma dos comprimentos de corte atendidos por estas peças. */
  cutTotal: number;
  /** `qty · stockLength − cutTotal`, em polegadas. */
  waste: number;
  /** Sobra em % do material comprado, arredondada a 0.1. */
  wastePercent: number;
}

/**
 * Menor comprimento comercial que acomoda `length`.
 * @throws RangeError se nenhum acomodar, se a lista estiver vazia ou tiver valor inválido.
 */
export function stockLengthFor(
  length: number,
  stockLengths: readonly number[] = DEFAULT_STOCK_LENGTHS,
): number {
  if (stockLengths.length === 0) throw new RangeError('bom: lista de comprimentos comerciais vazia');
  let best: number | undefined;
  for (const s of stockLengths) {
    if (!Number.isFinite(s) || s <= 0) throw new RangeError(`bom: comprimento comercial inválido (${s})`);
    if (s >= length && (best === undefined || s < best)) best = s;
  }
  if (best === undefined) {
    throw new RangeError(
      `bom: peça de ${length}" não cabe em nenhum comprimento comercial (máx. ${Math.max(...stockLengths)}")`,
    );
  }
  return best;
}

/**
 * BOM consolidada de um conjunto de painéis, por (seção, estoque), ordenada por
 * seção e comprimento de estoque crescente (pré-corte de 92 5/8" antes do 8').
 *
 * @param precuts pré-cortes de stud em estoque; lista vazia = sem pré-corte.
 */
export function bom(
  panels: readonly Pick<Panel, 'members'>[],
  stockLengths: readonly number[] = DEFAULT_STOCK_LENGTHS,
  precuts: readonly number[] = DEFAULT_PRECUTS,
): BomLine[] {
  const lines = new Map<string, BomLine>();

  for (const panel of panels) {
    for (const cut of cutList(panel)) {
      const engineered = !isLumberSection(cut.section);
      const precutLength = PRECUT_SECTIONS.includes(cut.section)
        ? matchPrecut(cut.length, precuts)
        : undefined;
      const precut = precutLength !== undefined;
      // LVL/PSL (S12.5) é comprado no comprimento da peça: não há estoque comercial nem sobra.
      const oversize = !engineered && precutLength === undefined && cut.length > Math.max(...stockLengths) + EPS;
      const stockLength =
        engineered || oversize ? cut.length : (precutLength ?? stockLengthFor(cut.length, stockLengths));
      const key = `${cut.section}|${stockLength}|${precut}|${oversize}`;
      const line = lines.get(key) ?? {
        section: cut.section,
        stockLength,
        precut,
        engineered,
        oversize,
        qty: 0,
        cutTotal: 0,
        waste: 0,
        wastePercent: 0,
      };
      line.qty += cut.qty;
      line.cutTotal += cut.qty * cut.length;
      lines.set(key, line);
    }
  }

  for (const line of lines.values()) {
    const bought = line.qty * line.stockLength;
    line.waste = bought - line.cutTotal;
    line.wastePercent = Math.round((line.waste / bought) * 1000) / 10;
  }

  return [...lines.values()].sort((a, b) => {
    const bySection = sectionRank(a.section) - sectionRank(b.section);
    return bySection !== 0 ? bySection : a.stockLength - b.stockLength;
  });
}
