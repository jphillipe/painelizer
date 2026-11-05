/**
 * Códigos das mensagens do motor (S26). Avisos (`Warning`) e erros (`EngineError`) saem com código, ids de
 * parede/abertura e parâmetros; a frase em inglês (CLI, folha, "Details" do app) é montada aqui a partir deles — os
 * sites do motor não escrevem texto. O app monta a sua própria frase com os mesmos parâmetros
 * (`web/lib/messages.en.ts`). Todo texto que chega ao usuário é em inglês (P51 resolvida).
 *
 * Hipóteses (`P30`, `P39`, `P40`…) vão em `Warning.hypothesis`, fora da frase: a folha não leva "hipótese" para
 * a serra; o CLI acrescenta quando imprime.
 */

/** Os 13 avisos do motor. Nunca interrompem a geração. */
export const WARNING_CODES = [
  'STUD_LENGTH_MISMATCH',
  'HEADER_JACKS_BELOW_TABLE',
  'HEADER_KINGS_BELOW_TABLE',
  'OPENING_NUDGED',
  'WIND_SPEED_MISSING',
  'SPECIES_NOT_IN_TABLE',
  'DOOR_RO_HEIGHT_MISMATCH',
  'OPENING_AT_TEE',
  'OPENING_NEAR_CORNER',
  'STUDS_OVERLAP',
  'STUD_HEIGHT_ABOVE_LIMIT',
  'PANEL_OVERWEIGHT',
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

/** Erros do motor que um projeto pode provocar (dado do humano ou da leitura). Guardas internas seguem `RangeError`. */
export const ENGINE_ERROR_CODES = [
  // planta (house/)
  'WALL_POINT_NOT_FINITE',
  'WALL_ZERO_LENGTH',
  'WALL_OFF_AXIS',
  'WALL_DUPLICATE_ID',
  'WALL_END_TWO_JOINTS',
  'WALLS_CROSS',
  'WALLS_OVERLAP',
  'CORNER_ENDS_CONFLICT',
  'PLATE_NO_LENGTH',
  'OPENING_OFF_PLATE',
  // catálogo e aberturas
  'OPENING_TAG_UNKNOWN',
  'OPENING_TYPE_MISSING',
  'OPENING_SIZE_MISSING',
  'OPENING_POSITION_MISSING',
  'HEADER_MARK_UNKNOWN',
  'OPENING_NOT_FINITE',
  'OPENING_SIZE_INVALID',
  'OPENING_OUT_OF_WALL',
  'OPENINGS_TOO_CLOSE',
  'HEADER_ABOVE_TOP_PLATE',
  'HEADER_NO_ROOM_FOR_JACK',
  'SILL_NO_ROOM',
  // header e kings
  'HEADER_SECTION_UNKNOWN',
  'HEADER_TOO_THICK',
  'FLAT_HEADER_SPAN',
  'FLAT_HEADER_GAP',
  'HEADER_DATA_MISSING',
  'HEADER_OUT_OF_TABLE',
  'HEADER_TABLE_NOT_APPLICABLE',
  'KINGS_OUT_OF_TABLE',
  'SNOW_LOAD_REQUIRED',
  // cantos, T e studs extras
  'CORNER_STUD_OFF_PLATE',
  'TEE_IN_OPENING',
  'TEE_WITHOUT_STUD',
  'EXTRA_STUD_INVALID',
  'EXTRA_STUD_OUT_OF_WALL',
  'EXTRA_STUD_IN_OPENING',
  // divisão em painéis, emendas, estoque
  'CANNOT_SPLIT',
  'PANEL_BREAK_INVALID',
  'PANEL_TOO_LONG',
  'LAP_NO_ROOM',
  'SPLICE_NO_STUD',
  'PANEL_MIN_LAP_ABOVE_LAP',
  'PRECUTS_EMPTY',
  'STOCK_EMPTY',
  'STOCK_INVALID',
  'PRICE_INVALID',
  'PIECE_OVER_STOCK',
  // números genéricos (campo + valor)
  'VALUE_NOT_POSITIVE',
  'VALUE_NOT_COUNT',
  'VALUE_INVALID',
  'CONFIG_INVALID',
] as const;
export type EngineErrorCode = (typeof ENGINE_ERROR_CODES)[number];

/** Id de hipótese de `docs/05-pendencias.md` (`P30`). */
export type HypothesisId = `P${number}`;

export type ParamValue = string | number | boolean | readonly (string | number)[];
/** Parâmetros de uma mensagem: só valores simples, para trafegar em JSON e montar a frase em qualquer idioma. */
export type MessageParams = Readonly<Record<string, ParamValue | undefined>>;

/** Onde a mensagem aponta. `alsoWalls`: outras paredes citadas (cruzamento, sobreposição, T). */
export interface MessageWhere {
  wallId?: string | undefined;
  openingId?: string | undefined;
  alsoWalls?: readonly string[] | undefined;
}

/**
 * Motivo de "exige engenheiro" das tabelas de header (R602.7(1)/(2)) e de kings (R602.7.5), estruturado: as
 * tabelas devolvem isto, e `engineerReasonText` é a única frase.
 */
export type EngineerReason =
  | { why: 'noTable'; exterior: boolean }
  | { why: 'width'; width: number; snow?: number; table: string }
  | { why: 'floors'; floors: number; floorSpan?: string; table: string }
  | { why: 'span'; span: number; table: string; wallSection?: string }
  | { why: 'wind'; windSpeed: number; exposure: string; table: string }
  | { why: 'kingSpan'; span: number; table: string };

export function engineerReasonText(r: EngineerReason): string {
  switch (r.why) {
    case 'noTable':
      return `no header table for ${r.exterior ? 'exterior' : 'interior'} walls`;
    case 'width':
      return `building width ${r.width}"${r.snow === undefined ? '' : ` with ${r.snow} psf snow`} is outside table ${r.table}`;
    case 'floors':
      return `${r.floors} floor(s)${r.floorSpan ? ` (${r.floorSpan} span)` : ''} not in table ${r.table}`;
    case 'span':
      return `a ${r.span}" span is above every header in table ${r.table}${r.wallSection === undefined ? '' : ` that fits a ${r.wallSection} wall`}`;
    case 'wind':
      return `${r.windSpeed} mph, exposure ${r.exposure}, is outside table ${r.table}`;
    case 'kingSpan':
      return `a ${r.span}" span is above the last row of table ${r.table}`;
  }
}

/** Parâmetros com o motivo achatado (`why`, `table`, `span`…). */
export function engineerParams(r: EngineerReason): MessageParams {
  return { ...r };
}

function reasonFromParams(p: MessageParams): string {
  return engineerReasonText(p as unknown as EngineerReason);
}

/** "wall W01, opening J1" / "wall W01" / "opening J1" / "" (para o meio da frase, em minúscula). */
export function locus(w: MessageWhere): string {
  const parts: string[] = [];
  if (w.wallId !== undefined) parts.push(`wall ${w.wallId}`);
  if (w.openingId !== undefined) parts.push(`opening ${w.openingId}`);
  return parts.join(', ');
}

/** Maiúscula na primeira palavra, se ela for uma palavra comum; nome de campo (`groundSnowLoad`, `config.x`) fica como é. */
const capitalize = (t: string): string => (/^[a-z]+(?![\w.[])/.test(t) ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** "Wall W01, opening J1: …" / "Wall W01: …" / "Opening J1: …" / o corpo com maiúscula. */
function at(w: MessageWhere, body: string): string {
  const l = locus(w);
  return l === '' ? capitalize(body) : `${capitalize(l)}: ${body}`;
}

/** "Wall W01, opening J1, " antes de um caminho (`extraStuds[0]`), ou nada. */
function lead(w: MessageWhere): string {
  const l = locus(w);
  return l === '' ? '' : `${capitalize(l)}, `;
}

const inch = (n: ParamValue | undefined): string => `${String(n)}"`;
const list = (v: ParamValue | undefined): string => (Array.isArray(v) ? v.join(', ') : String(v));

type Template = (p: MessageParams, w: MessageWhere) => string;

/** Avisos, montados só de código + parâmetros. As frases acompanham as da tela (`web/lib/messages.en.ts`, S26). */
const WARNING: Record<WarningCode, Template> = {
  STUD_LENGTH_MISMATCH: (p, w) =>
    at(
      { wallId: w.wallId },
      `wall height ${inch(p.height)} minus 3 plates of ${inch(p.plateThickness)} needs a ${inch(p.studLength)} stud, which is ` +
        `not one of the precut lengths (${((p.precuts ?? []) as readonly number[]).map((x) => `${x}"`).join(', ')})`,
    ),
  HEADER_JACKS_BELOW_TABLE: (p, w) =>
    p.reason === 'neighbor'
      ? at(w, `1 jack stud per side instead of ${p.wanted} — only ${inch(p.gap)} to the RO of ${p.neighborId}`)
      : at(w, `${p.jacks} jack stud(s) per side, but table ${p.table} asks for ${p.tableJacks} for a ${p.plies}-${p.section} header over ${inch(p.span)}`),
  HEADER_KINGS_BELOW_TABLE: (p, w) =>
    p.reason === 'shared'
      ? at(
          { wallId: w.wallId },
          `openings ${p.prevId} and ${w.openingId}: ${p.used} shared king stud(s) instead of ${p.wanted} — only ${inch(p.gap)} between the ROs`,
        )
      : at(
          w,
          `${p.kings} king stud(s) per side, but table ${p.table} asks for ${p.tableKings} for a ${inch(p.span)} span at ` +
            `${p.windSpeed} mph, exposure ${p.exposure}`,
        ),
  OPENING_NUDGED: (p, w) =>
    at(
      w,
      `moved ${inch(p.distance)} to the ${p.direction === 'left' ? 'left' : 'right'} (RO edge from ${p.from} to ${p.to}) — it touched ` +
        `${p.touched === 'start' ? 'the start of the wall' : p.touched === 'end' ? 'the end of the wall' : `wall ${p.teeWallId ?? '?'} at a tee`}; check the reading`,
    ),
  WIND_SPEED_MISSING: (_p, w) =>
    at(w, 'exterior wall without a wind speed — king studs not checked against table R602.7.5; the panel uses 1 king per side'),
  SPECIES_NOT_IN_TABLE: (p, w) =>
    at(w, `header from table ${p.table}, which is for SPF No. 2; the project specifies ${p.species} — check the span for that species or use the project header schedule`),
  DOOR_RO_HEIGHT_MISMATCH: (p, w) =>
    at({ openingId: w.openingId }, `door RO ${inch(p.roughHeight)} tall (from the subfloor) does not match the header base at ${inch(p.headerBase)}`),
  OPENING_AT_TEE: (p, w) =>
    at(
      { wallId: w.wallId },
      `wall ${p.teeWallId} meets it in a tee at x=${p.x} (strip ${p.lo}–${p.hi}), in the zone of opening(s) ${list(p.openingIds)} [${p.start}, ${p.end}] — ` +
        'king/jack studs and the ladder blocking want the same spot; move the opening or the wall',
    ),
  OPENING_NEAR_CORNER: (p, w) =>
    at(w, `king stud ${inch(p.gap)} from the ${p.end === 'start' ? 'start' : 'end'} of the wall — the end stud does not fit (minimum ${inch(p.min)}); move the opening to the corner or away from it`),
  STUDS_OVERLAP: (p, w) =>
    at({ wallId: w.wallId }, `${p.aRole} at x=${p.aX} and ${p.bRole} at x=${p.bX} overlap by ${inch(p.overlap)} — the shop decides whether to double the stud or skip the mark`),
  STUD_HEIGHT_ABOVE_LIMIT: (p, w) =>
    at(
      { wallId: w.wallId },
      `${inch(p.studLength)} studs exceed the ${inch(p.limit)} limit for a ${p.bearing ? 'bearing' : 'non-bearing'} ${p.section} wall (table R602.3(5)) — needs a structural design`,
    ),
  PANEL_OVERWEIGHT: (p) =>
    `Panel ${p.panelId}: estimated weight ${p.weight} lb is over the ${p.max} lb limit (config.panel.maxWeight) and no break fixes it — check with the shop`,
};

const ERROR: Record<EngineErrorCode, Template> = {
  WALL_POINT_NOT_FINITE: (p, w) => at(w, `${p.end} needs finite x and y (got ${p.x}, ${p.y})`),
  WALL_ZERO_LENGTH: (p, w) => at(w, `start and end are the same point (${p.x}, ${p.y})`),
  WALL_OFF_AXIS: (p, w) =>
    at(w, `not parallel to the plan axes (from ${p.x0}, ${p.y0} to ${p.x1}, ${p.y1}) — walls must run along x or y`),
  WALL_DUPLICATE_ID: (_p, w) => at(w, 'duplicate wall id'),
  WALL_END_TWO_JOINTS: (p, w) =>
    at(w, `the ${p.end} end meets two walls (${p.first} and ${p.second}) — three ends at one point, or a corner and a tee at the same spot`),
  WALLS_CROSS: (p, w) => `Walls ${w.wallId} and ${p.otherWallId} cross at (${p.x}, ${p.y}) — split one of them at the crossing`,
  WALLS_OVERLAP: (p, w) => `Walls ${w.wallId} and ${p.otherWallId} overlap by ${inch(p.overlap)} — is it the same wall twice?`,
  CORNER_ENDS_CONFLICT: (p, w) =>
    `Walls ${w.wallId} (${p.end}) and ${p.otherWallId} (${p.otherEnd}) both declare ends "${p.rule}" at the same corner`,
  PLATE_NO_LENGTH: (p, w) => at(w, `the plate has no length (${inch(p.length)}) — the walls at its ends take it all`),
  OPENING_OFF_PLATE: (p, w) =>
    at(w, `the RO from ${inch(p.from)} to ${inch(p.to)} from start does not fit on the plate (${inch(p.s0)} to ${inch(p.s1)} from start)`),

  OPENING_TAG_UNKNOWN: (p, w) => at(w, `tag "${p.tag}" is not in config.openingTypes`),
  OPENING_TYPE_MISSING: (_p, w) => at(w, 'no type and no tag in the opening schedule'),
  OPENING_SIZE_MISSING: (_p, w) => at(w, 'no roughWidth/roughHeight and no tag in the opening schedule'),
  OPENING_POSITION_MISSING: (_p, w) => at(w, 'no offset or center'),
  HEADER_MARK_UNKNOWN: (p, w) => at(w, `mark "${p.mark}" is not in config.headerSchedule`),
  OPENING_NOT_FINITE: (_p, w) => at(w, 'measurements must be finite numbers'),
  OPENING_SIZE_INVALID: (_p, w) => at(w, 'the RO needs a width and a height > 0'),
  OPENING_OUT_OF_WALL: (p, w) =>
    at(w, `zone [${p.start}, ${p.end}] (RO with king and jack studs) runs past the ${inch(p.length)} wall`),
  OPENINGS_TOO_CLOSE: (p, w) =>
    at(
      { wallId: w.wallId },
      `openings ${p.prevId} and ${w.openingId}: ${inch(p.gap)} between the ROs is not enough for jack studs and a shared king ` +
        `(minimum ${inch(p.needed)})` +
        (p.fit === true ? `; not even 1 jack + 1 king + 1 jack (${inch(p.min3)}) fits — check the position and RO of both` : ''),
    ),
  HEADER_ABOVE_TOP_PLATE: (p, w) =>
    at(w, `${p.section} header based at ${inch(p.base)} reaches ${inch(p.top)}, above the top plate (${inch(p.topPlate)})`),
  HEADER_NO_ROOM_FOR_JACK: (p, w) =>
    at(w, `header base at ${inch(p.base)} leaves no room for a jack stud on the bottom plate (top at ${inch(p.plateTop)})`),
  SILL_NO_ROOM: (p, w) =>
    at(w, `RO base at ${inch(p.roBase)} leaves no room for the ${p.double === true ? 'double ' : ''}sill on the bottom plate (top at ${inch(p.plateTop)})`),

  HEADER_SECTION_UNKNOWN: (p, w) => at(w, `unknown header.section (${p.section})`),
  HEADER_TOO_THICK: (p, w) =>
    at(w, `project header with ${p.plies} plies of ${p.section} (${inch(p.thickness)}) does not fit a ${p.wallSection} wall (${inch(p.depth)})`),
  FLAT_HEADER_SPAN: (p, w) =>
    at(w, `non-bearing wall with a ${inch(p.span)} RO — a flat header (R602.7.4) only covers up to ${inch(p.max)}; specify the opening header`),
  FLAT_HEADER_GAP: (p, w) =>
    at(
      w,
      `flat header (R602.7.4) with its top at ${inch(p.top)} sits ${inch(p.gap)} below the top plate (${inch(p.topPlate)}), over the ${inch(p.max)} limit; ` +
        'specify the opening header',
    ),
  HEADER_DATA_MISSING: (p, w) =>
    at(
      w,
      `bearing wall with no header in the project and no ${p.missing === 'building' ? 'config.building (snow load and building width)' : 'wall.floorsSupported (floors above the wall)'} — ` +
        'the header cannot be picked from the table; provide the data or the opening header',
    ),
  HEADER_OUT_OF_TABLE: (p, w) => at(w, `header outside the table (${reasonFromParams(p)}) — needs an engineer; specify the opening header`),
  HEADER_TABLE_NOT_APPLICABLE: (_p, w) => at(w, 'the header table does not apply'),
  KINGS_OUT_OF_TABLE: (p, w) => at(w, `king studs outside the table (${reasonFromParams(p)}) — needs an engineer; set kingStuds on the opening`),
  SNOW_LOAD_REQUIRED: (_p, w) => at(w, 'groundSnowLoad is required for an exterior bearing wall'),

  CORNER_STUD_OFF_PLATE: (p, w) => at(w, `corner stud at x=${p.x} does not fit on the ${inch(p.length)} plate`),
  TEE_IN_OPENING: (p, w) =>
    at(w, `wall ${p.teeWallId} meets it in a tee at x=${p.x} (strip ${p.lo}–${p.hi}), inside the RO [${p.from}, ${p.to}]`),
  TEE_WITHOUT_STUD: (p, w) => at(w, `tee strip ${p.lo}–${p.hi} has no neighboring stud on one side — nowhere to hold the ladder`),
  EXTRA_STUD_INVALID: (p, w) =>
    `${lead(w)}extraStuds[${p.index}]: ${p.field === 'x' ? 'x must be a finite number' : 'count must be a whole number ≥ 1'} (got ${p.value})`,
  EXTRA_STUD_OUT_OF_WALL: (p, w) =>
    `${lead(w)}extraStuds[${p.index}]: ${p.count} stud(s) from x=${p.x} run past the ${inch(p.length)} wall`,
  EXTRA_STUD_IN_OPENING: (p, w) =>
    `${lead(w)}extraStuds[${p.index}]: stud at x=${p.x} falls in the opening zone [${p.start}, ${p.end}] — extra studs stay clear of kings, jacks and the RO`,

  CANNOT_SPLIT: (p, w) =>
    at(
      { wallId: w.wallId },
      `cannot split ${inch(p.length)} into panels of at most ${inch(p.maxLength)}${p.maxWeight === undefined ? '' : ` / ${p.maxWeight} lb`} — ` +
        `no free layout stud (clear of openings, tees, corners and extra studs) between x=${p.from} and x=${p.to}`,
    ),
  PANEL_BREAK_INVALID: (p, w) =>
    at(
      { wallId: w.wallId },
      `panel break at x=${p.at} (panelBreaks): ` +
        (p.reason === 'order'
          ? 'breaks must be in increasing order with no repeats'
          : p.reason === 'end'
            ? `closer than ${inch(p.min)} to the end of the wall (${inch(p.length)}) — the joint studs do not fit next to the end stud or corner`
            : p.reason === 'mark'
              ? `not the center of a layout stud (marks every ${inch(p.spacing)} from mark 0)`
              : p.reason === 'opening'
                ? `falls in the zone of opening(s) ${list(p.openingIds)} [${p.start}, ${p.end}]`
                : p.reason === 'tee'
                  ? `falls in the tee strip${p.teeWallId === undefined ? '' : ` of wall ${p.teeWallId}`} (${p.lo}–${p.hi})`
                  : `the joint studs touch the ${p.role} at x=${p.memberX}`),
    ),
  PANEL_TOO_LONG: (p, w) =>
    at(
      { wallId: w.wallId },
      `panel from x=${p.from} to x=${p.to} (${inch(p.length)}) is over the ${inch(p.maxLength)} limit (config.panel.maxLength) — add a break in panelBreaks`,
    ),
  LAP_NO_ROOM: (p, w) =>
    at(
      { wallId: w.wallId },
      `double top plate lap after the break at x=${p.at}: ` +
        (p.blocker === undefined
          ? `the next panel ends at x=${p.limit} and not even the ${inch(p.minLap)} minimum fits`
          : `${p.blocker === 'header' ? `the header at x=${p.blockerX}` : `the tee strip${p.teeWallId === undefined ? '' : ` of wall ${p.teeWallId}`}`} takes ${p.lo}–${p.hi} and there is no free mark up to x=${p.limit}`),
    ),
  SPLICE_NO_STUD: (p, w) =>
    at(
      { wallId: w.wallId },
      `${p.role} of ${inch(p.memberLength)}: no stud between x=${p.from} and x=${p.to} to splice the plate ${inch(p.min)} away from the other splices (longest stock ${inch(p.maxStock)})`,
    ),
  PANEL_MIN_LAP_ABOVE_LAP: (p) => `config.panel.minLap (${p.minLap}) is larger than lap (${p.lap})`,
  PRECUTS_EMPTY: () => 'config.studLength: the precut list is empty',
  STOCK_EMPTY: (p) => `${p.scope}: the stock length list is empty`,
  STOCK_INVALID: (p) => `${p.scope}: invalid stock length (${p.value})`,
  PRICE_INVALID: (p) =>
    `config.prices[${p.index}] (${p.section}): ${p.reason === 'duplicate' ? 'the same section and length is priced twice' : p.reason === 'length' ? `invalid length (${p.value})` : `invalid price (${p.value}); expected a number ≥ 0`}`,
  PIECE_OVER_STOCK: (p) => `bom: a ${inch(p.length)} piece is longer than any stock length (longest ${inch(p.max)})`,

  VALUE_NOT_POSITIVE: (p, w) => at(w, `${p.field} must be > 0 (got ${p.value})`),
  VALUE_NOT_COUNT: (p, w) => at(w, `${p.field} must be a whole number ≥ 1 (got ${p.value})`),
  VALUE_INVALID: (p, w) => at(w, `invalid ${p.field} (${p.value})`),
  CONFIG_INVALID: (p) => `invalid ${p.field} (${p.value}); expected ${p.expected === 'weight' ? 'a weight in lb > 0' : 'a measurement > 0'}`,
};

/** A frase de um aviso. */
export function warningMessage(code: WarningCode, params: MessageParams, where: MessageWhere = {}): string {
  return WARNING[code](params, where);
}

/** A frase de um erro do motor. */
export function engineErrorMessage(code: EngineErrorCode, params: MessageParams, where: MessageWhere = {}): string {
  return ERROR[code](params, where);
}

/**
 * Erro do motor com código: o que o projeto pede e não dá para enquadrar. `message` é a frase em inglês
 * (CLI); quem monta outra frase lê `code`, `wallId`, `openingId` e `params`. Estende `RangeError` (que é `Error`) para
 * quem já tratava `RangeError` como "projeto inválido" continuar tratando.
 */
export class EngineError extends RangeError {
  readonly code: EngineErrorCode;
  readonly wallId: string | undefined;
  readonly openingId: string | undefined;
  readonly alsoWalls: readonly string[] | undefined;
  readonly params: MessageParams;

  constructor(code: EngineErrorCode, where: MessageWhere = {}, params: MessageParams = {}) {
    super(engineErrorMessage(code, params, where));
    this.name = 'EngineError';
    this.code = code;
    this.wallId = where.wallId;
    this.openingId = where.openingId;
    this.alsoWalls = where.alsoWalls;
    this.params = params;
  }

  /** O mesmo erro com o contexto de quem o pegou (parede, abertura) somado ao que ele já tinha. */
  at(where: MessageWhere): EngineError {
    return new EngineError(
      this.code,
      {
        wallId: this.wallId ?? where.wallId,
        openingId: this.openingId ?? where.openingId,
        ...(this.alsoWalls ?? where.alsoWalls ? { alsoWalls: this.alsoWalls ?? where.alsoWalls } : {}),
      },
      this.params,
    );
  }
}

/**
 * Aviso de validação. Nunca interrompe a geração. `message` é a frase em inglês montada de `code` +
 * `params` (vai para a folha e o CLI); `hypothesis` fica fora da frase.
 */
export interface Warning {
  code: WarningCode;
  message: string;
  wallId?: string;
  openingId?: string;
  params?: MessageParams;
  hypothesis?: HypothesisId;
}

/** Monta um `Warning` com a frase. */
export function warning(code: WarningCode, where: MessageWhere, params: MessageParams, hypothesis?: HypothesisId): Warning {
  const w: Warning = { code, message: warningMessage(code, params, where), params };
  if (where.wallId !== undefined) w.wallId = where.wallId;
  if (where.openingId !== undefined) w.openingId = where.openingId;
  if (hypothesis !== undefined) w.hypothesis = hypothesis;
  return w;
}

/** Forma serializável de avisos e erros do motor, como trafegam para a tela (S26). */
export interface EngineNotice {
  code: string;
  /** Frase do motor, em inglês (detalhe). */
  message: string;
  wallId?: string;
  openingId?: string;
  alsoWalls?: string[];
  params?: MessageParams;
  hypothesis?: HypothesisId;
}

/** `EngineError` → aviso serializável (sem a pilha). */
export function noticeOf(e: EngineError): EngineNotice {
  const n: EngineNotice = { code: e.code, message: e.message, params: e.params };
  if (e.wallId !== undefined) n.wallId = e.wallId;
  if (e.openingId !== undefined) n.openingId = e.openingId;
  if (e.alsoWalls !== undefined && e.alsoWalls.length > 0) n.alsoWalls = [...e.alsoWalls];
  return n;
}
