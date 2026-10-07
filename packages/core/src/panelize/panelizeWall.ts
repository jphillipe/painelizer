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
 * - Studs extras do projeto (`wall.extraStuds`, S12) entram como `role: 'stud'` de altura inteira,
 *   com `label`; o stud de layout que os sobrepõe sai (como na zona de abertura). Extra fora da
 *   parede ou dentro de uma zona é `RangeError`.
 * - Avisos: os da parede, depois os das aberturas, depois os de `validate.ts` (S10).
 */

import type { Config, Member, Panel, Wall, Warning } from '../types';
import { layoutPlates } from '../rules/plates';
import { layoutStuds } from '../rules/studs';
import { framingForOpening, type OpeningZone } from '../rules/openings';
import { mergeOpeningZones } from '../rules/zones';
import { resolveOpeningHeader, type HeaderTables } from '../rules/openingHeader';
import type { HeaderTable } from '../rules/headers';
import { matchPrecut } from '../rules/precuts';
import { validatePanel } from './validate';

/** Folga numérica para comparações de geometria. */
const EPS = 1e-9;

/**
 * @param tables tabelas injetadas (testes): lista de tabelas de header ou `{ headers?, kings? }`;
 *               ausentes = IRC de `src/data`
 * @throws RangeError stud extra fora da parede ou dentro de uma zona de abertura
 */
export function panelizeWall(
  wall: Wall,
  config: Config,
  tables?: readonly HeaderTable[] | HeaderTables,
): Panel {
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

  // O header vem antes da geometria: os jacks (NJ) e os kings dele definem a largura de cada zona.
  const headers = wall.openings.map((o) => resolveOpeningHeader(o, wall, config, tables));
  const openings = wall.openings.map((o, i) => ({
    ...o,
    jackStuds: headers[i]!.jackStuds,
    kingStuds: headers[i]!.kingStuds,
  }));

  const plan = mergeOpeningZones(openings, studThickness);
  const fullHeight = {
    section: wall.section,
    length: studLength,
    y: plateThickness,
    orientation: 'vertical' as const,
  };

  // Studs extras do projeto (S12): cada um ocupa [x, x + t]; stud de layout que os sobrepõe sai.
  const extras: Member[] = extraStuds(wall, studThickness, plan.zones).map(({ x, label }) => ({
    role: 'stud',
    ...fullHeight,
    x,
    ...(label === undefined ? {} : { label }),
  }));

  const layoutOrigin = wall.layoutOrigin ?? 0;
  const studs: Member[] = layoutStuds(wall.length, studSpacing, studThickness, layoutOrigin)
    .filter((x) => !plan.zones.some((z) => overlaps(x, x + studThickness, z)))
    .filter((x) => !extras.some((e) => overlaps(x, x + studThickness, { start: e.x, end: e.x + studThickness })))
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
    members: [...plates, ...studs, ...extras, ...kings, ...framings.flatMap((f) => f.members)],
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

/**
 * Posições (borda esquerda) dos studs extras da parede, `count` colados a partir de `x`.
 *
 * @throws RangeError x não finito ou `count` inválido, stud fora da parede, stud dentro de uma zona
 *                    de abertura (o projeto pediu um stud onde vão king, jack ou o RO)
 */
function extraStuds(wall: Wall, t: number, zones: readonly OpeningZone[]): { x: number; label?: string }[] {
  const out: { x: number; label?: string }[] = [];
  for (const [i, e] of (wall.extraStuds ?? []).entries()) {
    const where = `parede ${wall.id}, extraStuds[${i}]`;
    const n = e.count ?? 1;
    if (!Number.isFinite(e.x)) throw new RangeError(`${where}: x deve ser número finito (recebido ${e.x})`);
    if (!Number.isInteger(n) || n < 1) throw new RangeError(`${where}: count deve ser inteiro ≥ 1 (recebido ${n})`);
    if (e.x < -EPS || e.x + n * t > wall.length + EPS) {
      throw new RangeError(`${where}: ${n} stud(s) a partir de x=${e.x} saem da parede de ${wall.length}"`);
    }
    for (let k = 0; k < n; k++) {
      const x = e.x + k * t;
      const zone = zones.find((z) => overlaps(x, x + t, z));
      if (zone !== undefined) {
        throw new RangeError(
          `${where}: stud em x=${x} cai na zona de abertura [${zone.start}, ${zone.end}] — ` +
            'studs extras ficam fora de kings, jacks e RO',
        );
      }
      out.push(e.label === undefined ? { x } : { x, label: e.label });
    }
  }
  return out;
}
