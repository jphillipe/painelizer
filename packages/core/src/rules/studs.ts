/**
 * Layout de studs de uma parede reta (sem aberturas).
 *
 * Regras (CLAUDE.md, docs/02-framing.md; S11, 2026-10-06):
 * - Marcas de layout em `origin + k·spacing` (k inteiro). `origin` é a posição, em x da parede, da
 *   marca 0 do prédio: 0 na parede solta; `−t` da parede que atravessa quando esta encosta num canto
 *   (a marca 0 é a quina do prédio, antes da plate); negativa também quando o painel começa no meio
 *   da parede (S15). Assim a emenda do OSB (48", 96"…) contada da quina cai sempre no meio de um stud.
 * - O stud é CENTRADO na marca: borda esquerda em `marca − t/2` (15 1/4", 31 1/4"… para origin 0),
 *   e cada chapa de sheathing apoia 3/4" no stud. Hipótese P19, até a fábrica responder.
 * - Duas exceções fixas: o primeiro stud fica sempre em x=0 (borda na ponta da parede) e o último
 *   sempre encostado no fim: x = length − t. Marcas cujo stud não começa estritamente entre esses dois
 *   (0 < x < length − t) são descartadas; stud que começa nesse intervalo mas sobrepõe o de ponta ou o
 *   fechamento é mantido, como no caso de borda abaixo.
 * - A posição retornada é a borda ESQUERDA do stud; o stud ocupa [x, x + t].
 *
 * Casos de borda (docs/04-decisoes.md, 2026-09-28, mantidos na S11):
 * - Stud da marca coincidindo com o fechamento (ex.: 128.75 → marca 128 dá 127.25 = fechamento):
 *   um stud só.
 * - Stud da marca sobrepondo o fechamento (ex.: 130 → 127.25 e 128.5): os DOIS são mantidos.
 *   O layout não é deslocado; a sobreposição é responsabilidade da validação (`STUDS_OVERLAP`).
 */

import { NOMINAL_2X_THICKNESS } from '../types';

/**
 * Posições x (borda esquerda) dos studs de layout, em polegadas, em ordem crescente.
 *
 * @param length        comprimento da parede (polegadas)
 * @param spacing       espaçamento OC entre marcas (16 ou 24)
 * @param studThickness espessura real do stud (1.5)
 * @param origin        x da marca 0 do prédio nesta parede (0 na parede solta; pode ser negativo)
 * @throws RangeError   se `length < studThickness` (não cabe um stud), `spacing <= 0` ou argumento
 *                      não finito
 */
export function layoutStuds(
  length: number,
  spacing: number,
  studThickness: number = NOMINAL_2X_THICKNESS,
  origin: number = 0,
): number[] {
  if (
    !Number.isFinite(length) ||
    !Number.isFinite(spacing) ||
    !Number.isFinite(studThickness) ||
    !Number.isFinite(origin)
  ) {
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
  const half = studThickness / 2;
  const positions: number[] = [0];

  // Primeira marca (k pode ser negativo: marcas antes da origem) cujo stud pode começar depois de
  // x=0. Multiplicação (não acumulação) evita acumular erro de ponto flutuante.
  const first = Math.ceil((half - origin) / spacing);
  for (let k = first; ; k++) {
    const x = origin + k * spacing - half;
    if (x >= closer) break;
    if (x > 0) positions.push(x);
  }

  if (closer > 0) positions.push(closer);
  return positions;
}
