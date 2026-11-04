/**
 * Tolerâncias numéricas do motor, num lugar só (S28.1).
 *
 * - `EPS`: folga de ponto flutuante nas comparações de geometria. Encostar não é sobrepor.
 * - `LENGTH_EPS`: resolução de comprimento (1/64"), a mesma do agrupamento da lista de corte e dos pré-cortes.
 */

/** Folga numérica para comparações de geometria. */
export const EPS = 1e-9;

/** Diferença a partir da qual dois comprimentos são considerados distintos (1/64"). */
export const LENGTH_EPS = 1 / 64;

/** Inteiro ≥ 1: contagem de studs, plies, pavimento. */
export function isCount(n: number): boolean {
  return Number.isInteger(n) && n >= 1;
}
