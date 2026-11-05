/**
 * Tipos de parede do projeto (S35): transforma a parede como o projeto a escreve (`WallSpec`: seção, posição e
 * carga opcionais, mais a tag `wallType`) na parede completa que o motor consome. Como `rules/catalog.ts` faz com
 * as aberturas: esta camada fica antes do motor, que não muda.
 *
 * Prioridade (04-decisoes 2026-11-05): campo direto na parede > tipo (`config.wallTypes[wall.wallType]`). Não há
 * terceiro nível: o motor não adivinha seção, posição nem carga.
 *
 * Regras:
 * - `section`, `exterior`, `bearing`: o da parede; senão o do tipo. O que continuar faltando é erro com código
 *   (`WALL_FIELD_MISSING`), com a lista dos campos.
 * - Tag fora do catálogo: se a parede traz os três campos, a tag é só rótulo (a leitura por IA escreve a tag do
 *   arquiteto mesmo quando o catálogo não veio); se falta algum, `WALL_TYPE_UNKNOWN`.
 * - Campo presente na parede **e** no tipo com valores diferentes: a parede manda e sai um aviso
 *   `WALL_TYPE_MISMATCH` por campo (`wallTypeWarnings`, chamado nas validações do painel). `description` não entra.
 * - `blocking` (S36): o da parede (inclusive `[]`, que desliga); sem ele, o do tipo. Não compara nem avisa.
 * - O catálogo é de entrada parcial: um tipo pode dar só seção e posição (a folha de partition types do arquiteto
 *   não diz se a parede é portante).
 */

import type { Config } from '../config';
import { EngineError, warning, type Warning } from '../messages';
import type { BlockingEntry, Wall, WallTypeEntry, WallTypeField } from '../wall';

/** Os campos que o tipo pode dar, na ordem em que os erros e avisos os citam. */
export const WALL_TYPE_FIELDS: readonly WallTypeField[] = ['section', 'exterior', 'bearing'];

/** O que a resolução lê de uma parede: o id (para o erro), a tag e os três campos, presentes ou não. */
export type WallTypeInput = { id?: string; wallType?: string } & Partial<Pick<Wall, WallTypeField>>;

/** O que a comparação lê de uma linha do catálogo (o editor passa a sua, de entrada parcial). */
type TypeFields = Partial<Pick<WallTypeEntry, WallTypeField>>;

/** A linha do catálogo para a tag da parede; `undefined` sem tag ou com tag fora do catálogo. */
export function wallTypeOf<E extends TypeFields = WallTypeEntry>(
  wall: Pick<WallTypeInput, 'wallType'>,
  config: { wallTypes?: Record<string, E> | undefined },
): E | undefined {
  if (wall.wallType === undefined) return undefined;
  const types = config.wallTypes;
  // `Object.hasOwn`: uma tag chamada `constructor` ou `toString` não pode achar a linha no protótipo.
  return types !== undefined && Object.hasOwn(types, wall.wallType) ? types[wall.wallType] : undefined;
}

/**
 * A parede com seção, posição e carga resolvidas: o que ela traz, senão o que o tipo dá. Os demais campos voltam
 * como vieram (a tag fica, para a folha e a planta).
 *
 * @throws EngineError `WALL_TYPE_UNKNOWN` (tag fora do catálogo e campo faltando) ou `WALL_FIELD_MISSING` (campo
 *                     que nem a parede nem o tipo dão)
 */
export function resolveWallType<W extends WallTypeInput & { blocking?: BlockingEntry[] }>(
  wall: W,
  config: Pick<Config, 'wallTypes'>,
): W & Pick<Wall, WallTypeField | 'blocking'> {
  const entry = wallTypeOf(wall, config);
  const section = wall.section ?? entry?.section;
  const exterior = wall.exterior ?? entry?.exterior;
  const bearing = wall.bearing ?? entry?.bearing;
  if (section === undefined || exterior === undefined || bearing === undefined) {
    const resolved = { section, exterior, bearing };
    const fields = WALL_TYPE_FIELDS.filter((f) => resolved[f] === undefined);
    const where = wall.id === undefined ? {} : { wallId: wall.id };
    if (wall.wallType !== undefined && entry === undefined) {
      throw new EngineError('WALL_TYPE_UNKNOWN', where, { tag: wall.wallType, fields });
    }
    throw new EngineError('WALL_FIELD_MISSING', where, { fields, ...(wall.wallType === undefined ? {} : { wallType: wall.wallType }) });
  }
  // Blocking (S36): o da parede, mesmo `[]`; sem ele, o do tipo. Lista inteira, sem mistura nem aviso.
  const blocking = wall.blocking ?? entry?.blocking;
  return { ...wall, section, exterior, bearing, ...(blocking === undefined ? {} : { blocking: [...blocking] }) };
}

/** Um campo que a parede e o tipo dão com valores diferentes. */
export interface WallTypeMismatch {
  field: WallTypeField;
  /** O valor da parede (o que vale). */
  wall: string | boolean;
  /** O valor do tipo. */
  type: string | boolean;
}

/** Campos em que a parede contradiz o tipo dela, na ordem de `WALL_TYPE_FIELDS`. Sem tag ou sem linha: nenhum. */
export function wallTypeMismatches(wall: WallTypeInput, config: { wallTypes?: Record<string, TypeFields> | undefined }): WallTypeMismatch[] {
  const entry = wallTypeOf(wall, config);
  if (entry === undefined) return [];
  const out: WallTypeMismatch[] = [];
  for (const field of WALL_TYPE_FIELDS) {
    const own = wall[field];
    const typed = entry[field];
    if (own !== undefined && typed !== undefined && own !== typed) out.push({ field, wall: own, type: typed });
  }
  return out;
}

/** Um aviso `WALL_TYPE_MISMATCH` por campo em que a parede contradiz o tipo. Nunca interrompe: a parede manda. */
export function wallTypeWarnings(wall: WallTypeInput, config: Pick<Config, 'wallTypes'>): Warning[] {
  return wallTypeMismatches(wall, config).map((m) =>
    warning(
      'WALL_TYPE_MISMATCH',
      wall.id === undefined ? {} : { wallId: wall.id },
      { wallType: wall.wallType!, field: m.field, wall: m.wall, type: m.type },
    ),
  );
}
