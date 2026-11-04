/**
 * Fixtures lidos pelo schema do arquivo de projeto (S28.2) em vez de `as Wall`/`as Config`: `config` e `wall`
 * (parede solta) ou `house` (planta) passam pelo `projectFrom` do CLI — strict, medidas pés-pol, aberturas
 * resolvidas pelo core — e o teste recebe os tipos do motor. Fixture fora do formato falha no carregamento, com
 * o caminho do campo. O resto do JSON (`expected`, `$comment`) vem como está.
 *
 * Import relativo ao código do cli, sem dependência de pacote: o cli depende do core, e declarar o contrário
 * faria um ciclo no workspace.
 */

import { projectFrom } from '../../../cli/src/project';
import type { House } from '../../src/house/types';
import type { Config, Wall } from '../../src/types';

/** Fixture de parede solta: `{ config, wall, expected… }`. */
export function wallFixture<T extends { config: unknown; wall: unknown }>(
  json: T,
): Omit<T, 'config' | 'wall'> & { config: Config; wall: Wall } {
  const p = projectFrom({ config: json.config, walls: [json.wall] }, 'fixture');
  return { ...json, config: p.config, wall: p.walls[0]! };
}

/** Fixture de casa em planta: `{ config, house: { walls, northAngle? }, expected… }`. */
export function houseFixture<T extends { config: unknown; house: { walls: unknown; northAngle?: unknown } }>(
  json: T,
): Omit<T, 'config' | 'house'> & { config: Config; house: House } {
  const { walls, northAngle } = json.house;
  const p = projectFrom({ config: json.config, walls, ...(northAngle === undefined ? {} : { northAngle }) }, 'fixture');
  return { ...json, config: p.config, house: p.house! };
}
