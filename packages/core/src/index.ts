/**
 * Ponto de entrada público do motor. Tudo que o CLI (S6) e a UI (Fase 5)
 * consomem passa por aqui; módulos internos não são importados diretamente.
 */

export * from './types';
export * from './units';
export { EPS, LENGTH_EPS, isCount } from './eps';
export { overlaps, span, type Span } from './geom';
export {
  ENGINE_ERROR_CODES,
  EngineError,
  engineErrorMessagePt,
  engineerReasonPt,
  locusPt,
  noticeOf,
  WARNING_CODES,
  warningMessagePt,
  type EngineErrorCode,
  type EngineerReason,
  type EngineNotice,
  type HypothesisId,
  type MessageParams,
  type MessageWhere,
  type ParamValue,
  type WarningCode,
} from './messages';
export { layoutMarks, layoutStuds } from './rules/studs';
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
  type RequiresEngineer,
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
export { panelizeWall, planOpenings, resolveHeaders, type OpeningPlan } from './panelize/panelizeWall';
export { panelId, splitWall, wallBreakCandidates } from './panelize/splitWall';
export {
  breakCandidates,
  chooseBreaks,
  forcedBreaks,
  validatePanelConfig,
  whyNotBreak,
  type BreakContext,
  type BreakOptions,
  type BreakRejection,
  type ForcedBreakOptions,
} from './rules/breaks';
export { lapEnd, type LapObstacle } from './rules/laps';
export { splicePlates, supportCenters } from './rules/splice';
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
// Geometria do eixo exposta para o editor de paredes do app (S21) desenhar com as mesmas regras do motor.
export { across, along, axisOf, crossing, pointAt, type Axis } from './house/axis';
export { panelizeFrame, panelizeHouse, type HouseResult } from './house/panelizeHouse';
export { validatePanel } from './panelize/validate';
export * from './output/cutlist';
export * from './output/bom';
export * from './output/svg';
export * from './output/planSvg';
