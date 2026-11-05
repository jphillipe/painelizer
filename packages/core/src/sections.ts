/**
 * Seções de madeira (serrada e engenheirada) e suas dimensões reais. Todas as medidas em polegadas decimais.
 */

/** Seção nominal de madeira serrada. */
export type LumberSection = '2x4' | '2x6' | '2x8' | '2x10' | '2x12';

/** Madeira engenheirada de header (S12.5): LVL e PSL, com dimensões reais no nome. */
export type EngineeredMaterial = 'LVL' | 'PSL';

/**
 * Seção de madeira engenheirada, no formato `"LVL 1.75x9.25"` (material, espessura x profundidade em
 * polegadas decimais). Só aparece em header; studs e plates são sempre serrados.
 */
export type EngineeredSection = `${EngineeredMaterial} ${number}x${number}`;

/**
 * Seção nominal de post (S37, hipótese P45): madeira serrada maciça 4x4, 4x6 e 6x6, separada de `LumberSection` (que é a
 * família "2x" de studs, plates e headers serrados). Reais 3.5×3.5, 3.5×5.5 e 5.5×5.5.
 */
export type PostSection = '4x4' | '4x6' | '6x6';

/** Dimensões reais de cada seção de post: `thickness` = a face menor, `depth` = a maior (polegadas). */
export const POST_SECTION_SIZE: Readonly<Record<PostSection, { thickness: number; depth: number }>> = {
  '4x4': { thickness: 3.5, depth: 3.5 },
  '4x6': { thickness: 3.5, depth: 5.5 },
  '6x6': { thickness: 5.5, depth: 5.5 },
};

/** As seções de post, da menor para a maior. */
export const POST_SECTIONS: readonly PostSection[] = ['4x4', '4x6', '6x6'];

export function isPostSection(section: string): section is PostSection {
  return section in POST_SECTION_SIZE;
}

/** Madeira serrada: a família 2x e os posts (S37). Comprada em comprimento comercial; peso pela tabela. */
export type SawnSection = LumberSection | PostSection;

export function isSawnSection(section: string): section is SawnSection {
  return isLumberSection(section) || isPostSection(section);
}

/** Qualquer seção de peça: serrada (2x ou post) ou engenheirada. */
export type Section = LumberSection | EngineeredSection | PostSection;

/** Seções admitidas para studs e plates de parede. */
export type WallSection = Extract<LumberSection, '2x4' | '2x6'>;

/** Espessura real de qualquer peça "2x" (polegadas). */
export const NOMINAL_2X_THICKNESS = 1.5;

/** Profundidade real (largura da face) de cada seção nominal, em polegadas. */
export const SECTION_DEPTH: Readonly<Record<LumberSection, number>> = {
  '2x4': 3.5,
  '2x6': 5.5,
  '2x8': 7.25,
  '2x10': 9.25,
  '2x12': 11.25,
};

export function isLumberSection(section: string): section is LumberSection {
  return section in SECTION_DEPTH;
}

const ENGINEERED_RE = /^(LVL|PSL) (\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/;

/** Decompõe `"LVL 1.75x9.25"`; `undefined` quando a string não é seção engenheirada. */
export function parseEngineeredSection(
  section: string,
): { material: EngineeredMaterial; width: number; depth: number } | undefined {
  const m = ENGINEERED_RE.exec(section);
  if (m === null) return undefined;
  const width = Number(m[2]);
  const depth = Number(m[3]);
  if (!(width > 0) || !(depth > 0)) return undefined;
  return { material: m[1] as EngineeredMaterial, width, depth };
}

/** Monta a string canônica de uma seção engenheirada. */
export function engineeredSection(material: EngineeredMaterial, width: number, depth: number): EngineeredSection {
  if (!(width > 0) || !(depth > 0)) throw new RangeError(`invalid ${material} section (${width}x${depth})`);
  return `${material} ${width}x${depth}` as EngineeredSection;
}

/** Profundidade real da seção. Sempre derivada; nunca é entrada. */
export function sectionDepth(section: Section): number {
  if (isLumberSection(section)) return SECTION_DEPTH[section];
  if (isPostSection(section)) return POST_SECTION_SIZE[section].depth;
  const e = parseEngineeredSection(section);
  if (e === undefined) throw new RangeError(`unknown section (${String(section)})`);
  return e.depth;
}

/** Espessura real de uma peça da seção: 1.5" para 2x, a face menor do post, a largura declarada para LVL/PSL. */
export function sectionThickness(section: Section): number {
  if (isLumberSection(section)) return NOMINAL_2X_THICKNESS;
  if (isPostSection(section)) return POST_SECTION_SIZE[section].thickness;
  const e = parseEngineeredSection(section);
  if (e === undefined) throw new RangeError(`unknown section (${String(section)})`);
  return e.width;
}

/**
 * Largura em x que uma peça vertical ocupa na elevação: a espessura da seção (1.5" no 2x; a face menor do post, S37)
 * em pé, a profundidade quando deitada (`flat`: stud do canto California, S14; 4x6 com a face larga ao longo da
 * parede 2x4, S37).
 */
export function verticalWidth(m: { section: Section; flat?: boolean }): number {
  return m.flat === true ? sectionDepth(m.section) : sectionThickness(m.section);
}
