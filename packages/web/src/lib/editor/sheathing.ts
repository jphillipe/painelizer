/**
 * Sheathing no editor (S38): o que vale para a parede (para a ajuda do inspetor) e a escrita dos campos de
 * `config.sheathing` nas configurações do projeto. A regra é a do motor (`core/rules/sheathing.ts`): a parede manda
 * (`true`/`false`/objeto), senão o tipo de parede, senão `config.sheathing.walls` (default: as externas).
 */

import type { DraftSheathingConfig, DraftWallSheathing, ProjectDraft, SheathingSide, SheathingWalls } from './draft';

/** O que o seletor da parede mostra: ligado, desligado, ajuste do arquivo, ou "segue o projeto" (`undefined`). */
export type WallSheathingChoice = 'on' | 'off' | 'custom' | undefined;

export function wallSheathingChoice(s: DraftWallSheathing | undefined): WallSheathingChoice {
  if (s === undefined) return undefined;
  if (s === true) return 'on';
  if (s === false) return 'off';
  return 'custom';
}

/** Se a parede leva chapa e por quê. */
export interface SheathingStatus {
  on: boolean;
  source: 'wall' | 'type' | 'project' | 'none';
  /** Frase curta para a ajuda do campo. */
  text: string;
}

const WALLS_TEXT: Readonly<Record<SheathingWalls, string>> = {
  exterior: 'exterior walls',
  all: 'all walls',
  none: 'only walls that ask for it',
};

export function sheathingStatus(
  draft: Pick<ProjectDraft, 'config'>,
  wall: { sheathing?: DraftWallSheathing | undefined; wallType?: string | undefined; exterior?: boolean | undefined },
): SheathingStatus {
  const types = draft.config.wallTypes;
  const type = wall.wallType !== undefined && types !== undefined && Object.hasOwn(types, wall.wallType) ? types[wall.wallType] : undefined;
  if (wall.sheathing !== undefined) {
    const on = wall.sheathing !== false;
    return { on, source: 'wall', text: on ? 'Sheathed (set on this wall)' : 'No sheathing (set on this wall)' };
  }
  if (type?.sheathing !== undefined) {
    const on = type.sheathing !== false;
    return { on, source: 'type', text: `${on ? 'Sheathed' : 'No sheathing'} — from wall type ${wall.wallType ?? ''}`.trim() };
  }
  const project = draft.config.sheathing;
  if (project === undefined) return { on: false, source: 'none', text: 'No sheathing — the project has none' };
  const walls = project.walls ?? 'exterior';
  const exterior = wall.exterior ?? type?.exterior;
  const on = walls === 'all' || (walls === 'exterior' && exterior === true);
  return { on, source: 'project', text: `${on ? 'Sheathed' : 'No sheathing'} — project sheathing goes on ${WALLS_TEXT[walls]}` };
}

/** Campos editáveis de `config.sheathing` (o resto do arquivo é preservado). */
export interface SheathingPatch {
  walls?: SheathingWalls | undefined;
  thickness?: number | undefined;
  sheetWidth?: number | undefined;
  sheetHeight?: number | undefined;
  side?: SheathingSide | undefined;
  /** `undefined` = automático (a espessura da outra parede). */
  corner?: number | undefined;
  floorTop?: number | undefined;
  floorBottom?: number | undefined;
  nail?: string | undefined;
  edge?: number | undefined;
  field?: number | undefined;
}

/** Objeto sem chaves `undefined`; vazio vira `undefined`. */
function trimmed<T extends Record<string, unknown>>(o: T): { [K in keyof T]?: Exclude<T[K], undefined> } | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return Object.keys(out).length === 0 ? undefined : (out as { [K in keyof T]?: Exclude<T[K], undefined> });
}

/**
 * `config.sheathing` com o patch aplicado (só as chaves presentes no patch mudam). Sempre devolve objeto: desligar é
 * tirar `config.sheathing` inteiro, não esvaziar.
 */
export function patchSheathing(current: DraftSheathingConfig | undefined, patch: SheathingPatch): DraftSheathingConfig {
  const c = current ?? {};
  const has = (k: keyof SheathingPatch): boolean => Object.hasOwn(patch, k);
  const sheet = trimmed({
    width: has('sheetWidth') ? patch.sheetWidth : c.sheet?.width,
    height: has('sheetHeight') ? patch.sheetHeight : c.sheet?.height,
  });
  const overhang = trimmed({
    corner: has('corner') ? patch.corner : c.overhang?.corner,
    floorTop: has('floorTop') ? patch.floorTop : c.overhang?.floorTop,
    floorBottom: has('floorBottom') ? patch.floorBottom : c.overhang?.floorBottom,
  });
  const nailing = trimmed({
    nail: has('nail') ? patch.nail : c.nailing?.nail,
    edge: has('edge') ? patch.edge : c.nailing?.edge,
    field: has('field') ? patch.field : c.nailing?.field,
  });
  return (
    trimmed({
      thickness: has('thickness') ? patch.thickness : c.thickness,
      sheet,
      side: has('side') ? patch.side : c.side,
      overhang,
      nailing,
      walls: has('walls') ? patch.walls : c.walls,
    }) ?? {}
  );
}

export const SHEATHING_WALLS_OPTIONS: readonly { value: SheathingWalls; label: string }[] = [
  { value: 'exterior', label: 'Exterior walls' },
  { value: 'all', label: 'All walls' },
  { value: 'none', label: 'Only walls that ask' },
];

export const SHEATHING_SIDE_OPTIONS: readonly { value: SheathingSide; label: string }[] = [
  { value: 'exterior', label: 'Exterior face' },
  { value: 'interior', label: 'Interior face' },
  { value: 'both', label: 'Both faces' },
];
