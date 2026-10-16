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
 * - Studs extras do projeto (`wall.extraStuds`, S12, hipótese P26) entram como `role: 'stud'` de altura inteira,
 *   com `label`; o stud de layout que os sobrepõe sai (como na zona de abertura). Extra fora da
 *   parede ou dentro de uma zona é `RangeError`.
 * - Ligações (`wall.joints`, S14, `rules/corners.ts`): stud de canto na parede que atravessa (California
 *   `flat` ou em pé), blocos do ladder ou studs de encosto no T, laps e cortes da double top plate. Stud de
 *   layout que sobrepõe stud de canto ou de encosto sai, como com os extras. Faixa do T dentro de um RO é
 *   `RangeError`; na zona de abertura, aviso `OPENING_AT_TEE` e nenhuma peça de T.
 * - Avisos: os da parede, depois os das aberturas, depois os de T, depois os de `validate.ts` (S10).
 */

import {
  verticalWidth,
  type Config,
  type Member,
  type Opening,
  type Panel,
  type PanelOpening,
  type Wall,
  type Warning,
} from '../types';
import { layoutPlates } from '../rules/plates';
import { layoutStuds } from '../rules/studs';
import { framingForOpening, type OpeningZone } from '../rules/openings';
import { fitNeighborJacks, mergeOpeningZones, type ZonePlan } from '../rules/zones';
import { nudgeOpenings } from '../rules/nudge';
import { resolveOpeningHeader, type HeaderTables, type ResolvedHeader } from '../rules/openingHeader';
import type { HeaderTable } from '../rules/headers';
import { matchPrecut } from '../rules/precuts';
import {
  backerStuds,
  cornerStuds,
  ladderBlocks,
  plateOptionsFor,
  teeConflicts,
  teeStrips,
} from '../rules/corners';
import { validatePanel } from './validate';

/** Folga numérica para comparações de geometria. */
const EPS = 1e-9;

/** Headers resolvidos, aberturas com jacks/kings definidos e plano de zonas de uma parede. */
export interface OpeningPlan {
  headers: ResolvedHeader[];
  /** `wall.openings` com `jackStuds` e `kingStuds` já resolvidos, na ordem original. */
  openings: Opening[];
  plan: ZonePlan;
}

/**
 * O header vem antes da geometria: os jacks (NJ) e os kings dele definem a largura de cada zona.
 * Usado por `panelizeWall` e por `panelizeHouse` (tee na zona de abertura, S13).
 *
 * @throws RangeError os de `resolveOpeningHeader` e `mergeOpeningZones`
 */
export function planOpenings(
  wall: Wall,
  config: Config,
  tables?: readonly HeaderTable[] | HeaderTables,
): OpeningPlan {
  const resolved = wall.openings.map((o) => resolveOpeningHeader(o, wall, config, tables));
  const fit = fitNeighborJacks(
    wall.openings.map((o, i) => ({ ...o, jackStuds: resolved[i]!.jackStuds, kingStuds: resolved[i]!.kingStuds })),
    config.studThickness,
  );
  const openings = fit.openings;
  const plan = mergeOpeningZones(openings, config.studThickness, { fit: true });

  // Reduções por vizinhança apertada (P30, P39) viram avisos da abertura afetada.
  const extra = new Map<string, Warning[]>();
  const warn = (id: string, w: Warning): void => {
    extra.set(id, [...(extra.get(id) ?? []), w]);
  };
  for (const r of fit.reduced) {
    warn(r.openingId, {
      code: 'HEADER_JACKS_BELOW_TABLE',
      message:
        `parede ${wall.id}, abertura ${r.openingId}: 1 jack por lado em vez de ${r.wanted} — só ${r.gap}" até o ` +
        `RO de ${r.neighborId} (hipótese P30)`,
    });
  }
  for (const r of plan.reducedKings ?? []) {
    warn(r.curId, {
      code: 'HEADER_KINGS_BELOW_TABLE',
      message:
        `parede ${wall.id}, aberturas ${r.prevId} e ${r.curId}: ${r.used} king(s) compartilhado(s) em vez de ` +
        `${r.wanted} — só ${r.gap}" entre os RO (hipótese P39)`,
    });
  }
  const headers = resolved.map((h, i) => {
    const more = extra.get(wall.openings[i]!.id);
    return more === undefined ? h : { ...h, jackStuds: openings[i]!.jackStuds!, warnings: [...h.warnings, ...more] };
  });
  return { headers, openings, plan };
}

/**
 * Hipótese P40: aberturas que conflitam por até 1 1/2" com a ponta da parede ou com um T saem deslocadas
 * (`rules/nudge.ts`), com aviso `OPENING_NUDGED`. Roda antes de tudo em `splitWall`.
 */
export function nudgeWall(
  wall: Wall,
  config: Config,
  tables?: readonly HeaderTable[] | HeaderTables,
): { wall: Wall; warnings: { offset: number; warning: Warning }[] } {
  if (wall.openings.length === 0) return { wall, warnings: [] };
  const resolved = wall.openings.map((o) => {
    const h = resolveOpeningHeader(o, wall, config, tables);
    return { ...o, jackStuds: h.jackStuds, kingStuds: h.kingStuds };
  });
  const { nudges } = nudgeOpenings(resolved, wall.length, teeStrips(wall.joints), config.studThickness);
  if (nudges.length === 0) return { wall, warnings: [] };
  const to = new Map(nudges.map((n) => [n.openingId, n.to]));
  const warnings = nudges.map((n) => {
    const d = n.to - n.from;
    return {
      offset: n.to,
      warning: {
        code: 'OPENING_NUDGED',
        message:
          `parede ${wall.id}, abertura ${n.openingId}: deslocada ${Math.abs(d)}" para a ${d < 0 ? 'esquerda' : 'direita'} ` +
          `(borda do RO de ${n.from} para ${n.to}) — tocava ${n.reason}; confira a leitura (hipótese P40)`,
      },
    };
  });
  return {
    wall: { ...wall, openings: wall.openings.map((o) => (to.has(o.id) ? { ...o, offset: to.get(o.id)! } : o)) },
    warnings,
  };
}

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

  const plates = layoutPlates(wall.length, wall.height, wall.section, plateThickness, plateOptionsFor(wall.joints));

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

  const { headers, openings, plan } = planOpenings(wall, config, tables);
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

  // Ligações (S14): faixas de T sem conflito com abertura; studs de canto e de encosto.
  const { clear: strips, warnings: teeWarnings } = teeConflicts(wall, teeStrips(wall.joints), openings, plan.zones);
  const jointStuds: Member[] = [...cornerStuds(wall, config), ...backerStuds(strips, config)].map(({ x, flat }) => ({
    role: 'stud',
    ...fullHeight,
    x,
    ...(flat ? { flat: true } : {}),
  }));
  const occupied = [...extras, ...jointStuds].map((m) => ({ start: m.x, end: m.x + verticalWidth(m) }));

  const layoutOrigin = wall.layoutOrigin ?? 0;
  const studs: Member[] = layoutStuds(wall.length, studSpacing, studThickness, layoutOrigin)
    .filter((x) => !plan.zones.some((z) => overlaps(x, x + studThickness, z)))
    .filter((x) => !occupied.some((o) => overlaps(x, x + studThickness, o)))
    .map((x) => ({ role: 'stud', ...fullHeight, x }));

  const kings: Member[] = plan.kings.map((x) => ({ role: 'kingStud', ...fullHeight, x }));

  const framings = openings.map((o, i) =>
    framingForOpening(o, wall, config, { kings: false, header: headers[i]! }),
  );
  for (const f of framings) warnings.push(...f.warnings);
  warnings.push(...teeWarnings);

  const verticals = [...studs, ...extras, ...jointStuds, ...kings];
  const blocks = ladderBlocks(wall, strips, verticals, config);

  // Aberturas como ficam no painel (S17): o topo do RO é a base do header montado.
  const panelOpenings: PanelOpening[] = openings.map((o, i) => {
    const header = framings[i]!.members.find((m) => m.role === 'header');
    if (header === undefined) throw new RangeError(`parede ${wall.id}, abertura ${o.id}: abertura sem header`);
    return { id: o.id, type: o.type, x: o.offset, width: o.roughWidth, top: header.y, height: o.roughHeight };
  });

  const panel: Panel = {
    id: wall.id,
    wallId: wall.id,
    length: wall.length,
    height: wall.height,
    section: wall.section,
    members: [...plates, ...verticals, ...blocks, ...framings.flatMap((f) => f.members)],
    fieldCuts: framings.flatMap((f) => f.fieldCuts),
    warnings,
    layoutOrigin,
    openings: panelOpenings,
    exterior: wall.exterior,
    bearing: wall.bearing,
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
