/**
 * Ponto de entrada público do motor. Tudo que o CLI (S6) e a UI (Fase 5)
 * consomem passa por aqui; módulos internos não são importados diretamente.
 */

export * from './types';
export * from './units';
export { layoutStuds } from './rules/studs';
export { layoutPlates, type PlateCut, type PlateEndLap, type PlateOptions } from './rules/plates';
export {
  LADDER_BLOCK_SPACING,
  MIN_BLOCK_LENGTH,
  backerStuds,
  cornerStuds,
  ladderBlockCenters,
  ladderBlocks,
  plateOptionsFor,
  teeConflicts,
  teeStrips,
  type JointStud,
  type TeeStrip,
} from './rules/corners';
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
export { DEFAULT_ROUGH_OFFSET, resolveOpening, resolveOpenings } from './rules/catalog';
export { panelizeWall, planOpenings, type OpeningPlan } from './panelize/panelizeWall';
export { panelId, splitWall } from './panelize/splitWall';
export {
  breakCandidates,
  chooseBreaks,
  lapEnd,
  layoutMarks,
  memberSpan,
  splicePlates,
  validatePanelConfig,
  type BreakContext,
  type BreakOptions,
  type LapObstacle,
} from './rules/split';
export { ENGINEERED_PCF, POUNDS_PER_FOOT, memberWeightLb, panelWeight, poundsPerFoot } from './rules/weight';
export * from './house/types';
export {
  DEFAULT_TOLERANCE,
  findConnections,
  type Connection,
  type TeeOn,
  type WallConnections,
} from './house/connections';
export { frameWalls, type FrameConnections, type TeeAt, type WallFrame } from './house/frame';
export { panelizeFrame, panelizeHouse, type HouseResult } from './house/panelizeHouse';
export { validatePanel } from './panelize/validate';
export * from './output/cutlist';
export * from './output/bom';
export * from './output/svg';
export * from './output/planSvg';
