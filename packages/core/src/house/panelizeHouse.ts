/**
 * Painéis de uma casa inteira (S13): a `Wall` derivada de cada parede em `frameWalls`, dividida em painéis
 * transportáveis por `splitWall` (S15).
 *
 * Desde a S14 a `Wall` derivada leva `joints` (canto, T, laps), e `panelizeWall` monta tudo — inclusive o
 * aviso `OPENING_AT_TEE` (faixa do T na zona de uma abertura) e o erro de faixa dentro do RO
 * (`rules/corners.ts`). Os painéis de uma parede são exatamente `splitWall(frame.wall, config)`: um só, com o
 * id da parede, quando ela cabe em `config.panel.maxLength`; `W01-P1`, `W01-P2`… quando não.
 */

import type { Config, Panel, Warning } from '../types';
import { splitWall } from '../panelize/splitWall';
import type { HeaderTables } from '../rules/openingHeader';
import type { HeaderTable } from '../rules/headers';
import { frameWalls, type WallFrame } from './frame';
import type { House } from './types';

export interface HouseResult {
  /** Painéis de todas as paredes: na ordem do arquivo e, dentro da parede, de start para end. */
  panels: Panel[];
  frames: WallFrame[];
  /** Todos os avisos, com o painel de origem (os mesmos de `panel.warnings`). */
  warnings: { panelId: string; warning: Warning }[];
}

/**
 * @param tables tabelas injetadas (testes), como em `panelizeWall`
 * @throws RangeError os de `frameWalls` e `panelizeWall` (inclusive T dentro de um RO)
 */
export function panelizeHouse(
  house: House,
  config: Config,
  tables?: readonly HeaderTable[] | HeaderTables,
): HouseResult {
  const frames = frameWalls(house);
  const panels = frames.flatMap((frame) => panelizeFrame(frame, config, tables));
  const warnings = panels.flatMap((p) => p.warnings.map((warning) => ({ panelId: p.id, warning })));
  return { panels, frames, warnings };
}

/**
 * Painéis de uma parede já enquadrada. Exposto para quem precisa tratar o erro de cada parede
 * separadamente (CLI).
 *
 * @throws RangeError os de `splitWall`
 */
export function panelizeFrame(
  frame: WallFrame,
  config: Config,
  tables?: readonly HeaderTable[] | HeaderTables,
): Panel[] {
  return splitWall(frame.wall, config, tables);
}
