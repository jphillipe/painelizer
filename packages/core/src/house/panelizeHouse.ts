/**
 * Painéis de uma casa inteira (S13): um painel por parede, pela `Wall` derivada em `frameWalls`.
 * A divisão em painéis transportáveis é da S15.
 *
 * Desde a S14 a `Wall` derivada leva `joints` (canto, T, laps), e `panelizeWall` monta tudo — inclusive o
 * aviso `OPENING_AT_TEE` (faixa do T na zona de uma abertura) e o erro de faixa dentro do RO
 * (`rules/corners.ts`). Cada painel é exatamente `panelizeWall(frame.wall, config)`.
 */

import type { Config, Panel, Warning } from '../types';
import { panelizeWall } from '../panelize/panelizeWall';
import type { HeaderTables } from '../rules/openingHeader';
import type { HeaderTable } from '../rules/headers';
import { frameWalls, type WallFrame } from './frame';
import type { House } from './types';

export interface HouseResult {
  /** Um painel por parede, na ordem do arquivo. */
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
  const panels = frames.map((frame) => panelizeFrame(frame, config, tables));
  const warnings = panels.flatMap((p) => p.warnings.map((warning) => ({ panelId: p.id, warning })));
  return { panels, frames, warnings };
}

/**
 * Painel de uma parede já enquadrada. Exposto para quem precisa tratar o erro de cada parede
 * separadamente (CLI).
 *
 * @throws RangeError os de `panelizeWall`
 */
export function panelizeFrame(
  frame: WallFrame,
  config: Config,
  tables?: readonly HeaderTable[] | HeaderTables,
): Panel {
  return panelizeWall(frame.wall, config, tables);
}
