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
export {
  headerFor,
  ircHeaders,
  loadHeaderTables,
  validateHeaderTables,
  type HeaderCell,
  type HeaderChoice,
  type HeaderColumn,
  type HeaderGroup,
  type HeaderQuery,
  type HeaderRow,
  type HeaderSpec,
  type HeaderTable,
} from './rules/headers';
export {
  ircKings,
  kingsFor,
  loadKingTable,
  validateKingTable,
  type KingChoice,
  type KingColumn,
  type KingQuery,
  type KingRow,
  type KingSpec,
  type KingTable,
  type WindCondition,
} from './rules/kings';
export {
  FLAT_HEADER_MAX_GAP,
  FLAT_HEADER_MAX_SPAN,
  resolveOpeningHeader,
  type HeaderTables,
  type ResolvedHeader,
} from './rules/openingHeader';
export { mergeOpeningZones, type MergedZone, type ZonePlan } from './rules/zones';
export { panelizeWall } from './panelize/panelizeWall';
export { validatePanel } from './panelize/validate';
export * from './output/cutlist';
export * from './output/bom';
export * from './output/svg';
