/**
 * Orçamento de madeira (S31): a lista de material (`bom.ts`) × a tabela de preços do projeto (`config.prices`).
 *
 * Regra:
 * - Preço de cada linha da BOM (seção, comprimento de estoque): a entrada `{ section, length, price }` da mesma seção
 *   com o mesmo comprimento (tolerância de 1/64") vale por peça; senão `{ section, perFoot }` da seção vale
 *   `perFoot × comprimento / 12` por peça; senão a linha fica **sem preço** e fora do total (`unpriced` conta).
 * - Valores em centavos: preço unitário e custo da linha arredondados a 0.01; o total é a soma das linhas.
 * - Duas entradas para a mesma (seção, comprimento) ou dois `perFoot` da mesma seção é erro; preço negativo ou não
 *   finito também (o schema do CLI já recusa; aqui é guarda do motor).
 * - Moeda: a do projeto, sem conversão. A sobra da BOM é um teto (sem otimização de corte), logo o custo também.
 */

import type { PriceEntry } from '../config';
import { EngineError } from '../messages';
import type { BomLine } from './bom';

/** Resolução para casar o comprimento do preço com o do estoque (1/64"). */
const LENGTH_MATCH = 1 / 128;

/** De onde veio o preço da linha: por peça do comprimento ou por pé linear. */
export type CostSource = 'each' | 'perFoot';

export interface CostLine extends BomLine {
  /** Preço por peça comprada; ausente = sem preço na tabela. */
  unitPrice?: number;
  /** `qty × unitPrice`, arredondado a 0.01. */
  cost?: number;
  source?: CostSource;
}

export interface Cost {
  lines: CostLine[];
  /** Soma das linhas com preço. */
  total: number;
  /** Linhas da BOM sem preço na tabela (fora do total). */
  unpriced: number;
}

const cents = (v: number): number => Math.round(v * 100) / 100;

/** @throws EngineError `PRICE_INVALID` preço inválido ou entrada repetida */
function checkPrices(prices: readonly PriceEntry[]): void {
  const seen: PriceEntry[] = [];
  prices.forEach((p, index) => {
    const value = 'perFoot' in p ? p.perFoot : p.price;
    if (!Number.isFinite(value) || value < 0) {
      throw new EngineError('PRICE_INVALID', {}, { index, section: p.section, reason: 'value', value });
    }
    if (!('perFoot' in p) && (!Number.isFinite(p.length) || p.length <= 0)) {
      throw new EngineError('PRICE_INVALID', {}, { index, section: p.section, reason: 'length', value: p.length });
    }
    const dup = seen.find(
      (q) =>
        q.section === p.section &&
        ('perFoot' in q ? 'perFoot' in p : !('perFoot' in p) && Math.abs(q.length - p.length) < LENGTH_MATCH),
    );
    if (dup !== undefined)
      throw new EngineError('PRICE_INVALID', {}, { index, section: p.section, reason: 'duplicate' });
    seen.push(p);
  });
}

/**
 * Custo de cada linha da BOM, na mesma ordem, e o total.
 *
 * @throws EngineError `PRICE_INVALID`
 */
export function costOf(bom: readonly BomLine[], prices: readonly PriceEntry[]): Cost {
  checkPrices(prices);
  let total = 0;
  let unpriced = 0;
  const lines = bom.map((line): CostLine => {
    const each = prices.find(
      (p): p is Extract<PriceEntry, { price: number }> =>
        !('perFoot' in p) && p.section === line.section && Math.abs(p.length - line.stockLength) < LENGTH_MATCH,
    );
    const perFoot = prices.find(
      (p): p is Extract<PriceEntry, { perFoot: number }> => 'perFoot' in p && p.section === line.section,
    );
    if (each === undefined && perFoot === undefined) {
      unpriced++;
      return { ...line };
    }
    const unitPrice = cents(each !== undefined ? each.price : perFoot!.perFoot * (line.stockLength / 12));
    const cost = cents(unitPrice * line.qty);
    total = cents(total + cost);
    return { ...line, unitPrice, cost, source: each !== undefined ? 'each' : 'perFoot' };
  });
  return { lines, total, unpriced };
}
