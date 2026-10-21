/**
 * Elevação esquemática de uma parede (M5), para o projeto solto (sem planta) e como vista rápida: comprimento,
 * altura e cada RO como retângulo, sem framing (o motor desenha a folha de verdade). Puro; usa o core só para
 * resolver a abertura como o motor a vê.
 */

import type { DraftWall, ProjectDraft } from './draft';
import { configFromDraft, resolveDraftOpening } from './resolve';

export interface ElevationOpening {
  id: string;
  type: 'window' | 'door';
  /** Borda esquerda do RO a partir do início da parede. */
  x: number;
  width: number;
  /** Base e topo do RO acima do subfloor. */
  bottom: number;
  top: number;
  resolved: boolean;
}

export interface Elevation {
  wallId: string;
  length: number | undefined;
  height: number;
  /** Altura veio do draft (parede ou pré-corte) ou é um palpite para desenhar. */
  heightKnown: boolean;
  openings: ElevationOpening[];
  /** Aberturas sem posição ou que o core não resolve: listadas, não desenhadas. */
  unplaced: string[];
}

export const DEFAULT_ELEVATION_HEIGHT = 97.125;

export function wallLengthOf(w: DraftWall): number | undefined {
  if (w.length !== undefined) return w.length;
  if (w.start !== undefined && w.end !== undefined) return Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
  return undefined;
}

export function elevationOf(d: ProjectDraft, w: DraftWall): Elevation {
  const config = configFromDraft(d);
  const plate = d.config.plateThickness ?? 1.5;
  const precut = d.config.studLength?.[0];
  const height = w.height ?? (precut === undefined ? undefined : precut + 3 * plate);
  const h = height ?? DEFAULT_ELEVATION_HEIGHT;
  const defaultTop = d.config.headerHeight ?? h - 3 * plate;
  const openings: ElevationOpening[] = [];
  const unplaced: string[] = [];
  for (const o of w.openings) {
    const r = resolveDraftOpening(d, o, config);
    if (!r.ok) {
      // Sem catálogo ou sem posição: desenha o que se sabe, se der.
      const width = o.roughWidth;
      const x = o.offset ?? (o.center !== undefined && width !== undefined ? o.center - width / 2 : undefined);
      if (width === undefined || x === undefined) {
        unplaced.push(o.id);
        continue;
      }
      const type = o.type ?? 'window';
      const top = o.headerHeight ?? defaultTop;
      const bottom = type === 'door' ? 0 : o.sillHeight ?? (o.roughHeight === undefined ? Math.max(0, top - 48) : top - o.roughHeight);
      openings.push({ id: o.id, type, x, width, bottom, top, resolved: false });
      continue;
    }
    const op = r.opening;
    const top = op.headerHeight ?? defaultTop;
    const bottom = op.type === 'door' ? 0 : top - op.roughHeight;
    openings.push({ id: o.id, type: op.type, x: op.offset, width: op.roughWidth, bottom, top, resolved: true });
  }
  return { wallId: w.id, length: wallLengthOf(w), height: h, heightKnown: height !== undefined, openings, unplaced };
}
