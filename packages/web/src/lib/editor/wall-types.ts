/**
 * Tipos de parede no editor (S35): o catálogo `config.wallTypes` do draft e o que ele dá à parede que traz
 * `wallType`. A regra é a do motor (`core/rules/wallTypes.ts`): campo da parede > campo do tipo; tag fora do
 * catálogo é só rótulo. Aqui nada lança: o editor mostra o que falta em vez de recusar.
 */

import { WALL_TYPE_FIELDS, wallTypeMismatches, wallTypeOf, type WallTypeMismatch } from 'core';
import type { DraftConfig, DraftWall, DraftWallType, ProjectDraft } from './draft';

export type WallTypeFieldName = (typeof WALL_TYPE_FIELDS)[number];

/** A linha do catálogo para a tag da parede; `undefined` sem tag ou com tag fora do catálogo. */
export function typeOfWall(config: Pick<DraftConfig, 'wallTypes'>, wall: Pick<DraftWall, 'wallType'>): DraftWallType | undefined {
  return wallTypeOf(wall, config);
}

/** A parede com seção, posição e carga como o motor as verá: as dela, senão as do tipo. O resto volta igual. */
export function withWallType(config: Pick<DraftConfig, 'wallTypes'>, wall: DraftWall): DraftWall {
  const t = typeOfWall(config, wall);
  if (t === undefined) return wall;
  const out: DraftWall = { ...wall };
  if (out.section === undefined && t.section !== undefined) out.section = t.section;
  if (out.exterior === undefined && t.exterior !== undefined) out.exterior = t.exterior;
  if (out.bearing === undefined && t.bearing !== undefined) out.bearing = t.bearing;
  return out;
}

/** Campos (seção, posição, carga) que nem a parede nem o tipo dela dão, na ordem do motor. */
export function missingWallFields(config: Pick<DraftConfig, 'wallTypes'>, wall: DraftWall): WallTypeFieldName[] {
  const w = withWallType(config, wall);
  return WALL_TYPE_FIELDS.filter((f) => w[f] === undefined);
}

/** A tag da parede não está no catálogo (com a parede completa, é só rótulo; faltando campo, o motor recusa). */
export function hasUnknownWallType(config: Pick<DraftConfig, 'wallTypes'>, wall: Pick<DraftWall, 'wallType'>): boolean {
  return wall.wallType !== undefined && typeOfWall(config, wall) === undefined;
}

/** Campos em que a parede contradiz o tipo (o motor avisa `WALL_TYPE_MISMATCH`; a parede manda). */
export function wallTypeConflicts(config: Pick<DraftConfig, 'wallTypes'>, wall: DraftWall): WallTypeMismatch[] {
  return wallTypeMismatches(wall, config);
}

const FIELD_LABEL: Readonly<Record<WallTypeFieldName, string>> = {
  section: 'section',
  exterior: 'exterior / interior',
  bearing: 'bearing / non-bearing',
};

/** "section, bearing / non-bearing": os campos como a tela os chama. */
export function wallFieldNames(fields: readonly WallTypeFieldName[]): string {
  return fields.map((f) => FIELD_LABEL[f]).join(', ');
}

/** O que a linha do catálogo dá, numa frase curta: "2x6 · exterior · bearing"; vazia = "no defaults". */
export function wallTypeSummary(t: DraftWallType): string {
  const parts: string[] = [];
  if (t.section !== undefined) parts.push(t.section);
  if (t.exterior !== undefined) parts.push(t.exterior ? 'exterior' : 'interior');
  if (t.bearing !== undefined) parts.push(t.bearing ? 'bearing' : 'non-bearing');
  return parts.length === 0 ? 'no defaults' : parts.join(' · ');
}

/** Quantas paredes usam a tag. */
export function wallTypeUsage(draft: Pick<ProjectDraft, 'walls'>, tag: string): number {
  return draft.walls.filter((w) => w.wallType === tag).length;
}

/** Tags para o campo "Wall type": as do catálogo, na ordem do arquivo, com o resumo de cada uma. */
export function wallTypeOptions(config: Pick<DraftConfig, 'wallTypes'>): { tag: string; summary: string }[] {
  return Object.entries(config.wallTypes ?? {}).map(([tag, t]) => ({ tag, summary: wallTypeSummary(t) }));
}

/** Texto de ajuda do campo "Wall type" para a tag dada. */
export function wallTypeHint(config: Pick<DraftConfig, 'wallTypes'>, tag: string | undefined): string {
  if (tag === undefined) return 'Pick one from the project wall types, or type a tag';
  const t = typeOfWall(config, { wallType: tag });
  if (t === undefined) return 'Not in the project wall types: label only';
  return `${wallTypeSummary(t)} — fills what the wall leaves unset`;
}
