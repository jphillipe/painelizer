/**
 * Monta o `Panel` de uma parede reta a partir das regras de framing.
 *
 * Escopo atual (S9.2): 3 plates + studs de layout + janelas e portas (`rules/openings.ts`), com
 * zonas vizinhas fundidas e king compartilhado (`rules/zones.ts`) e o header de cada abertura
 * escolhido por `rules/openingHeader.ts` (projeto → tabela IRC → padrão do config; sem header, erro).
 *
 * Geometria (docs/02-framing.md):
 * - Studs em y = plateThickness (sobre a bottom plate), comprimento = height − 3·plateThickness.
 * - `config.studLength` é a lista de pré-cortes (P7); se o comprimento derivado da altura não for
 *   nenhum deles, o painel sai com o comprimento derivado e um aviso `STUD_LENGTH_MISMATCH`.
 *   Lista vazia lança `RangeError`.
 * - Studs centrados nas marcas `wall.layoutOrigin + k·studSpacing` (S11; `layoutStuds`); os que se
 *   sobrepõem a uma zona de abertura são removidos; o que só encosta no king fica.
 * - Kings vêm do plano de zonas (king compartilhado entre aberturas vizinhas); o resto de cada
 *   abertura vem de `framingForOpening` sem kings. Cortes na obra e avisos das aberturas vão
 *   para o painel.
 * - Avisos: os da parede, depois os das aberturas, depois os de `validate.ts` (S10).
 */

import type { Config, Member, Panel, Wall, Warning } from '../types';
import { layoutPlates } from '../rules/plates';
import { layoutStuds } from '../rules/studs';
import { framingForOpening, type OpeningZone } from '../rules/openings';
import { mergeOpeningZones } from '../rules/zones';
import { resolveOpeningHeader } from '../rules/openingHeader';
import type { HeaderTable } from '../rules/headers';
import { matchPrecut } from '../rules/precuts';
import { validatePanel } from './validate';

/** Folga numérica para comparações de geometria. */
const EPS = 1e-9;

/** @param tables tabela de headers injetada (testes); ausente = IRC de `src/data/irc-headers.json` */
export function panelizeWall(wall: Wall, config: Config, tables?: readonly HeaderTable[]): Panel {
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

  // O header vem antes da geometria: os jacks dele (NJ) definem a largura de cada zona.
  const headers = wall.openings.map((o) => resolveOpeningHeader(o, wall, config, tables));
  const openings = wall.openings.map((o, i) => ({ ...o, jackStuds: headers[i]!.jackStuds }));

  const plan = mergeOpeningZones(openings, studThickness);
  const fullHeight = {
    section: wall.section,
    length: studLength,
    y: plateThickness,
    orientation: 'vertical' as const,
  };

  const layoutOrigin = wall.layoutOrigin ?? 0;
  const studs: Member[] = layoutStuds(wall.length, studSpacing, studThickness, layoutOrigin)
    .filter((x) => !plan.zones.some((z) => overlaps(x, x + studThickness, z)))
    .map((x) => ({ role: 'stud', ...fullHeight, x }));

  const kings: Member[] = plan.kings.map((x) => ({ role: 'kingStud', ...fullHeight, x }));

  const framings = openings.map((o, i) =>
    framingForOpening(o, wall, config, { kings: false, header: headers[i]! }),
  );
  for (const f of framings) warnings.push(...f.warnings);

  const panel: Panel = {
    id: wall.id,
    wallId: wall.id,
    length: wall.length,
    height: wall.height,
    section: wall.section,
    members: [...plates, ...studs, ...kings, ...framings.flatMap((f) => f.members)],
    fieldCuts: framings.flatMap((f) => f.fieldCuts),
    warnings,
    layoutOrigin,
  };

  // Validações (S10) por último, sobre o painel pronto e as aberturas com os jacks resolvidos.
  warnings.push(...validatePanel(panel, { ...wall, openings }, config));
  return panel;
}

/** Sobreposição com área (encostar não conta). */
function overlaps(start: number, end: number, zone: OpeningZone): boolean {
  return start < zone.end - EPS && end > zone.start + EPS;
}
