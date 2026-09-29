/**
 * Plates de uma parede reta: bottom plate, top plate e double top plate.
 *
 * Regras (docs/02-framing.md):
 * - Três plates, cada uma com a espessura `plateThickness` (1.5") e a seção da parede.
 * - Todas deitadas, x=0, comprimento = comprimento da parede.
 * - bottom em y=0; top em y = height − 2·t; double top em y = height − t.
 *   Para a altura padrão 97.125: 0, 94.125 e 95.625.
 */

import type { Member, WallSection } from '../types';
import { NOMINAL_2X_THICKNESS } from '../types';

/**
 * Os três plates da parede, na ordem bottom, top, double top.
 *
 * @param length         comprimento da parede (polegadas)
 * @param height         altura total da parede, da base da bottom plate ao topo da double top
 * @param section        seção nominal da parede
 * @param plateThickness espessura real de cada plate (1.5)
 * @throws RangeError    se `length <= 0`, `plateThickness <= 0` ou `height <= 3·plateThickness`
 *                       (não sobra espaço para stud)
 */
export function layoutPlates(
  length: number,
  height: number,
  section: WallSection,
  plateThickness: number = NOMINAL_2X_THICKNESS,
): Member[] {
  if (!Number.isFinite(length) || !Number.isFinite(height) || !Number.isFinite(plateThickness)) {
    throw new RangeError('layoutPlates: argumentos devem ser números finitos');
  }
  if (length <= 0) {
    throw new RangeError(`layoutPlates: length deve ser > 0 (recebido ${length})`);
  }
  if (plateThickness <= 0) {
    throw new RangeError(`layoutPlates: plateThickness deve ser > 0 (recebido ${plateThickness})`);
  }
  if (height <= 3 * plateThickness) {
    throw new RangeError(
      `layoutPlates: altura ${height}" não comporta 3 plates de ${plateThickness}" mais um stud`,
    );
  }

  const base = { section, length, x: 0, orientation: 'horizontal' as const };
  return [
    { role: 'bottomPlate', y: 0, ...base },
    { role: 'topPlate', y: height - 2 * plateThickness, ...base },
    { role: 'doubleTopPlate', y: height - plateThickness, ...base },
  ];
}
