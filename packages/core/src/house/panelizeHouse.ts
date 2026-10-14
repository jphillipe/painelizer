/**
 * Painéis de uma casa inteira (S13): um painel por parede, pela `Wall` derivada em `frameWalls`.
 * A divisão em painéis transportáveis é da S15; as peças de canto e T, da S14.
 *
 * Tees (hipótese P22 fica para a S14): a parede que encosta ocupa a faixa `[x − w/2, x + w/2]` da parede
 * atravessada. Faixa dentro do RO de uma abertura é erro (não há onde pregar a parede); faixa na zona de
 * abertura (kings/jacks) gera o aviso `OPENING_AT_TEE` no painel da parede atravessada.
 */

import type { Config, Panel, Warning } from '../types';
import { panelizeWall, planOpenings } from '../panelize/panelizeWall';
import type { HeaderTables } from '../rules/openingHeader';
import type { HeaderTable } from '../rules/headers';
import { frameWalls, type WallFrame } from './frame';
import type { House } from './types';

const EPS = 1e-9;

export interface HouseResult {
  /** Um painel por parede, na ordem do arquivo. */
  panels: Panel[];
  frames: WallFrame[];
  /** Todos os avisos, com o painel de origem (os mesmos de `panel.warnings`). */
  warnings: { panelId: string; warning: Warning }[];
}

/**
 * @param tables tabelas injetadas (testes), como em `panelizeWall`
 * @throws RangeError os de `frameWalls` e `panelizeWall`; T dentro de um RO
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
 * Painel de uma parede já enquadrada: `panelizeWall` da `Wall` derivada mais os avisos de T.
 * Exposto para quem precisa tratar o erro de cada parede separadamente (CLI).
 *
 * @throws RangeError os de `panelizeWall`; T dentro de um RO
 */
export function panelizeFrame(
  frame: WallFrame,
  config: Config,
  tables?: readonly HeaderTable[] | HeaderTables,
): Panel {
  const panel = panelizeWall(frame.wall, config, tables);
  panel.warnings.push(...teeWarnings(frame, config, tables));
  return panel;
}

function teeWarnings(
  frame: WallFrame,
  config: Config,
  tables?: readonly HeaderTable[] | HeaderTables,
): Warning[] {
  if (frame.connections.tees.length === 0 || frame.wall.openings.length === 0) return [];
  const { wall } = frame;
  const { openings, plan } = planOpenings(wall, config, tables);
  const warnings: Warning[] = [];
  for (const tee of frame.connections.tees) {
    const lo = tee.x - tee.width / 2;
    const hi = tee.x + tee.width / 2;
    for (const o of openings) {
      if (lo < o.offset + o.roughWidth - EPS && hi > o.offset + EPS) {
        throw new RangeError(
          `parede ${wall.id}, abertura ${o.id}: a parede ${tee.wallId} encosta em T em x=${tee.x} ` +
            `(faixa ${lo}–${hi}), dentro do RO [${o.offset}, ${o.offset + o.roughWidth}]`,
        );
      }
    }
    for (const z of plan.zones) {
      if (lo < z.end - EPS && hi > z.start + EPS) {
        warnings.push({
          code: 'OPENING_AT_TEE',
          message:
            `parede ${wall.id}: a parede ${tee.wallId} encosta em T em x=${tee.x} (faixa ${lo}–${hi}), ` +
            `na zona da(s) abertura(s) ${z.openingIds.join(', ')} [${z.start}, ${z.end}] — ` +
            'kings/jacks e o ladder blocking disputam o lugar; afaste a abertura ou a parede',
        });
      }
    }
  }
  return warnings;
}
