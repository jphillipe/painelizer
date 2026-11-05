/**
 * Grupos de issues (S21.4): a lista do editor mostra um item por família ("Wall height is missing · 30 walls")
 * em vez de uma linha por parede. A chave é o `kind` do próprio editor ou o código do motor/parser/leitura (S26:
 * todo aviso tem código; nada é reconhecido pelo texto). O título é inglês (mapa abaixo); o texto original de
 * cada issue fica intacto em `items` — nunca some, só vira detalhe (docs/10-design.md §3).
 */

import type { IdIndex, Issue, Severity } from './problems';

/** O que a interface oferece para resolver o grupo de uma vez. */
export type IssueAction = 'projectData' | 'projectSettings' | 'openWall';

export interface IssueGroup {
  key: string;
  severity: Severity;
  title: string;
  count: number;
  /** Paredes citadas, sem repetir, na ordem em que aparecem. */
  wallIds: string[];
  openingIds: string[];
  items: Issue[];
  action?: IssueAction;
}

/** Títulos em inglês por `kind` (editor), código da extração ou código do motor. */
export const ISSUE_TITLES: Readonly<Record<string, string>> = {
  // editor (draftIssues / geometryIssues)
  'wall.height': 'Wall height is missing',
  'wall.section': 'Section (2x4 or 2x6) is missing',
  'wall.exterior': 'Exterior / interior is not set',
  'wall.bearing': 'Bearing / non-bearing is not set',
  'wall.wallType': 'Wall type is not in the project wall types',
  'wall.length': 'Wall length is missing',
  'wall.ends': 'Wall needs both start and end',
  'wall.planLength': 'A wall in plan has no length',
  'wall.planLayoutOrigin': 'A wall in plan has no layout origin',
  'wall.duplicateId': 'Duplicate wall id',
  'wall.noAxis': 'Wall is not parallel to an axis',
  'plan.open': 'The plan does not close',
  'walls.mixed': 'Walls mix plan and length formats',
  'walls.empty': 'The project has no walls',
  'opening.position': 'Opening position is missing',
  'opening.size': 'Rough opening size is missing',
  'opening.type': 'Window or door is not set',
  'opening.tag': 'Opening tag is not in the schedule',
  'opening.headerMark': 'Header mark is not in the schedule',
  'opening.duplicateId': 'Duplicate opening id',
  'config.studSpacing': 'Stud spacing is missing',
  'config.studLength': 'Precut stud lengths are missing',
  'config.building': 'Snow load and building width are missing (IRC header table)',
  'wall.floorsSupported': 'Floors above the wall are missing (IRC header table)',
  // extração (packages/extract)
  OPENING_UNPLACED: 'Opening position not found in the drawing',
  OPENING_UNSIZED: 'Opening size not found in the drawing',
  DEFAULT_HEADER_HEIGHT: 'Default header height used',
  DOOR_RO_HEIGHT_ASSUMED: 'Door RO height assumed',
  SHEETS_DROPPED: 'Sheets left out of the reading',
  OPENING_ESTIMATED: 'Opening position measured by scale (no dimension)',
  ROOM_WITHOUT_DOOR: 'Room without a door in the reading',
  TILES_DROPPED: 'High-res crops left out of the reading',
  SHEET_DUPLICATE: 'Duplicate sheet left out of the reading',
  NO_TITLE_BLOCK: 'No sheet numbers found: first pages sent',
  // motor (packages/core)
  HEADER_JACKS_BELOW_TABLE: 'Fewer jack studs than the IRC table',
  HEADER_KINGS_BELOW_TABLE: 'Fewer king studs than the IRC table',
  OPENING_NEAR_CORNER: 'Opening too close to a corner',
  OPENING_AT_TEE: 'Opening at a tee',
  OPENING_NUDGED: 'Opening moved to clear a stud',
  PANEL_OVERWEIGHT: 'Panel over the weight limit',
  STUD_LENGTH_MISMATCH: 'Stud length not in the precut list',
  STUD_HEIGHT_ABOVE_LIMIT: 'Stud height above the IRC limit',
  STUDS_OVERLAP: 'Studs overlap',
  DOOR_RO_HEIGHT_MISMATCH: 'Door RO height differs from the header height',
  SPECIES_NOT_IN_TABLE: 'Species not covered by the IRC table',
  WIND_SPEED_MISSING: 'Wind speed is missing (king stud table)',
  WALL_TYPE_MISMATCH: 'Wall differs from its wall type',
  BLOCKING_SKIPPED: 'Blocking row skipped at an opening, tee or other row',
  // motor (packages/core) — erros que um projeto provoca; o CLI e o parser
  HEADER_DATA_MISSING: 'Bearing wall needs snow load and building width (IRC header table)',
  HEADER_OUT_OF_TABLE: 'Header outside the IRC table — engineer required',
  KINGS_OUT_OF_TABLE: 'King studs outside the IRC table — engineer required',
  OPENING_OFF_PLATE: 'Opening does not fit on the plate',
  OPENING_OUT_OF_WALL: 'Opening runs past the end of the wall',
  CORNER_STUD_OFF_PLATE: 'Corner stud does not fit on the plate',
  FLAT_HEADER_SPAN: 'Opening too wide for a flat header',
  FLAT_HEADER_GAP: 'Flat header too far below the top plate',
  HEADER_TOO_THICK: 'Project header thicker than the wall',
  HEADER_ABOVE_TOP_PLATE: 'Header above the top plate',
  HEADER_NO_ROOM_FOR_JACK: 'No room for the jack stud',
  SILL_NO_ROOM: 'No room for the sill',
  OPENINGS_TOO_CLOSE: 'Openings too close together',
  OPENING_TAG_UNKNOWN: 'Opening tag is not in the schedule',
  HEADER_MARK_UNKNOWN: 'Header mark is not in the schedule',
  OPENING_TYPE_MISSING: 'Window or door is not set',
  OPENING_SIZE_MISSING: 'Rough opening size is missing',
  OPENING_POSITION_MISSING: 'Opening position is missing',
  WALLS_CROSS: 'Two walls cross',
  WALLS_OVERLAP: 'Two walls overlap',
  WALL_END_TWO_JOINTS: 'A wall end meets two walls',
  CORNER_ENDS_CONFLICT: 'Both walls claim the same corner',
  WALL_OFF_AXIS: 'Wall is not parallel to an axis',
  WALL_ZERO_LENGTH: 'Wall start and end are the same point',
  TEE_IN_OPENING: 'A tee lands inside an opening',
  TEE_WITHOUT_STUD: 'Tee without a stud on one side',
  CANNOT_SPLIT: 'Wall cannot be split into panels',
  PANEL_BREAK_INVALID: 'Panel break in a place the wall cannot split',
  PANEL_TOO_LONG: 'Panel longer than the limit',
  LAP_NO_ROOM: 'No room for the double top plate lap',
  SPLICE_NO_STUD: 'No stud to splice the plate',
  EXTRA_STUD_IN_OPENING: 'Extra stud inside an opening',
  EXTRA_STUD_OUT_OF_WALL: 'Extra stud outside the wall',
  POST_INVALID: 'Post without a position or size',
  POST_DEPTH_MISMATCH: 'Post does not match the wall depth',
  POST_OUT_OF_WALL: 'Post outside the wall',
  POST_IN_OPENING: 'Post inside an opening',
  POST_OVERLAP: 'Post on another full-height stud',
  BLOCKING_PRESET_UNKNOWN: 'Blocking preset not found',
  BLOCKING_ROW_INVALID: 'Blocking row outside the wall or between-plates range',
  PIECE_OVER_STOCK: 'Piece longer than any stock length',
  PANEL_FILE_CLASH: 'Two panels would write the same file',
  PROJECT_INVALID: 'Invalid value in the project file',
  PROJECT_JSON_INVALID: 'The project file is not valid JSON',
  ENGINE_INTERNAL: 'The engine rejected the project',
};

const ISSUE_ACTIONS: Readonly<Record<string, IssueAction>> = {
  'wall.height': 'projectData',
  'config.studLength': 'projectData',
  'config.building': 'projectData',
  'wall.floorsSupported': 'projectData',
  'config.studSpacing': 'projectSettings',
  WIND_SPEED_MISSING: 'projectSettings',
  SPECIES_NOT_IN_TABLE: 'projectSettings',
};

function actionFor(issue: Issue): IssueAction | undefined {
  return ISSUE_ACTIONS[issue.kind ?? issue.code ?? ''];
}

/**
 * Chave do grupo: a família do editor ou o código. Sem nenhum dos dois (só o editor cria issue assim, e já em
 * inglês), o próprio texto.
 */
export function groupKey(issue: Issue, _ids?: IdIndex): string {
  return issue.kind ?? issue.code ?? `${issue.severity}:${issue.text}`;
}

function humanize(code: string): string {
  const words = code.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Título do grupo: mapa por chave; sem mapa, o código humanizado; sem código, a frase da issue (do editor, em inglês). */
export function groupTitle(issue: Issue, _ids?: IdIndex): string {
  const mapped = ISSUE_TITLES[issue.kind ?? issue.code ?? ''];
  if (mapped !== undefined) return mapped;
  if (issue.code !== undefined) return humanize(issue.code);
  return issue.text;
}

/** Problemas antes de avisos; dentro de cada severidade, grupos maiores primeiro, empate pela ordem de chegada. */
export function groupIssues(issues: readonly Issue[], ids: IdIndex): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const key = groupKey(issue, ids);
    let g = groups.get(key);
    if (g === undefined) {
      g = { key, severity: issue.severity, title: groupTitle(issue, ids), count: 0, wallIds: [], openingIds: [], items: [] };
      const action = actionFor(issue);
      if (action !== undefined) g.action = action;
      groups.set(key, g);
    }
    g.count += 1;
    g.items.push(issue);
    for (const w of [issue.wallId, ...(issue.alsoWalls ?? [])]) if (w !== undefined && !g.wallIds.includes(w)) g.wallIds.push(w);
    if (issue.openingId !== undefined && !g.openingIds.includes(issue.openingId)) g.openingIds.push(issue.openingId);
  }
  const list = [...groups.values()];
  for (const g of list) if (g.action === undefined && g.wallIds.length === 1 && g.count === 1) g.action = 'openWall';
  const rank = (s: Severity): number => (s === 'problem' ? 0 : 1);
  return list.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g.severity) - rank(b.g.severity) || b.g.count - a.g.count || a.i - b.i).map(({ g }) => g);
}

/** Famílias que o formulário de dados do projeto resolve (altura, precuts, estrutural). */
export const PROJECT_DATA_KINDS: ReadonlySet<string> = new Set(['wall.height', 'config.studLength', 'config.building', 'wall.floorsSupported']);

/** A leitura veio sem o que o desenho não traz (altura, precuts, dados do estrutural). */
export function needsProjectData(issues: readonly Issue[]): boolean {
  return issues.some((i) => i.kind !== undefined && PROJECT_DATA_KINDS.has(i.kind));
}

/**
 * Issues do motor que repetem uma família que o draft já apontou na mesma parede saem da lista: o humano vê uma
 * vez "Floors above the wall are missing", não duas (uma do editor, outra do motor).
 */
export function dropRepeated(engine: readonly Issue[], own: readonly Issue[]): Issue[] {
  return engine.filter((e) => e.kind === undefined || !own.some((o) => o.kind === e.kind && (o.wallId === e.wallId || o.wallId === undefined || e.wallId === undefined)));
}
