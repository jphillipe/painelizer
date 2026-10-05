/**
 * Header de uma abertura: qual seção, quantos plies, quantos jacks e de onde veio.
 *
 * Ordem (docs/02-framing.md, 04-decisoes 2026-10-05):
 * 1. `opening.header` — o projeto (structural drawings) manda sobre a tabela (P10). Origem `project`.
 * 2. Parede portante: `headerFor` pela tabela IRC, com os dados da casa (`config.building`,
 *    `wall.buildingWidth` sobrescreve a largura), `wall.floorsSupported`, `wall.floorSpan` e a seção da
 *    parede. Origem = id da tabela.
 * 3. Parede não portante: `config.defaultHeaderSection` / `defaultHeaderPlies` (hipótese P17). Origem `default`.
 *
 * Jacks de cada lado: `opening.jackStuds` → `opening.header.jackStuds` → NJ da tabela → 1.
 * `opening.jackStuds` menor que o NJ da tabela gera aviso `HEADER_JACKS_BELOW_TABLE` (o painel sai com o
 * número pedido). Com header do projeto a tabela não é consultada.
 *
 * Sem header não há geometria (jacks, cripples), então nada aqui é chutado: tabela que devolve
 * `requiresEngineer` ou dado faltando lança `Error` com parede, abertura e motivo.
 */

import type { Config, HeaderSource, Opening, Section, Wall, Warning } from '../types';
import { NOMINAL_2X_THICKNESS, SECTION_DEPTH, sectionDepth } from '../types';
import { headerFor, type HeaderQuery, type HeaderTable } from './headers';

/** Folga numérica para comparar espessura do header com a da parede. */
const EPS = 1e-9;

export interface ResolvedHeader {
  section: Section;
  plies: number;
  /** Jacks de cada lado que o painel vai levar. */
  jackStuds: number;
  source: HeaderSource;
  warnings: Warning[];
}

/**
 * @param tables tabela injetada (testes); ausente = IRC de `src/data/irc-headers.json`
 * @throws Error      header fora da tabela, dado da casa ou da parede faltando, padrão do config ausente,
 *                    header do projeto mais espesso que a parede
 * @throws RangeError número inválido (plies, jacks, largura, neve, pavimentos)
 */
export function resolveOpeningHeader(
  opening: Opening,
  wall: Wall,
  config: Config,
  tables?: readonly HeaderTable[],
): ResolvedHeader {
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
      warnings: [],
    };
  }

  if (!wall.bearing) {
    const section = config.defaultHeaderSection;
    const plies = config.defaultHeaderPlies;
    if (section === undefined || plies === undefined) {
      throw new Error(
        `${where}: parede não portante sem header no projeto exige config.defaultHeaderSection e ` +
          'config.defaultHeaderPlies',
      );
    }
    return { section, plies, jackStuds: explicitJacks ?? 1, source: 'default', warnings: [] };
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
    warnings,
  };
}

function count(n: number, what: string): void {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`${what} deve ser inteiro ≥ 1 (recebido ${n})`);
}
