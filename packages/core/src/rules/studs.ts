/**
 * Layout de studs de uma parede reta (sem aberturas).
 *
 * Regras (CLAUDE.md, docs/02-framing.md):
 * - Marcas de layout em 0, spacing, 2·spacing… medidas de x=0 (início da parede).
 * - A posição retornada é a borda ESQUERDA do stud; o stud ocupa [x, x + studThickness].
 * - O último stud fica sempre encostado no fim da parede: x = length − studThickness.
 *
 * Casos de borda (docs/04-decisoes.md, 2026-09-28):
 * - Marca coincidindo com o fechamento (ex.: 129.5 → marca 128 = fechamento 128): um stud só.
 * - Marca e fechamento se sobrepondo (length − últimaMarca < 2·studThickness, ex.: 130 →
 *   128 e 128.5): os DOIS são mantidos. O layout não é deslocado; a sobreposição é
 *   responsabilidade da validação (S10, `studs sobrepostos`).
 */

import { NOMINAL_2X_THICKNESS } from '../types';

/**
 * Posições x (borda esquerda) dos studs de layout, em polegadas, em ordem crescente.
 *
 * @param length        comprimento da parede (polegadas)
 * @param spacing       espaçamento OC entre marcas (16 ou 24)
 * @param studThickness espessura real do stud (1.5)
 * @throws RangeError   se `length < studThickness` (não cabe um stud) ou `spacing <= 0`
 */
export function layoutStuds(
  length: number,
  spacing: number,
  studThickness: number = NOMINAL_2X_THICKNESS,
): number[] {
  if (!Number.isFinite(length) || !Number.isFinite(spacing) || !Number.isFinite(studThickness)) {
    throw new RangeError('layoutStuds: argumentos devem ser números finitos');
  }
  if (spacing <= 0) {
    throw new RangeError(`layoutStuds: spacing deve ser > 0 (recebido ${spacing})`);
  }
  if (studThickness <= 0) {
    throw new RangeError(`layoutStuds: studThickness deve ser > 0 (recebido ${studThickness})`);
  }
  if (length < studThickness) {
    throw new RangeError(
      `layoutStuds: parede de ${length}" não comporta um stud de ${studThickness}"`,
    );
  }

  const closer = length - studThickness;
  const positions: number[] = [];

  // Marcas estritamente antes do fechamento. Multiplicação (não acumulação) evita
  // acumular erro de ponto flutuante.
  for (let i = 0; ; i++) {
    const mark = i * spacing;
    if (mark >= closer) break;
    positions.push(mark);
  }

  positions.push(closer);
  return positions;
}
