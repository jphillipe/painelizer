/**
 * Posts do projeto (S37, hipótese P45): peças maciças 4x4/4x6/6x6 de altura inteira pedidas pela planta (cantos de
 * escada, apoio de viga LVL do piso — prancha da fábrica, pedido 3).
 *
 * Regras (docs/02-framing.md; hipótese P45):
 * - **Seções**: 4x4 (3.5×3.5), 4x6 (3.5×5.5), 6x6 (5.5×5.5) — `POST_SECTION_SIZE`.
 * - **Orientação**: uma face do post fica na espessura da parede e tem de ser igual à profundidade dela (2x4 = 3.5",
 *   2x6 = 5.5"); a outra fica em x. 4x6 em parede 2x6: 3.5" em x; em parede 2x4: a face larga ao longo da parede
 *   (`flat`, 5.5" em x). Post sem face igual à profundidade (4x4 em 2x6 não preenche a espessura; 6x6 em 2x4 sai
 *   dela) é erro `POST_DEPTH_MISMATCH` — o motor não adivinha calço nem recorte.
 * - **Altura**: a do stud (`height − 3·plate`, da bottom à top plate), em y = plate.
 * - **Posição**: `x` = borda esquerda. Post fora da parede (`POST_OUT_OF_WALL`), sobre uma zona de abertura
 *   (`POST_IN_OPENING`: king, jack e RO são da abertura) ou sobre outra peça de altura inteira que não é stud de
 *   layout — stud extra, de canto, de encosto ou outro post (`POST_OVERLAP`) — é erro. O stud de layout que ele
 *   sobrepõe sai (como com os studs extras, `panelizeWall`).
 * - **Conectores** (`base`, `top`): texto do projeto, levado à peça para a folha; não são peças nem entram na lista.
 *   A viga LVL que o post apoia também é só texto (em `top`), não peça do painel.
 * - Quebra de painel: o post é peça na faixa da junta, logo nunca é candidato (`whyNotBreak`, motivo `member`) e a
 *   quebra forçada sobre ele é erro `PANEL_BREAK_INVALID`.
 */

import { EPS } from '../eps';
import { overlaps } from '../geom';
import { EngineError } from '../messages';
import type { PostMember } from '../panel';
import { POST_SECTION_SIZE, isPostSection, sectionDepth, type PostSection, type WallSection } from '../sections';
import type { Post, Wall } from '../wall';

/** Como o post fica na parede: largura em x e se a face larga vai ao longo da parede. */
export interface PostFace {
  width: number;
  flat: boolean;
}

/**
 * A face do post em x numa parede da seção dada; `undefined` quando nenhuma face do post é a profundidade da parede.
 * Com as duas faces iguais (4x4, 6x6), a largura é a mesma; no 4x6 a face que sobra vai em x.
 */
export function postFace(section: PostSection, wallSection: WallSection): PostFace | undefined {
  const { thickness, depth } = POST_SECTION_SIZE[section];
  const wallDepth = sectionDepth(wallSection);
  if (Math.abs(depth - wallDepth) < EPS) return { width: thickness, flat: false };
  if (Math.abs(thickness - wallDepth) < EPS) return { width: depth, flat: true };
  return undefined;
}

/** Faixa em x de uma peça que o post não pode sobrepor (stud extra, de canto, de encosto). */
export interface PostObstacle {
  lo: number;
  hi: number;
  role: string;
}

export interface PostContext {
  /** y da base (a espessura da bottom plate) e comprimento (o do stud). */
  y: number;
  length: number;
  /** Zonas de abertura (fundidas) da parede. */
  zones: readonly { start: number; end: number }[];
  /** Peças de altura inteira já colocadas que não são studs de layout. */
  obstacles?: readonly PostObstacle[];
}

/**
 * As peças dos posts da parede (`wall.posts`), na ordem do projeto.
 *
 * @throws EngineError `POST_INVALID` (x não finito, seção desconhecida), `POST_DEPTH_MISMATCH`, `POST_OUT_OF_WALL`,
 *         `POST_IN_OPENING`, `POST_OVERLAP`
 */
export function postMembers(wall: Pick<Wall, 'id' | 'length' | 'section' | 'posts'>, ctx: PostContext): PostMember[] {
  const where = { wallId: wall.id };
  const out: PostMember[] = [];
  const placed: PostObstacle[] = [...(ctx.obstacles ?? [])];
  for (const [index, p] of (wall.posts ?? []).entries()) {
    if (!Number.isFinite(p.x)) throw new EngineError('POST_INVALID', where, { index, field: 'x', value: p.x });
    const section = p.section as string;
    if (!isPostSection(section))
      throw new EngineError('POST_INVALID', where, { index, field: 'section', value: section });
    const face = postFace(section, wall.section);
    if (face === undefined) {
      throw new EngineError('POST_DEPTH_MISMATCH', where, {
        index,
        section,
        wallSection: wall.section,
        wallDepth: sectionDepth(wall.section),
      });
    }
    const lo = p.x;
    const hi = p.x + face.width;
    if (lo < -EPS || hi > wall.length + EPS) {
      throw new EngineError('POST_OUT_OF_WALL', where, { index, x: p.x, width: face.width, length: wall.length });
    }
    const zone = ctx.zones.find((z) => overlaps(lo, hi, z.start, z.end));
    if (zone !== undefined) {
      throw new EngineError('POST_IN_OPENING', where, { index, x: p.x, start: zone.start, end: zone.end });
    }
    const hit = placed.find((o) => overlaps(lo, hi, o.lo, o.hi));
    if (hit !== undefined) {
      throw new EngineError('POST_OVERLAP', where, { index, x: p.x, role: hit.role, memberX: hit.lo });
    }
    placed.push({ lo, hi, role: 'post' });
    out.push(postMember(p, section, face, ctx));
  }
  return out;
}

function postMember(p: Post, section: PostSection, face: PostFace, ctx: PostContext): PostMember {
  return {
    role: 'post',
    section,
    length: ctx.length,
    x: p.x,
    y: ctx.y,
    orientation: 'vertical',
    ...(face.flat ? { flat: true } : {}),
    ...(p.label === undefined ? {} : { label: p.label }),
    ...(p.base === undefined ? {} : { base: p.base }),
    ...(p.top === undefined ? {} : { top: p.top }),
  };
}

/** Os posts que caem no trecho `[a, b)` da parede, deslocados para x do trecho (`splitWall`). */
export function postsForSegment(posts: readonly Post[], a: number, b: number): Post[] {
  return posts.filter((p) => p.x >= a - EPS && p.x < b - EPS).map((p) => ({ ...p, x: p.x - a }));
}
