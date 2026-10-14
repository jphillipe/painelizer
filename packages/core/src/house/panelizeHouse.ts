/**
 * Painéis de uma casa inteira (S13): a `Wall` derivada de cada parede em `frameWalls`, dividida em painéis
 * transportáveis por `splitWall` (S15).
 *
 * Desde a S14 a `Wall` derivada leva `joints` (canto, T, laps), e `panelizeWall` monta tudo — inclusive o
 * aviso `OPENING_AT_TEE` (faixa do T na zona de uma abertura) e o erro de faixa dentro do RO
 * (`rules/corners.ts`). Os painéis de uma parede são `splitWall(frame.wall, config)` — ids
 * `{level}-{wallId}-P{n}` (S16) — mais `Panel.plan`: as pontas da plate de cada painel em planta, andando de
 * `plateStart` para `plateEnd` pelo `wallOffset` e pelo comprimento do painel.
 */

import type { Config, Panel, PanelFacing, Point, Warning } from '../types';
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
  // Direção unitária da plate em planta: a parede é paralela a um eixo, então é ±1 num eixo e 0 no outro.
  const ux = Math.sign(frame.plateEnd.x - frame.plateStart.x);
  const uy = Math.sign(frame.plateEnd.y - frame.plateStart.y);
  const at = (s: number): Point => ({ x: frame.plateStart.x + ux * s, y: frame.plateStart.y + uy * s });
  // Face voltada para quem lê a folha (S17, P24): x=0 à esquerda ⇒ o leitor está à direita do sentido
  // start→end; se o lado de fora está aí, a elevação é a vista de fora.
  const facing: { facing: PanelFacing } | Record<string, never> =
    frame.outside === undefined ? {} : { facing: frame.outside === 'right' ? 'exterior' : 'interior' };
  return splitWall(frame.wall, config, tables).map((p) => {
    const a = p.wallOffset ?? 0;
    return { ...p, plan: { start: at(a), end: at(a + p.length) }, ...facing };
  });
}
