/**
 * Monta o `Panel` de uma parede reta a partir das regras de framing.
 *
 * 3 plates + studs de layout + janelas e portas (`rules/openings.ts`), com zonas vizinhas fundidas e
 * king compartilhado (`rules/zones.ts`) e o header de cada abertura escolhido por
 * `rules/openingHeader.ts` (projeto → tabela IRC na portante → R602.7.4 na não portante; sem header, erro).
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
 * - Fire blocking (S31, `rules/blocking.ts`): cavidade acima de `config.fireBlockAt` (120") leva fileiras de
 *   blocos entre as peças de altura inteira, fora das zonas de abertura e do trecho do ladder (P11, P50).
 * - Avisos: os da parede, depois os das aberturas, depois os de T, depois os de `validate.ts` (S10).
 */

import { studLengthFor, type Config } from '../config';
import { EPS, isCount } from '../eps';
import { overlaps } from '../geom';
import { withStudCounts, type Opening } from '../opening';
import type { Member, Panel, PanelOpening, StudMember } from '../panel';
import { verticalWidth } from '../sections';
import type { Wall } from '../wall';
import { EngineError, warning, type Warning } from '../messages';
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
  ladderBays,
  ladderBlocks,
  plateOptionsFor,
  teeConflicts,
  teeStrips,
} from '../rules/corners';
import { panelWeight } from '../rules/weight';
import { fireBlocks } from '../rules/blocking';
import { validatePanel } from './validate';

/** Headers resolvidos, aberturas com jacks/kings definidos e plano de zonas de uma parede. */
export interface OpeningPlan {
  headers: ResolvedHeader[];
  /** `wall.openings` com `jackStuds` e `kingStuds` já resolvidos, na ordem original. */
  openings: Opening[];
  plan: ZonePlan;
}

/**
 * Header de cada abertura da parede, na ordem de `wall.openings`. Não depende do `offset` nem do comprimento da
 * parede: `splitWall` resolve uma vez e reaproveita no deslocamento (P40), na parede inteira e em cada trecho.
 *
 * @throws RangeError os de `resolveOpeningHeader`
 */
export function resolveHeaders(
  wall: Wall,
  config: Config,
  tables?: readonly HeaderTable[] | HeaderTables,
): ResolvedHeader[] {
  return wall.openings.map((o) => resolveOpeningHeader(o, wall, config, tables));
}

/**
 * O header vem antes da geometria: os jacks (NJ) e os kings dele definem a largura de cada zona.
 * Usado por `panelizeWall` e por `panelizeHouse` (tee na zona de abertura, S13).
 *
 * @param resolved headers já resolvidos (`resolveHeaders`), na ordem de `wall.openings`; ausente = resolve aqui
 * @throws RangeError os de `resolveOpeningHeader` e `mergeOpeningZones`
 */
export function planOpenings(
  wall: Wall,
  config: Config,
  tables?: readonly HeaderTable[] | HeaderTables,
  resolved: readonly ResolvedHeader[] = resolveHeaders(wall, config, tables),
): OpeningPlan {
  const fit = fitNeighborJacks(
    wall.openings.map((o, i) => withStudCounts(o, resolved[i]!)),
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
    warn(
      r.openingId,
      warning(
        'HEADER_JACKS_BELOW_TABLE',
        { wallId: wall.id, openingId: r.openingId },
        { reason: 'neighbor', jacks: 1, wanted: r.wanted, gap: r.gap, neighborId: r.neighborId },
        'P30',
      ),
    );
  }
  for (const r of plan.reducedKings ?? []) {
    warn(
      r.curId,
      warning(
        'HEADER_KINGS_BELOW_TABLE',
        { wallId: wall.id, openingId: r.curId },
        { reason: 'shared', prevId: r.prevId, used: r.used, wanted: r.wanted, gap: r.gap },
        'P39',
      ),
    );
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
 *
 * @param resolved headers já resolvidos (`resolveHeaders`), na ordem de `wall.openings`; ausente = resolve aqui
 */
export function nudgeWall(
  wall: Wall,
  config: Config,
  tables?: readonly HeaderTable[] | HeaderTables,
  resolved?: readonly ResolvedHeader[],
): { wall: Wall; warnings: { offset: number; warning: Warning }[] } {
  if (wall.openings.length === 0) return { wall, warnings: [] };
  const headers = resolved ?? resolveHeaders(wall, config, tables);
  const counted = wall.openings.map((o, i) => withStudCounts(o, headers[i]!));
  const { nudges } = nudgeOpenings(counted, wall.length, teeStrips(wall.joints), config.studThickness);
  if (nudges.length === 0) return { wall, warnings: [] };
  const to = new Map(nudges.map((n) => [n.openingId, n.to]));
  const warnings = nudges.map((n) => {
    const d = n.to - n.from;
    return {
      offset: n.to,
      warning: warning(
        'OPENING_NUDGED',
        { wallId: wall.id, openingId: n.openingId },
        {
          distance: Math.abs(d),
          direction: d < 0 ? 'left' : 'right',
          from: n.from,
          to: n.to,
          touched: n.touched.kind,
          ...(n.touched.kind === 'tee' ? { teeWallId: n.touched.wallId ?? '?' } : {}),
        },
        'P40',
      ),
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
  return framePanel(wall, config, tables).panel;
}

/**
 * O painel da parede e o plano de aberturas usado para montá-lo (`splitWall` precisa das zonas).
 *
 * @param resolved headers já resolvidos (`resolveHeaders`), na ordem de `wall.openings`; ausente = resolve aqui
 */
export function framePanel(
  wall: Wall,
  config: Config,
  tables?: readonly HeaderTable[] | HeaderTables,
  resolved?: readonly ResolvedHeader[],
): { panel: Panel; plan: ZonePlan } {
  const { plateThickness, studThickness, studSpacing } = config;
  const warnings: Warning[] = [];

  const plates = layoutPlates(wall.length, wall.height, wall.section, plateThickness, plateOptionsFor(wall.joints));

  const studLength = studLengthFor(wall, config);
  if (config.studLength.length === 0) {
    throw new EngineError('PRECUTS_EMPTY');
  }
  if (matchPrecut(studLength, config.studLength) === undefined) {
    warnings.push(
      warning(
        'STUD_LENGTH_MISMATCH',
        { wallId: wall.id },
        { height: wall.height, plateThickness, studLength, precuts: [...config.studLength] },
      ),
    );
  }

  const { headers, openings, plan } = planOpenings(wall, config, tables, resolved);
  const fullHeight = {
    section: wall.section,
    length: studLength,
    y: plateThickness,
    orientation: 'vertical' as const,
  };

  // Studs extras do projeto (S12): cada um ocupa [x, x + t]; stud de layout que os sobrepõe sai.
  const extras: StudMember[] = extraStuds(wall, studThickness, plan.zones).map(({ x, label }) => ({
    role: 'stud',
    ...fullHeight,
    x,
    ...(label === undefined ? {} : { label }),
  }));

  // Ligações (S14): faixas de T sem conflito com abertura; studs de canto e de encosto.
  const { clear: strips, warnings: teeWarnings } = teeConflicts(wall, teeStrips(wall.joints), openings, plan.zones);
  const jointStuds: StudMember[] = [...cornerStuds(wall, config), ...backerStuds(strips, config)].map(({ x, flat }) => ({
    role: 'stud',
    ...fullHeight,
    x,
    ...(flat ? { flat: true } : {}),
  }));
  const occupied = [...extras, ...jointStuds].map((m) => ({ start: m.x, end: m.x + verticalWidth(m) }));

  const layoutOrigin = wall.layoutOrigin ?? 0;
  const studs: Member[] = layoutStuds(wall.length, studSpacing, studThickness, layoutOrigin)
    .filter((x) => !plan.zones.some((z) => overlaps(x, x + studThickness, z.start, z.end)))
    .filter((x) => !occupied.some((o) => overlaps(x, x + studThickness, o.start, o.end)))
    .map((x) => ({ role: 'stud', ...fullHeight, x }));

  const kings: Member[] = plan.kings.map((x) => ({ role: 'kingStud', ...fullHeight, x }));

  const framings = openings.map((o, i) =>
    framingForOpening(o, wall, config, { kings: false, header: headers[i]! }),
  );
  for (const f of framings) warnings.push(...f.warnings);
  warnings.push(...teeWarnings);

  const verticals = [...studs, ...extras, ...jointStuds, ...kings];
  const ladder = ladderBlocks(wall, strips, verticals, config);
  // Fire blocking (S31, P11/P50): entre as peças de altura inteira, fora das zonas e do trecho do ladder.
  const ladderSkip = (config.tee ?? 'ladder') === 'ladder' ? ladderBays(wall, strips, verticals) : [];
  const zoneSkip = plan.zones.map((z) => ({ lo: z.start, hi: z.end }));
  const blocks = [...ladder, ...fireBlocks(wall, verticals, [...zoneSkip, ...ladderSkip], config)];

  // Aberturas como ficam no painel (S17): o topo do RO é a base do header montado.
  const panelOpenings: PanelOpening[] = openings.map((o, i) => {
    const header = framings[i]!.members.find((m) => m.role === 'header');
    if (header === undefined) throw new RangeError(`parede ${wall.id}, abertura ${o.id}: abertura sem header`);
    return { id: o.id, type: o.type, x: o.offset, width: o.roughWidth, top: header.y, height: o.roughHeight };
  });

  const members = [...plates, ...verticals, ...blocks, ...framings.flatMap((f) => f.members)];
  const panel: Panel = {
    id: wall.id,
    wallId: wall.id,
    length: wall.length,
    height: wall.height,
    section: wall.section,
    members,
    fieldCuts: framings.flatMap((f) => f.fieldCuts),
    warnings,
    layoutOrigin,
    openings: panelOpenings,
    exterior: wall.exterior,
    bearing: wall.bearing,
    // Parede de um painel só; `splitWall` dá o id, o offset e o peso de cada trecho (S15, S16).
    level: wall.level ?? 1,
    wallOffset: 0,
    weightLb: panelWeight({ members }),
  };

  // Validações (S10) por último, sobre o painel pronto e as aberturas com os jacks resolvidos.
  warnings.push(...validatePanel(panel, { ...wall, openings }, config));
  return { panel, plan };
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
    const where = { wallId: wall.id };
    const n = e.count ?? 1;
    if (!Number.isFinite(e.x)) throw new EngineError('EXTRA_STUD_INVALID', where, { index: i, field: 'x', value: e.x });
    if (!isCount(n)) throw new EngineError('EXTRA_STUD_INVALID', where, { index: i, field: 'count', value: n });
    if (e.x < -EPS || e.x + n * t > wall.length + EPS) {
      throw new EngineError('EXTRA_STUD_OUT_OF_WALL', where, { index: i, count: n, x: e.x, length: wall.length });
    }
    for (let k = 0; k < n; k++) {
      const x = e.x + k * t;
      const zone = zones.find((z) => overlaps(x, x + t, z.start, z.end));
      if (zone !== undefined) {
        throw new EngineError('EXTRA_STUD_IN_OPENING', where, { index: i, x, start: zone.start, end: zone.end });
      }
      out.push(e.label === undefined ? { x } : { x, label: e.label });
    }
  }
  return out;
}
