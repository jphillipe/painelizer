/**
 * Frases em inglês para todo código que chega à tela (S26): avisos e erros do motor (`packages/core`), do parser e
 * do build do CLI, da leitura (`packages/extract`) e dos adaptadores do Supabase. Montadas só do código, dos ids e
 * dos parâmetros — nunca do texto em português, que fica intacto para "Details".
 *
 * Aviso lido de arquivo de antes da S26 (texto legado) chega sem parâmetros: a frase cai para a genérica do
 * código (`FALLBACK`), nunca para "undefined".
 */

type P = Readonly<Record<string, unknown>>;

/** Onde a mensagem aponta. */
export interface MessageTarget {
  code: string;
  wallId?: string | undefined;
  openingId?: string | undefined;
  panelId?: string | undefined;
  path?: string | undefined;
  params?: P | undefined;
}

type Template = (p: P, t: MessageTarget) => string;

const inch = (v: unknown): string => `${String(v)}"`;
/** "a, b, c and 4 more": `total` = quantos existem quando a lista já veio cortada (o extract manda os 8 primeiros). */
const list = (v: unknown, max = 10, total?: unknown): string => {
  if (!Array.isArray(v)) return String(v);
  const all = typeof total === 'number' && total > v.length ? total : v.length;
  const shown = v.slice(0, max);
  return `${shown.join(', ')}${all > shown.length ? ` and ${all - shown.length} more` : ''}`;
};
const ord = (v: unknown): string => (typeof v === 'number' ? String(v + 1) : String(v));

/** "Wall W01, opening J1: …" / "Wall W01: …" / "Opening J1: …" / "…" com maiúscula. */
function at(t: MessageTarget, body: string): string {
  const parts: string[] = [];
  if (t.wallId !== undefined) parts.push(`Wall ${t.wallId}`);
  if (t.openingId !== undefined) parts.push(parts.length === 0 ? `Opening ${t.openingId}` : `opening ${t.openingId}`);
  if (parts.length === 0) return body.charAt(0).toUpperCase() + body.slice(1);
  return `${parts.join(', ')}: ${body}`;
}
const wallOnly = (t: MessageTarget): MessageTarget => ({ code: t.code, wallId: t.wallId });
const openingOnly = (t: MessageTarget): MessageTarget => ({ code: t.code, openingId: t.openingId });

/** Motivo estruturado de "exige engenheiro" (core `EngineerReason`). */
function engineerReason(p: P): string {
  switch (p['why']) {
    case 'noTable':
      return `no header table for ${p['exterior'] === true ? 'exterior' : 'interior'} walls`;
    case 'width':
      return `building width ${inch(p['width'])}${p['snow'] === undefined ? '' : ` with ${String(p['snow'])} psf snow`} is outside table ${String(p['table'])}`;
    case 'floors':
      return `${String(p['floors'])} floor(s)${p['floorSpan'] === undefined ? '' : ` (${String(p['floorSpan'])} span)`} not in table ${String(p['table'])}`;
    case 'span':
      return `a ${inch(p['span'])} span is above every header in table ${String(p['table'])}${p['wallSection'] === undefined ? '' : ` that fits a ${String(p['wallSection'])} wall`}`;
    case 'wind':
      return `${String(p['windSpeed'])} mph, exposure ${String(p['exposure'])}, is outside table ${String(p['table'])}`;
    case 'kingSpan':
      return `a ${inch(p['span'])} span is above the last row of table ${String(p['table'])}`;
    default:
      return 'outside the table';
  }
}

/** Avisos do motor (`WARNING_CODES` do core). */
const ENGINE_WARNINGS: Record<string, Template> = {
  STUD_LENGTH_MISMATCH: (p, t) =>
    at(wallOnly(t), `wall height ${inch(p['height'])} minus 3 plates of ${inch(p['plateThickness'])} needs a ${inch(p['studLength'])} stud, which is not one of the precut lengths (${Array.isArray(p['precuts']) ? p['precuts'].map(inch).join(', ') : ''}).`),
  HEADER_JACKS_BELOW_TABLE: (p, t) =>
    p['reason'] === 'neighbor'
      ? at(t, `1 jack stud per side instead of ${String(p['wanted'])} — only ${inch(p['gap'])} to the rough opening of ${String(p['neighborId'])}.`)
      : at(t, `${String(p['jacks'])} jack stud(s) per side, but table ${String(p['table'])} asks for ${String(p['tableJacks'])} for a ${String(p['plies'])}-${String(p['section'])} header over ${inch(p['span'])}.`),
  HEADER_KINGS_BELOW_TABLE: (p, t) =>
    p['reason'] === 'shared'
      ? at(wallOnly(t), `openings ${String(p['prevId'])} and ${String(t.openingId)} share ${String(p['used'])} king stud(s) instead of ${String(p['wanted'])} — only ${inch(p['gap'])} between the rough openings.`)
      : at(t, `${String(p['kings'])} king stud(s) per side, but table ${String(p['table'])} asks for ${String(p['tableKings'])} for a ${inch(p['span'])} span at ${String(p['windSpeed'])} mph, exposure ${String(p['exposure'])}.`),
  OPENING_NUDGED: (p, t) =>
    at(
      t,
      `moved ${inch(p['distance'])} to the ${p['direction'] === 'left' ? 'left' : 'right'} (rough opening edge from ${String(p['from'])} to ${String(p['to'])}) — it touched ` +
        `${p['touched'] === 'start' ? 'the start of the wall' : p['touched'] === 'end' ? 'the end of the wall' : `wall ${String(p['teeWallId'] ?? '?')} at a tee`}. Check the reading.`,
    ),
  WIND_SPEED_MISSING: (_p, t) => at(t, 'exterior wall without a wind speed — king studs are not checked against table R602.7.5; the panel uses 1 king per side.'),
  SPECIES_NOT_IN_TABLE: (p, t) => at(t, `header from table ${String(p['table'])}, which is for SPF No. 2; the project specifies ${String(p['species'])}.`),
  DOOR_RO_HEIGHT_MISMATCH: (p, t) =>
    at(openingOnly(t), `the door rough opening is ${inch(p['roughHeight'])} tall (from the subfloor) but the header sits at ${inch(p['headerBase'])}.`),
  OPENING_AT_TEE: (p, t) =>
    at(
      wallOnly(t),
      `wall ${String(p['teeWallId'])} meets it in a tee at x=${String(p['x'])} (${String(p['lo'])}–${String(p['hi'])}), in the zone of opening(s) ${list(p['openingIds'])} ` +
        `[${String(p['start'])}, ${String(p['end'])}] — king/jack studs and the ladder blocking want the same spot.`,
    ),
  OPENING_NEAR_CORNER: (p, t) => at(t, `the king stud is ${inch(p['gap'])} from the ${p['end'] === 'start' ? 'start' : 'end'} of the wall — the end stud does not fit (minimum ${inch(p['min'])}).`),
  STUDS_OVERLAP: (p, t) => at(wallOnly(t), `${String(p['aRole'])} at x=${String(p['aX'])} and ${String(p['bRole'])} at x=${String(p['bX'])} overlap by ${inch(p['overlap'])}.`),
  STUD_HEIGHT_ABOVE_LIMIT: (p, t) =>
    at(wallOnly(t), `${inch(p['studLength'])} studs exceed the ${inch(p['limit'])} limit for a ${p['bearing'] === true ? 'bearing' : 'non-bearing'} ${String(p['section'])} wall (table R602.3(5)) — needs a structural design.`),
  FIRE_BLOCKING_REQUIRED: (p, t) =>
    at(wallOnly(t), `a continuous ${inch(p['cavity'])} cavity exceeds ${inch(p['limit'])} — horizontal fire blocking is required (R302.11); the panel does not draw it yet.`),
  PANEL_OVERWEIGHT: (p) => `Panel ${String(p['panelId'])}: estimated ${String(p['weight'])} lb is over the ${String(p['max'])} lb limit, and no break fixes it.`,
};

/** Erros do motor (`ENGINE_ERROR_CODES` do core). */
const ENGINE_ERRORS: Record<string, Template> = {
  WALL_POINT_NOT_FINITE: (p, t) => at(t, `${String(p['end'])} needs finite x and y (got ${String(p['x'])}, ${String(p['y'])}).`),
  WALL_ZERO_LENGTH: (p, t) => at(t, `start and end are the same point (${String(p['x'])}, ${String(p['y'])}).`),
  WALL_OFF_AXIS: (p, t) => at(t, `not parallel to the x or y axis (from ${String(p['x0'])}, ${String(p['y0'])} to ${String(p['x1'])}, ${String(p['y1'])}).`),
  WALL_DUPLICATE_ID: (_p, t) => at(t, 'duplicate wall id.'),
  WALL_END_TWO_JOINTS: (p, t) =>
    at(t, `the ${String(p['end'])} end meets two walls (${String(p['first'])} and ${String(p['second'])}) — three ends at one point, or a corner and a tee at the same spot.`),
  WALLS_CROSS: (p, t) => `Walls ${String(t.wallId)} and ${String(p['otherWallId'])} cross at (${String(p['x'])}, ${String(p['y'])}) — split one of them at the crossing.`,
  WALLS_OVERLAP: (p, t) => `Walls ${String(t.wallId)} and ${String(p['otherWallId'])} overlap by ${inch(p['overlap'])} — is it the same wall twice?`,
  CORNER_ENDS_CONFLICT: (p, t) =>
    `Walls ${String(t.wallId)} (${String(p['end'])}) and ${String(p['otherWallId'])} (${String(p['otherEnd'])}) both declare ends "${String(p['rule'])}" at the same corner.`,
  PLATE_NO_LENGTH: (p, t) => at(t, `the plate has no length (${inch(p['length'])}) — the walls at its ends take it all.`),
  OPENING_OFF_PLATE: (p, t) =>
    at(t, `the rough opening from ${inch(p['from'])} to ${inch(p['to'])} (measured from start) does not fit on the plate (${inch(p['s0'])} to ${inch(p['s1'])}).`),
  OPENING_TAG_UNKNOWN: (p, t) => at(t, `type "${String(p['tag'])}" is not in the opening schedule.`),
  OPENING_TYPE_MISSING: (_p, t) => at(t, 'window or door? It has no type and no schedule tag.'),
  OPENING_SIZE_MISSING: (_p, t) => at(t, 'no rough opening size and no schedule tag.'),
  OPENING_POSITION_MISSING: (_p, t) => at(t, 'no position (center or left edge).'),
  HEADER_MARK_UNKNOWN: (p, t) => at(t, `header "${String(p['mark'])}" is not in the header schedule.`),
  OPENING_NOT_FINITE: (_p, t) => at(t, 'the measurements must be numbers.'),
  OPENING_SIZE_INVALID: (_p, t) => at(t, 'the rough opening needs a width and a height above 0.'),
  OPENING_OUT_OF_WALL: (p, t) => at(t, `with its king and jack studs it spans [${String(p['start'])}, ${String(p['end'])}], past the ${inch(p['length'])} wall.`),
  OPENINGS_TOO_CLOSE: (p, t) =>
    at(
      wallOnly(t),
      `openings ${String(p['prevId'])} and ${String(t.openingId)} are ${inch(p['gap'])} apart — not enough for jack studs and a shared king (minimum ${inch(p['needed'])})` +
        (p['fit'] === true ? `; not even 1 jack + 1 king + 1 jack (${inch(p['min3'])}) fits. Check both positions and rough openings.` : '.'),
    ),
  HEADER_ABOVE_TOP_PLATE: (p, t) =>
    at(t, `a ${String(p['section'])} header based at ${inch(p['base'])} reaches ${inch(p['top'])}, above the top plate (${inch(p['topPlate'])}).`),
  HEADER_NO_ROOM_FOR_JACK: (p, t) => at(t, `the header base at ${inch(p['base'])} leaves no room for a jack stud on the bottom plate (top at ${inch(p['plateTop'])}).`),
  SILL_NO_ROOM: (p, t) =>
    at(t, `the rough opening base at ${inch(p['roBase'])} leaves no room for the ${p['double'] === true ? 'double ' : ''}sill on the bottom plate (top at ${inch(p['plateTop'])}).`),
  HEADER_SECTION_UNKNOWN: (p, t) => at(t, `unknown header section (${String(p['section'])}).`),
  HEADER_TOO_THICK: (p, t) =>
    at(t, `the project header (${String(p['plies'])} plies of ${String(p['section'])}, ${inch(p['thickness'])}) is thicker than the ${String(p['wallSection'])} wall (${inch(p['depth'])}).`),
  FLAT_HEADER_SPAN: (p, t) =>
    at(t, `non-bearing wall with a ${inch(p['span'])} rough opening — a flat header (R602.7.4) only covers up to ${inch(p['max'])}; specify the header.`),
  FLAT_HEADER_GAP: (p, t) =>
    at(t, `the flat header (R602.7.4) tops out at ${inch(p['top'])}, ${inch(p['gap'])} below the top plate (${inch(p['topPlate'])}) — over the ${inch(p['max'])} limit; specify the header.`),
  HEADER_DATA_MISSING: (p, t) =>
    at(
      t,
      p['missing'] === 'floorsSupported'
        ? 'bearing wall with no header in the project and no floors above set — the IRC header table cannot be used.'
        : 'bearing wall with no header in the project and no snow load / building width — the IRC header table cannot be used.',
    ),
  HEADER_OUT_OF_TABLE: (p, t) => at(t, `header outside the IRC table (${engineerReason(p)}) — an engineer has to size it; specify the opening's header.`),
  HEADER_TABLE_NOT_APPLICABLE: (_p, t) => at(t, 'the IRC header table does not apply here.'),
  KINGS_OUT_OF_TABLE: (p, t) => at(t, `king studs outside table R602.7.5 (${engineerReason(p)}) — needs an engineer; set the king studs on the opening.`),
  SNOW_LOAD_REQUIRED: (_p, t) => at(t, 'the ground snow load is required for an exterior bearing wall.'),
  CORNER_STUD_OFF_PLATE: (p, t) => at(t, `the corner stud at x=${String(p['x'])} does not fit on the ${inch(p['length'])} plate.`),
  TEE_IN_OPENING: (p, t) =>
    at(t, `wall ${String(p['teeWallId'])} meets it in a tee at x=${String(p['x'])} (${String(p['lo'])}–${String(p['hi'])}), inside the rough opening [${String(p['from'])}, ${String(p['to'])}].`),
  TEE_WITHOUT_STUD: (p, t) => at(t, `the tee strip ${String(p['lo'])}–${String(p['hi'])} has no stud on one side — nowhere to hold the ladder.`),
  EXTRA_STUD_INVALID: (p, t) =>
    at(t, `extra stud #${ord(p['index'])}: ${p['field'] === 'x' ? 'x must be a number' : 'count must be a whole number ≥ 1'} (got ${String(p['value'])}).`),
  EXTRA_STUD_OUT_OF_WALL: (p, t) => at(t, `extra stud #${ord(p['index'])}: ${String(p['count'])} stud(s) from x=${String(p['x'])} run past the ${inch(p['length'])} wall.`),
  EXTRA_STUD_IN_OPENING: (p, t) =>
    at(t, `extra stud #${ord(p['index'])}: the stud at x=${String(p['x'])} falls in the opening zone [${String(p['start'])}, ${String(p['end'])}] — extra studs stay clear of kings, jacks and the rough opening.`),
  CANNOT_SPLIT: (p, t) =>
    at(
      wallOnly(t),
      `cannot split ${inch(p['length'])} into panels of at most ${inch(p['maxLength'])}${p['maxWeight'] === undefined ? '' : ` / ${String(p['maxWeight'])} lb`} — no free layout stud between x=${String(p['from'])} and x=${String(p['to'])}.`,
    ),
  LAP_NO_ROOM: (p, t) =>
    at(
      wallOnly(t),
      `no room for the double top plate lap after the break at x=${String(p['at'])}: ` +
        (p['blocker'] === undefined
          ? `the next panel ends at x=${String(p['limit'])} and not even the ${inch(p['minLap'])} minimum fits.`
          : `${p['blocker'] === 'header' ? `the header at x=${String(p['blockerX'])}` : `the tee strip${p['teeWallId'] === undefined ? '' : ` of wall ${String(p['teeWallId'])}`}`} takes ${String(p['lo'])}–${String(p['hi'])} and there is no free mark up to x=${String(p['limit'])}.`),
    ),
  SPLICE_NO_STUD: (p, t) =>
    at(
      wallOnly(t),
      `${String(p['role'])} of ${inch(p['memberLength'])}: no stud between x=${String(p['from'])} and x=${String(p['to'])} to splice the plate ${inch(p['min'])} away from the other splices (longest stock ${inch(p['maxStock'])}).`,
    ),
  PANEL_MIN_LAP_ABOVE_LAP: (p) => `Project settings: the minimum lap (${inch(p['minLap'])}) is larger than the lap (${inch(p['lap'])}).`,
  PRECUTS_EMPTY: () => 'Project settings: the precut stud list is empty.',
  STOCK_EMPTY: () => 'Project settings: the stock length list is empty.',
  STOCK_INVALID: (p) => `Project settings: invalid stock length (${String(p['value'])}).`,
  PIECE_OVER_STOCK: (p) => `Material list: a ${inch(p['length'])} piece is longer than any stock length (longest ${inch(p['max'])}).`,
  VALUE_NOT_POSITIVE: (p, t) => at(t, `${String(p['field'])} must be greater than 0 (got ${String(p['value'])}).`),
  VALUE_NOT_COUNT: (p, t) => at(t, `${String(p['field'])} must be a whole number ≥ 1 (got ${String(p['value'])}).`),
  VALUE_INVALID: (p, t) => at(t, `invalid ${String(p['field'])} (${String(p['value'])}).`),
  CONFIG_INVALID: (p) => `Project settings: invalid ${String(p['field'])} (${String(p['value'])}); expected ${p['expected'] === 'weight' ? 'a weight in lb' : 'a measurement'} above 0.`,
};

/** Build e parser do CLI (`cli/build`, `cli/project`). */
const CLI: Record<string, Template> = {
  PANEL_FILE_CLASH: (p) => `Panels "${String(p['first'])}" and "${String(p['second'])}" would write the same file, ${String(p['file'])}.`,
  ENGINE_INTERNAL: (_p, t) => at(t, 'the engine rejected this (internal check). See Details for the engine message.'),
  PROJECT_INVALID: (p, t) => `The project file has an invalid value at ${String(p['path'] ?? t.path ?? 'the root')}.`,
  PROJECT_JSON_INVALID: () => 'The project file is not valid JSON.',
};

/** Avisos e problemas da leitura (`EXTRACT_WARNING_CODES`/`EXTRACT_PROBLEM_CODES` do extract). */
const EXTRACT: Record<string, Template> = {
  OPENING_UNPLACED: (p, t) =>
    at(t, `the AI found this ${p['tag'] === undefined ? String(p['type'] ?? 'opening') : `${String(p['tag'])} opening`} but no dimension to its axis — the wall panels come out without it.`),
  OPENING_UNSIZED: (_p, t) => at(t, 'the AI found an opening with no schedule tag and no rough opening size — the wall panels come out without it.'),
  DOOR_RO_HEIGHT_ASSUMED: (p, t) =>
    at(t, `the reading gave the door's rough opening width (${String(p['roughWidth'])}) but not its height — it runs from the subfloor to the header, ${String(p['headerHeight'])} (P4).`),
  OPENING_ESTIMATED: (p, t) => at(t, `position measured on the drawing by scale, with no dimension (confidence ${String(p['confidence'])}) — check it on the plan.`),
  ROOM_WITHOUT_DOOR: (p) => `Room "${String(p['room'])}"${p['level'] === undefined ? '' : ` (floor ${String(p['level'])})`}: no door found — check the plan and add the opening on the right wall.`,
  DEFAULT_HEADER_HEIGHT: (p) =>
    `${String(p['count'])} opening(s) without a height use the factory top of rough opening, ${String(p['height'])} from the subfloor (P2): ${list(p['openingIds'])}.`,
  TILES_DROPPED: (p) => `${String(p['count'])} high-resolution crop(s) were left out so the request fits ${String(p['limitMb'])} MB: ${list(p['tiles'], 8, p['count'])}.`,
  SHEETS_DROPPED: (p) => `${String(p['count'])} useful sheet(s) did not fit the budget of ${String(p['pageBudget'])} pages / ${String(p['mbBudget'])} MB: ${list(p['sheets'], 12, p['count'])}.`,
  SHEET_DUPLICATE: (p) => `${String(p['count'])} duplicate sheet(s) left out because the same sheet went from another page: ${list(p['sheets'], 8, p['count'])}.`,
  NO_TITLE_BLOCK: (p) => `No sheet number was found in any title block; the first ${String(p['pages'])} page(s) of each PDF went as plans, without high-res crops.`,
  WALL_HEIGHT_MISSING: (p) =>
    `The drawings have no sections or ceiling height: ${String(p['count'])} wall(s) without a height (${list(p['wallIds'], 5, p['count'])}). Type the wall height (subfloor to the top of the double top plate).`,
};

/** Erros da leitura (`EXTRACT_ERROR_CODES` do extract). */
const EXTRACT_ERRORS: Record<string, Template> = {
  NO_SOURCES: () => 'Add at least one PDF or image.',
  NO_PAGES_REQUESTED: (p) => `${String(p['file'])}: no pages were picked.`,
  NO_USEFUL_SHEETS: () => 'No useful sheet (plan, schedule, elevation, section, structural) was recognized in the files. Pick the pages.',
  REQUEST_TOO_LARGE: (p) => `The chosen sheets add up to ${String(p['mb'])} MB encoded, over the API limit of ${String(p['limitMb'])} MB. Send fewer files or pick the pages.`,
  PAGE_OUT_OF_RANGE: (p) => `Page ${String(p['page'])} is not in the PDF (it has ${String(p['pages'])} pages).`,
  RESPONSE_NOT_JSON: () => 'The AI response is not valid JSON. Try again.',
  MODEL_REFUSED: () => 'The model declined to read these drawings.',
  OUTPUT_TRUNCATED: (p) => `The response was cut at ${String(p['maxTokens'])} output tokens${p['atMax'] === true ? ' (already the maximum)' : ''}. Send fewer sheets or lower the effort.`,
  CONTEXT_EXCEEDED: () => "The sheets exceed the model's context window. Send fewer sheets or pick the pages.",
  PAUSE_TURN: () => 'The API paused the response before the end. Try again.',
  TOOL_USE: () => 'The model asked for a tool this call does not offer. Try again.',
  NO_STOP_REASON: () => 'The response ended without a stop reason. Try again.',
  UNKNOWN_STOP_REASON: (p) => `The response stopped for an unknown reason (${String(p['reason'])}). Try again.`,
  SCHEMA_MISMATCH: () => 'The AI response does not match the expected format. Try again.',
};

/** Adaptadores do Supabase (`lib/supabase/*`). */
const ADAPTERS: Record<string, Template> = {
  INSERT_NO_ROW: () => 'The database did not return the saved project.',
  DOWNLOAD_NO_DATA: () => 'The drawing could not be downloaded from storage.',
  DB_ERROR: () => 'The database refused the request.',
  STORAGE_ERROR: () => 'The file storage refused the request.',
};

/** Frase genérica por código, para avisos sem parâmetros (arquivos de antes da S26). */
const FALLBACK: Record<string, string> = {
  OPENING_UNPLACED: 'The AI found this opening but no dimension to its axis — the wall panels come out without it.',
  OPENING_UNSIZED: 'The AI found an opening with no schedule tag and no rough opening size — the wall panels come out without it.',
  DOOR_RO_HEIGHT_ASSUMED: "The reading gave the door's rough opening width but not its height; it runs from the subfloor to the header (P4).",
  OPENING_ESTIMATED: 'Position measured on the drawing by scale, with no dimension — check it on the plan.',
  ROOM_WITHOUT_DOOR: 'A room in the reading has no door — check the plan and add the opening on the right wall.',
  DEFAULT_HEADER_HEIGHT: 'Openings without a height use the factory top of rough opening (P2).',
  TILES_DROPPED: 'Some high-resolution crops were left out so the request would fit the API size limit.',
  SHEETS_DROPPED: 'Some useful sheets did not fit the page budget of the reading.',
  SHEET_DUPLICATE: 'Duplicate sheets were left out of the reading.',
  NO_TITLE_BLOCK: 'No sheet number was found in any title block; the first pages of each PDF went as plans.',
  WALL_HEIGHT_MISSING: 'The drawings have no sections or ceiling height. Type the wall height.',
  ENGINE_INTERNAL: 'The engine rejected this (internal check). See Details for the engine message.',
  PROJECT_INVALID: 'The project file has an invalid value.',
};

const ALL: Record<string, Template> = { ...ENGINE_WARNINGS, ...ENGINE_ERRORS, ...CLI, ...EXTRACT, ...EXTRACT_ERRORS, ...ADAPTERS };

/** Códigos que têm frase em inglês (o teste confere contra as listas do core, do extract e dos adaptadores). */
export const ENGLISH_CODES: ReadonlySet<string> = new Set(Object.keys(ALL));

/** Frase em inglês do aviso/problema; `undefined` só para código desconhecido. */
export function englishMessage(t: MessageTarget): string | undefined {
  const template = ALL[t.code];
  if (template === undefined) return undefined;
  const params = t.params ?? {};
  if (Object.keys(params).length === 0 && FALLBACK[t.code] !== undefined) return withPlace(t, FALLBACK[t.code]!);
  let out: string;
  try {
    out = template(params, t);
  } catch {
    out = '';
  }
  if (out === '' || /\bundefined\b/.test(out)) return FALLBACK[t.code] === undefined ? withPlace(t, humanize(t.code)) : withPlace(t, FALLBACK[t.code]!);
  return out;
}

/** Frase genérica com a parede/abertura na frente, quando há. */
function withPlace(t: MessageTarget, sentence: string): string {
  if (t.wallId === undefined && t.openingId === undefined) return sentence;
  return at(t, sentence.charAt(0).toLowerCase() + sentence.slice(1));
}

/** `HEADER_OUT_OF_TABLE` → "Header out of table". */
export function humanize(code: string): string {
  const words = code.toLowerCase().split('_').join(' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
}

/** Erro da leitura (código do extract) → frase; sem código, a genérica. */
export function extractErrorMessage(code: string | undefined, params: P = {}): string {
  const template = code === undefined ? undefined : EXTRACT_ERRORS[code];
  if (template === undefined) return 'The reading failed. See Details for the message from the reader.';
  return template(params, { code: code! });
}
