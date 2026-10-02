/**
 * Pré-cortes de stud (P7): peças compradas já no comprimento do stud, 92 5/8" para parede de 8'
 * e 104 5/8" para 9', iguais em 2x4 e 2x6.
 *
 * Uma peça "é" um pré-corte quando difere dele menos de 1/64" — a resolução do agrupamento da
 * lista de corte; lá a coincidência fica exata e a sobra do pré-corte nunca sai negativa.
 * Pré-corte nunca é recortado: peça mais curta (cripple, jack) não sai de pré-corte (P9).
 */

/** Pré-cortes da fábrica (P7, respondida em 2026-10-01). */
export const DEFAULT_PRECUTS: readonly number[] = [92.625, 104.625];

/** Diferença a partir da qual dois comprimentos são considerados distintos (1/64"). */
export const LENGTH_TOLERANCE = 1 / 64;

/**
 * Pré-corte da lista que coincide com `length`, ou `undefined` se nenhum coincidir.
 * Lista vazia é válida (projeto sem pré-corte) e devolve `undefined`.
 *
 * @throws RangeError se algum pré-corte não for número finito > 0
 */
export function matchPrecut(length: number, precuts: readonly number[]): number | undefined {
  let match: number | undefined;
  for (const p of precuts) {
    if (!Number.isFinite(p) || p <= 0) throw new RangeError(`pré-corte inválido (${p})`);
    if (match === undefined && Math.abs(length - p) < LENGTH_TOLERANCE) match = p;
  }
  return match;
}
