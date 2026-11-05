/**
 * Blocking por altura no editor (S36, hipótese P44): os presets que valem no projeto (embutidos do motor + os de
 * `config.blockingPresets`), o texto de cada item da lista da parede e as fileiras que o tipo de parede dá quando a
 * parede não tem as suas. A regra é a do motor (`core/rules/blocking.ts`, `resolveWallType`): a lista da parede,
 * mesmo vazia, vale sobre a do tipo. Puro; nada lança.
 */

import { BUILTIN_BLOCKING_PRESETS, DEFAULT_BLOCKING_LABEL } from 'core';
import type { DraftBlockingEntry, DraftBlockingPreset, DraftConfig, DraftWall } from './draft';
import { formatMeasure } from './measure';
import { typeOfWall } from './wall-types';

/** Um preset como o editor o oferece: id, centro e uso. */
export interface BlockingPresetOption {
  id: string;
  y: number | undefined;
  label: string;
  /** Vem de `config.blockingPresets` (substitui o embutido de mesmo id). */
  project: boolean;
}

/** Os presets do projeto: embutidos e do projeto, em ordem de id; o do projeto substitui o embutido de mesmo id. */
export function blockingPresetOptions(config: Pick<DraftConfig, 'blockingPresets'>): BlockingPresetOption[] {
  const all = new Map<string, BlockingPresetOption>();
  for (const [id, p] of Object.entries(BUILTIN_BLOCKING_PRESETS)) all.set(id, { id, y: p.y, label: p.label, project: false });
  for (const [id, p] of Object.entries(config.blockingPresets ?? {}) as [string, DraftBlockingPreset][]) {
    all.set(id, { id, y: p.y, label: p.label ?? id, project: true });
  }
  return [...all.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** "Base cabinets / countertop · 36"" (preset) ou "Rail · 54" · 8'-0" to 12'-0"" (fileira); preset desconhecido avisa. */
export function blockingEntryText(entry: DraftBlockingEntry, config: Pick<DraftConfig, 'blockingPresets'>): string {
  if (typeof entry === 'string') {
    const p = blockingPresetOptions(config).find((o) => o.id === entry);
    if (p === undefined) return `${entry} · unknown preset`;
    return `${p.label} · ${p.y === undefined ? '?' : formatMeasure(p.y)}`;
  }
  const parts = [entry.label ?? DEFAULT_BLOCKING_LABEL, entry.y === undefined ? '?' : formatMeasure(entry.y)];
  if (entry.from !== undefined || entry.to !== undefined) {
    parts.push(`${entry.from === undefined ? 'start' : formatMeasure(entry.from)} to ${entry.to === undefined ? 'end' : formatMeasure(entry.to)}`);
  }
  return parts.join(' · ');
}

/** As fileiras que o tipo da parede dá; `undefined` quando a parede tem as suas, não tem tipo ou o tipo não dá. */
export function blockingFromType(config: Pick<DraftConfig, 'wallTypes'>, wall: Pick<DraftWall, 'wallType' | 'blocking'>): DraftBlockingEntry[] | undefined {
  if (wall.blocking !== undefined) return undefined;
  return typeOfWall(config, wall)?.blocking;
}

/**
 * A lista da parede depois de tirar um item. Vazia: `[]` quando o tipo da parede dá fileiras (senão elas voltariam
 * sem o usuário pedir), `undefined` quando não dá.
 */
export function withoutBlockingEntry(
  config: Pick<DraftConfig, 'wallTypes'>,
  wall: Pick<DraftWall, 'wallType' | 'blocking'>,
  index: number,
): DraftBlockingEntry[] | undefined {
  const next = (wall.blocking ?? []).filter((_, i) => i !== index);
  if (next.length > 0) return next;
  return typeOfWall(config, wall)?.blocking === undefined ? undefined : [];
}
