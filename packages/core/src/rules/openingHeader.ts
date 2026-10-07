/**
 * Header de uma abertura: qual seção, quantos plies, quantos jacks e de onde veio.
 *
 * Ordem (docs/02-framing.md, 04-decisoes 2026-10-05):
 * 1. `opening.header` — o projeto (structural drawings) manda sobre a tabela (P10). Origem `project`.
 * 2. Parede portante: `headerFor` pela tabela IRC, com os dados da casa (`config.building`,
 *    `wall.buildingWidth` sobrescreve a largura), `wall.floorsSupported`, `wall.floorSpan` e a seção da
 *    parede. Origem = id da tabela.
 * 3. Parede não portante: uma peça deitada da seção da parede, 1 ply (R602.7.4 do IRC 2021; resposta P17b
 *    e hipóteses P18), válida para RO até 96". Origem `R602.7.4`. RO maior: `Error` pedindo o header do
 *    projeto (a fábrica dimensiona caso a caso). O limite de 24" até a top plate é conferido em
 *    `framingForOpening`, que conhece a altura do header.
 *
 * Jacks de cada lado: `opening.jackStuds` → `opening.header.jackStuds` → NJ da tabela → 1.
 * `opening.jackStuds` menor que o NJ da tabela gera aviso `HEADER_JACKS_BELOW_TABLE` (o painel sai com o
 * número pedido). Com header do projeto a tabela não é consultada.
 *
 * Kings de cada lado (S12, Tabela R602.7.5 — regra de vento, independente de quem escolheu o header):
 * - Parede interna: `opening.kingStuds` → 1.
 * - Parede externa com `opening.kingStuds`: o projeto manda; menor que a tabela (quando há vento) gera
 *   aviso `HEADER_KINGS_BELOW_TABLE`.
 * - Parede externa sem `kingStuds`: `kingsFor` com `config.building.windSpeed` e `exposure`; sem
 *   `windSpeed`, 1 king e aviso `WIND_SPEED_MISSING`; `requiresEngineer` (vão > 18' ou vento fora da
 *   tabela) lança `Error` pedindo `kingStuds`.
 *
 * Sem header não há geometria (jacks, cripples), então nada aqui é chutado: tabela que devolve
 * `requiresEngineer` ou dado faltando lança `Error` com parede, abertura e motivo.
 */

import type { Config, HeaderSource, Opening, Section, Wall, Warning } from '../types';
import { NOMINAL_2X_THICKNESS, SECTION_DEPTH, sectionDepth } from '../types';
import { headerFor, type HeaderQuery, type HeaderTable } from './headers';
import { kingsFor, type KingTable } from './kings';

/** Folga numérica para comparar espessura do header com a da parede. */
const EPS = 1e-9;

export interface ResolvedHeader {
  section: Section;
  plies: number;
  /** Jacks de cada lado que o painel vai levar. */
  jackStuds: number;
  /** Kings de cada lado que o painel vai levar. */
  kingStuds: number;
  source: HeaderSource;
  /** Peça deitada (parede não portante): 1.5" de altura, sem cripples acima. */
  flat: boolean;
  warnings: Warning[];
}

/** Tabelas injetáveis nos testes; ausentes = IRC de `src/data`. */
export interface HeaderTables {
  headers?: readonly HeaderTable[];
  kings?: KingTable;
}

/** R602.7.4: a peça deitada vale para aberturas de até 8'-0". */
export const FLAT_HEADER_MAX_SPAN = 96;

/** R602.7.4: e até 24" entre a peça e a superfície de pregação paralela acima (top plate). */
export const FLAT_HEADER_MAX_GAP = 24;

/**
 * @param tables tabelas injetadas (testes): lista de tabelas de header (forma antiga) ou
 *               `{ headers?, kings? }`; ausentes = IRC de `src/data`
 * @throws Error      header fora da tabela, dado da casa ou da parede faltando, RO não portante acima de 96",
 *                    header do projeto mais espesso que a parede, kings fora da tabela sem `kingStuds`
 * @throws RangeError número inválido (plies, jacks, kings, largura, neve, pavimentos, vento)
 */
export function resolveOpeningHeader(
  opening: Opening,
  wall: Wall,
  config: Config,
  tables?: readonly HeaderTable[] | HeaderTables,
): ResolvedHeader {
  const injected: HeaderTables = isList(tables) ? { headers: tables } : (tables ?? {});
  const header = resolveHeaderSpec(opening, wall, config, injected.headers);
  const kings = resolveKings(opening, wall, config, injected.kings);
  return { ...header, kingStuds: kings.kingStuds, warnings: [...header.warnings, ...kings.warnings] };
}

/** Kings de cada lado (ver regras no topo do arquivo). */
function resolveKings(
  opening: Opening,
  wall: Wall,
  config: Config,
  table?: KingTable,
): { kingStuds: number; warnings: Warning[] } {
  const where = `parede ${wall.id}, abertura ${opening.id}`;
  const explicit = opening.kingStuds;
  if (explicit !== undefined) count(explicit, `${where}: kingStuds`);
  if (!wall.exterior) return { kingStuds: explicit ?? 1, warnings: [] };

  const windSpeed = config.building?.windSpeed;
  if (windSpeed === undefined) {
    if (explicit !== undefined) return { kingStuds: explicit, warnings: [] };
    return {
      kingStuds: 1,
      warnings: [
        {
          code: 'WIND_SPEED_MISSING',
          message:
            `${where}: parede externa sem config.building.windSpeed — kings pela Tabela R602.7.5 não ` +
            'conferidos; o painel sai com 1 king por lado',
        },
      ],
    };
  }

  const query = {
    span: opening.roughWidth,
    windSpeed,
    ...(config.building?.exposure === undefined ? {} : { exposure: config.building.exposure }),
  };
  let choice;
  try {
    choice = table === undefined ? kingsFor(query) : kingsFor(query, table);
  } catch (e) {
    if (e instanceof RangeError) throw new RangeError(`${where}: ${e.message}`);
    throw e;
  }
  if ('requiresEngineer' in choice) {
    if (explicit !== undefined) return { kingStuds: explicit, warnings: [] };
    throw new Error(
      `${where}: kings fora da tabela (${choice.reason}) — exige engenheiro; informe kingStuds na abertura`,
    );
  }
  if (explicit !== undefined && explicit < choice.kings) {
    return {
      kingStuds: explicit,
      warnings: [
        {
          code: 'HEADER_KINGS_BELOW_TABLE',
          message:
            `${where}: ${explicit} king(s) por lado, mas a tabela ${choice.table} pede ${choice.kings} ` +
            `para vão de ${opening.roughWidth}" com vento de ${windSpeed} mph, exposição ` +
            `${config.building?.exposure ?? 'B'}`,
        },
      ],
    };
  }
  return { kingStuds: explicit ?? choice.kings, warnings: [] };
}

function resolveHeaderSpec(
  opening: Opening,
  wall: Wall,
  config: Config,
  tables?: readonly HeaderTable[],
): Omit<ResolvedHeader, 'kingStuds'> {
  const where = `parede ${wall.id}, abertura ${opening.id}`;
  const explicitJacks = opening.jackStuds;
  if (explicitJacks !== undefined) count(explicitJacks, `${where}: jackStuds`);

  const project = opening.header;
  if (project !== undefined) {
    if (!(project.section in SECTION_DEPTH)) {
      throw new RangeError(`${where}: header.section desconhecida (${String(project.section)})`);
    }
    count(project.plies, `${where}: header.plies`);
    if (project.jackStuds !== undefined) count(project.jackStuds, `${where}: header.jackStuds`);
    if (project.plies * NOMINAL_2X_THICKNESS > sectionDepth(wall.section) + EPS) {
      throw new Error(
        `${where}: header do projeto com ${project.plies} plies (${project.plies * NOMINAL_2X_THICKNESS}") ` +
          `não cabe em parede ${wall.section} (${sectionDepth(wall.section)}")`,
      );
    }
    return {
      section: project.section,
      plies: project.plies,
      jackStuds: explicitJacks ?? project.jackStuds ?? 1,
      source: 'project',
      flat: false,
      warnings: [],
    };
  }

  if (!wall.bearing) {
    if (opening.roughWidth > FLAT_HEADER_MAX_SPAN + EPS) {
      throw new Error(
        `${where}: parede não portante com RO de ${opening.roughWidth}" — a peça deitada (R602.7.4) vale até ` +
          `${FLAT_HEADER_MAX_SPAN}"; informe o header da abertura`,
      );
    }
    return {
      section: wall.section,
      plies: 1,
      jackStuds: explicitJacks ?? 1,
      source: 'R602.7.4',
      flat: true,
      warnings: [],
    };
  }

  const missing = (what: string) =>
    new Error(
      `${where}: parede portante sem header no projeto e sem ${what} — ` +
        'não dá para escolher o header pela tabela; informe o dado ou o header da abertura',
    );
  const building = config.building;
  if (building === undefined) throw missing('config.building (neve e largura da edificação)');
  if (wall.floorsSupported === undefined) throw missing('wall.floorsSupported (pavimentos acima da parede)');

  const query: HeaderQuery = {
    span: opening.roughWidth,
    exterior: wall.exterior,
    bearing: true,
    buildingWidth: wall.buildingWidth ?? building.buildingWidth,
    floorsSupported: wall.floorsSupported,
    wallSection: wall.section,
    ...(wall.exterior ? { groundSnowLoad: building.groundSnowLoad } : {}),
    ...(wall.floorSpan === undefined ? {} : { floorSpan: wall.floorSpan }),
  };
  let choice;
  try {
    choice = tables === undefined ? headerFor(query) : headerFor(query, tables);
  } catch (e) {
    if (e instanceof RangeError) throw new RangeError(`${where}: ${e.message}`);
    throw e;
  }
  if ('requiresEngineer' in choice) {
    throw new Error(
      `${where}: header fora da tabela (${choice.reason}) — exige engenheiro; informe o header da abertura`,
    );
  }
  if ('nonBearing' in choice) throw new Error(`${where}: tabela de headers não se aplica`);

  const warnings: Warning[] = [];
  if (explicitJacks !== undefined && explicitJacks < choice.jackStuds) {
    warnings.push({
      code: 'HEADER_JACKS_BELOW_TABLE',
      message:
        `${where}: ${explicitJacks} jack(s) por lado, mas a tabela ${choice.table} pede ${choice.jackStuds} ` +
        `para o header ${choice.plies}-${choice.section} com vão de ${opening.roughWidth}"`,
    });
  }
  return {
    section: choice.section,
    plies: choice.plies,
    jackStuds: explicitJacks ?? choice.jackStuds,
    source: choice.table,
    flat: false,
    warnings,
  };
}

function isList(t: readonly HeaderTable[] | HeaderTables | undefined): t is readonly HeaderTable[] {
  return Array.isArray(t);
}

function count(n: number, what: string): void {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`${what} deve ser inteiro ≥ 1 (recebido ${n})`);
}
