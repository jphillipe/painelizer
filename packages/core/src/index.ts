/**
 * Ponto de entrada público do motor. Tudo que o CLI (S6) e a UI (Fase 5)
 * consomem passa por aqui; módulos internos não são importados diretamente.
 */

export * from './types';
export * from './units';
export { layoutStuds } from './rules/studs';
export { layoutPlates } from './rules/plates';
export { DEFAULT_PRECUTS, LENGTH_TOLERANCE, matchPrecut } from './rules/precuts';
export {
  framingForOpening,
  openingKingXs,
  openingStudCounts,
  openingZone,
  type FramingOptions,
  type OpeningFraming,
  type OpeningZone,
} from './rules/openings';
export { mergeOpeningZones, type MergedZone, type ZonePlan } from './rules/zones';
export { panelizeWall } from './panelize/panelizeWall';
export * from './output/cutlist';
export * from './output/bom';
export * from './output/svg';
