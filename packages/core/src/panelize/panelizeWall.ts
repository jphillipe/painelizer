/**
 * Monta o `Panel` de uma parede reta a partir das regras de framing.
 *
 * Escopo atual (S3): parede sem aberturas = 3 plates + studs de layout.
 * Aberturas entram na S7; até lá, uma parede com `openings` lança erro em vez
 * de gerar um painel silenciosamente errado.
 *
 * Geometria (docs/02-framing.md):
 * - Studs em y = plateThickness (sobre a bottom plate), comprimento = height − 3·plateThickness.
 * - `config.studLength` é o pré-corte esperado; se divergir do comprimento derivado da altura,
 *   o painel sai com o comprimento derivado e um aviso `STUD_LENGTH_MISMATCH`.
 */

import type { Config, Member, Panel, Wall, Warning } from '../types';
import { layoutPlates } from '../rules/plates';
import { layoutStuds } from '../rules/studs';

/** Diferença acima da qual dois comprimentos são considerados distintos (1/64"). */
const LENGTH_TOLERANCE = 1 / 64;

export function panelizeWall(wall: Wall, config: Config): Panel {
  if (wall.openings.length > 0) {
    throw new Error(
      `panelizeWall: parede ${wall.id} tem ${wall.openings.length} abertura(s); ` +
        'aberturas ainda não são suportadas (S7)',
    );
  }

  const { plateThickness, studThickness, studSpacing } = config;
  const warnings: Warning[] = [];

  const plates = layoutPlates(wall.length, wall.height, wall.section, plateThickness);

  const studLength = wall.height - 3 * plateThickness;
  if (Math.abs(studLength - config.studLength) > LENGTH_TOLERANCE) {
    warnings.push({
      code: 'STUD_LENGTH_MISMATCH',
      message:
        `parede ${wall.id}: altura ${wall.height}" menos 3 plates de ${plateThickness}" exige stud de ` +
        `${studLength}", mas config.studLength é ${config.studLength}"`,
    });
  }

  const studs: Member[] = layoutStuds(wall.length, studSpacing, studThickness).map((x) => ({
    role: 'stud',
    section: wall.section,
    length: studLength,
    x,
    y: plateThickness,
    orientation: 'vertical',
  }));

  return {
    id: wall.id,
    wallId: wall.id,
    length: wall.length,
    height: wall.height,
    section: wall.section,
    members: [...plates, ...studs],
    warnings,
  };
}
