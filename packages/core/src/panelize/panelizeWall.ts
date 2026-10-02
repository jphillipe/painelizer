/**
 * Monta o `Panel` de uma parede reta a partir das regras de framing.
 *
 * Escopo atual (S7.1): 3 plates + studs de layout + janelas (`rules/openings.ts`).
 * Porta e zonas de abertura que se tocam ou se sobrepõem chegam na S8; até lá lançam erro
 * em vez de gerar um painel silenciosamente errado.
 *
 * Geometria (docs/02-framing.md):
 * - Studs em y = plateThickness (sobre a bottom plate), comprimento = height − 3·plateThickness.
 * - `config.studLength` é a lista de pré-cortes (P7); se o comprimento derivado da altura não for
 *   nenhum deles, o painel sai com o comprimento derivado e um aviso `STUD_LENGTH_MISMATCH`.
 *   Lista vazia lança `RangeError`.
 * - Studs de layout que se sobrepõem a uma zona de abertura são removidos; o que só encosta
 *   no king fica.
 */

import type { Config, Member, Panel, Wall, Warning } from '../types';
import { layoutPlates } from '../rules/plates';
import { layoutStuds } from '../rules/studs';
import { framingForOpening, openingZone, type OpeningZone } from '../rules/openings';
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

  const zones = wall.openings.map((o) => ({ id: o.id, ...openingZone(o, studThickness) }));
  assertSeparateZones(wall, zones);

  const studs: Member[] = layoutStuds(wall.length, studSpacing, studThickness)
    .filter((x) => !zones.some((z) => overlaps(x, x + studThickness, z)))
    .map((x) => ({
      role: 'stud',
      section: wall.section,
      length: studLength,
      x,
      y: plateThickness,
      orientation: 'vertical',
    }));

  const openingMembers = wall.openings.flatMap((o) => framingForOpening(o, wall, config));

  return {
    id: wall.id,
    wallId: wall.id,
    length: wall.length,
    height: wall.height,
    section: wall.section,
    members: [...plates, ...studs, ...openingMembers],
    warnings,
  };
}

/** Sobreposição com área (encostar não conta). */
function overlaps(start: number, end: number, zone: OpeningZone): boolean {
  return start < zone.end - EPS && end > zone.start + EPS;
}

/** Zonas que se tocam ou se sobrepõem compartilham king — fusão é a S8. */
function assertSeparateZones(wall: Wall, zones: (OpeningZone & { id: string })[]): void {
  const sorted = [...zones].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.start <= prev.end + EPS) {
      throw new Error(
        `parede ${wall.id}: zonas das aberturas ${prev.id} e ${cur.id} se tocam ou se sobrepõem; ` +
          'fusão de zonas chega na S8',
      );
    }
  }
}
