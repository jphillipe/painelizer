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

/** Qualquer seção de peça: serrada ou engenheirada. */
export type Section = LumberSection | EngineeredSection;

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
  const e = parseEngineeredSection(section);
  if (e === undefined) throw new RangeError(`unknown section (${String(section)})`);
  return e.depth;
}

/** Espessura real de uma peça da seção: 1.5" para serrada, a largura declarada para LVL/PSL. */
export function sectionThickness(section: Section): number {
  if (isLumberSection(section)) return NOMINAL_2X_THICKNESS;
  const e = parseEngineeredSection(section);
  if (e === undefined) throw new RangeError(`unknown section (${String(section)})`);
  return e.width;
}

/**
 * Largura em x que uma peça vertical ocupa na elevação: a espessura da madeira (1.5") em pé, a profundidade
 * da seção quando deitada (`flat`, stud do canto California — S14).
 */
export function verticalWidth(m: { section: Section; flat?: boolean }): number {
  return m.flat === true ? sectionDepth(m.section) : NOMINAL_2X_THICKNESS;
}
