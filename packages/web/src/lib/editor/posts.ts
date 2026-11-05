/**
 * Posts da parede no editor (S37, hipótese P45): a largura que o post ocupa em x e a frase curta do inspetor, pela
 * mesma regra do motor (`postFace`, `core/rules/posts.ts`) — a face do post na espessura da parede tem de ser a
 * profundidade dela. A seção da parede pode vir do tipo (`withWallType`).
 */

import { POST_SECTION_SIZE, postFace, type PostSection, type WallSection } from 'core';
import type { DraftConfig, DraftPost, DraftWall } from './draft';
import { formatMeasure } from './measure';
import { withWallType } from './wall-types';

/** Opções de seção de post, na ordem do motor. */
export const POST_SECTION_OPTIONS = [
  { value: '4x4', label: '4x4' },
  { value: '4x6', label: '4x6' },
  { value: '6x6', label: '6x6' },
] as const satisfies readonly { value: PostSection; label: string }[];

/** Seção da parede como o motor a verá (a dela, senão a do tipo); `undefined` quando nenhum dos dois diz. */
function wallSectionOf(config: Pick<DraftConfig, 'wallTypes'>, wall: DraftWall): WallSection | undefined {
  return withWallType(config, wall).section;
}

/**
 * Largura do post em x, em polegadas. Sem seção da parede ou sem face que caiba (o motor recusa), a face menor do
 * post — serve para dividir e juntar paredes sem perder o post.
 */
export function postWidth(
  config: Pick<DraftConfig, 'wallTypes'>,
  wall: DraftWall,
  post: Pick<DraftPost, 'section'>,
): number | undefined {
  if (post.section === undefined) return undefined;
  const section = wallSectionOf(config, wall);
  const face = section === undefined ? undefined : postFace(post.section, section);
  return face?.width ?? POST_SECTION_SIZE[post.section].thickness;
}

/** A frase sob o post no inspetor: quanto ocupa ao longo da parede, ou por que o motor vai recusar. */
export function postHint(
  config: Pick<DraftConfig, 'wallTypes'>,
  wall: DraftWall,
  post: Pick<DraftPost, 'section'>,
): string {
  if (post.section === undefined) return 'Pick a size';
  const section = wallSectionOf(config, wall);
  if (section === undefined) return 'Set the wall section to place the post';
  const face = postFace(post.section, section);
  if (face === undefined) return `A ${post.section} has no face equal to the ${section} wall depth`;
  return `${formatMeasure(face.width)} along the wall${face.flat ? ' (wide face along the wall)' : ''}; replaces the layout studs it covers`;
}
