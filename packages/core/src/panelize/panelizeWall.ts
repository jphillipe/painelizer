/**
 * Monta o `Panel` de uma parede reta a partir das regras de framing.
 *
 * Escopo atual (S8): 3 plates + studs de layout + janelas e portas (`rules/openings.ts`), com
 * zonas vizinhas fundidas e king compartilhado (`rules/zones.ts`).
 *
 * Geometria (docs/02-framing.md):
 * - Studs em y = plateThickness (sobre a bottom plate), comprimento = height − 3·plateThickness.
 * - `config.studLength` é a lista de pré-cortes (P7); se o comprimento derivado da altura não for
 *   nenhum deles, o painel sai com o comprimento derivado e um aviso `STUD_LENGTH_MISMATCH`.
 *   Lista vazia lança `RangeError`.
 * - Studs de layout que se sobrepõem a uma zona de abertura são removidos; o que só encosta
 *   no king fica.
 * - Kings vêm do plano de zonas (king compartilhado entre aberturas vizinhas); o resto de cada
 *   abertura vem de `framingForOpening` sem kings. Cortes na obra e avisos das aberturas vão
 *   para o painel.
 */

import type { Config, Member, Panel, Wall, Warning } from '../types';
import { layoutPlates } from '../rules/plates';
import { layoutStuds } from '../rules/studs';
import { framingForOpening, type OpeningZone } from '../rules/openings';
import { mergeOpeningZones } from '../rules/zones';
import { matchPrecut } from '../rules/precuts';

/** Folga numérica para comparações de geometria. */
const EPS = 1e-9;

export function panelizeWall(wall: Wall, config: Config): Panel {
  const { plateThickness, studThickness, studSpacing } = config;
  const warnings: Warning[] = [];

  const plates = layoutPlates(wall.length, wall.height, wall.section, plateThickness);

  const studLength = wall.height - 3 * plateThickness;
  if (config.studLength.length === 0) {
    throw new RangeError('config.studLength: lista de pré-cortes vazia');
  }
  if (matchPrecut(studLength, config.studLength) === undefined) {
    warnings.push({
      code: 'STUD_LENGTH_MISMATCH',
      message:
        `parede ${wall.id}: altura ${wall.height}" menos 3 plates de ${plateThickness}" exige stud de ` +
        `${studLength}", que não é nenhum dos pré-cortes de config.studLength ` +
        `(${config.studLength.map((p) => `${p}"`).join(', ')})`,
    });
  }

  const plan = mergeOpeningZones(wall.openings, studThickness);
  const fullHeight = {
    section: wall.section,
    length: studLength,
    y: plateThickness,
    orientation: 'vertical' as const,
  };

  const studs: Member[] = layoutStuds(wall.length, studSpacing, studThickness)
    .filter((x) => !plan.zones.some((z) => overlaps(x, x + studThickness, z)))
    .map((x) => ({ role: 'stud', ...fullHeight, x }));

  const kings: Member[] = plan.kings.map((x) => ({ role: 'kingStud', ...fullHeight, x }));

  const framings = wall.openings.map((o) => framingForOpening(o, wall, config, { kings: false }));
  for (const f of framings) warnings.push(...f.warnings);

  return {
    id: wall.id,
    wallId: wall.id,
    length: wall.length,
    height: wall.height,
    section: wall.section,
    members: [...plates, ...studs, ...kings, ...framings.flatMap((f) => f.members)],
    fieldCuts: framings.flatMap((f) => f.fieldCuts),
    warnings,
  };
}

/** Sobreposição com área (encostar não conta). */
function overlaps(start: number, end: number, zone: OpeningZone): boolean {
  return start < zone.end - EPS && end > zone.start + EPS;
}
