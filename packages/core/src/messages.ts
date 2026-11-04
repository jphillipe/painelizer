/**
 * Códigos das mensagens do motor (S26). Avisos (`Warning`) e erros (`EngineError`) saem com código, ids de
 * parede/abertura e parâmetros; a frase em português (CLI, folha) é montada aqui a partir deles — os sites do
 * motor não escrevem texto. Quem mostra em outro idioma (o app) monta a sua frase com os mesmos parâmetros e
 * nunca precisa ler o português.
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
  'FIRE_BLOCKING_REQUIRED',
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
  'LAP_NO_ROOM',
  'SPLICE_NO_STUD',
  'PANEL_MIN_LAP_ABOVE_LAP',
  'PRECUTS_EMPTY',
  'STOCK_EMPTY',
  'STOCK_INVALID',
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
 * tabelas devolvem isto, e `engineerReasonPt` é a única frase.
 */
export type EngineerReason =
  | { why: 'noTable'; exterior: boolean }
  | { why: 'width'; width: number; snow?: number; table: string }
  | { why: 'floors'; floors: number; floorSpan?: string; table: string }
  | { why: 'span'; span: number; table: string; wallSection?: string }
  | { why: 'wind'; windSpeed: number; exposure: string; table: string }
  | { why: 'kingSpan'; span: number; table: string };

export function engineerReasonPt(r: EngineerReason): string {
  switch (r.why) {
    case 'noTable':
      return `sem tabela de header para parede ${r.exterior ? 'externa' : 'interna'}`;
    case 'width':
      return `largura ${r.width}"${r.snow === undefined ? '' : ` com neve ${r.snow} psf`} fora da tabela ${r.table}`;
    case 'floors':
      return `${r.floors} pavimento(s)${r.floorSpan ? ` (${r.floorSpan})` : ''} sem grupo na tabela ${r.table}`;
    case 'span':
      return `vão ${r.span}" acima de todos os headers da tabela ${r.table}${r.wallSection === undefined ? '' : ` que cabem em parede ${r.wallSection}`}`;
    case 'wind':
      return `vento ${r.windSpeed} mph, exposição ${r.exposure}, fora da tabela ${r.table}`;
    case 'kingSpan':
      return `vão ${r.span}" acima da última linha da tabela ${r.table}`;
  }
}

/** Parâmetros com o motivo achatado (`why`, `table`, `span`…). */
export function engineerParams(r: EngineerReason): MessageParams {
  return { ...r };
}

function reasonFromParams(p: MessageParams): string {
  return engineerReasonPt(p as unknown as EngineerReason);
}

/** "parede W01, abertura J1" / "parede W01" / "abertura J1" / "". */
export function locusPt(w: MessageWhere): string {
  const parts: string[] = [];
  if (w.wallId !== undefined) parts.push(`parede ${w.wallId}`);
  if (w.openingId !== undefined) parts.push(`abertura ${w.openingId}`);
  return parts.join(', ');
}

/** `locus: corpo`, ou só o corpo sem locus. */
function at(w: MessageWhere, body: string): string {
  const l = locusPt(w);
  return l === '' ? body : `${l}: ${body}`;
}

const inch = (n: ParamValue | undefined): string => `${String(n)}"`;
const list = (v: ParamValue | undefined): string => (Array.isArray(v) ? v.join(', ') : String(v));

type Template = (p: MessageParams, w: MessageWhere) => string;

const WARNING_PT: Record<WarningCode, Template> = {
  STUD_LENGTH_MISMATCH: (p, w) =>
    at(
      { wallId: w.wallId },
      `altura ${inch(p.height)} menos 3 plates de ${inch(p.plateThickness)} exige stud de ${inch(p.studLength)}, que não é ` +
        `nenhum dos pré-cortes de config.studLength (${((p.precuts ?? []) as readonly number[]).map((x) => `${x}"`).join(', ')})`,
    ),
  HEADER_JACKS_BELOW_TABLE: (p, w) =>
    p.reason === 'neighbor'
      ? at(w, `1 jack por lado em vez de ${p.wanted} — só ${inch(p.gap)} até o RO de ${p.neighborId}`)
      : at(w, `${p.jacks} jack(s) por lado, mas a tabela ${p.table} pede ${p.tableJacks} para o header ${p.plies}-${p.section} com vão de ${inch(p.span)}`),
  HEADER_KINGS_BELOW_TABLE: (p, w) =>
    p.reason === 'shared'
      ? `parede ${w.wallId}, aberturas ${p.prevId} e ${w.openingId}: ${p.used} king(s) compartilhado(s) em vez de ${p.wanted} — só ${inch(p.gap)} entre os RO`
      : at(
          w,
          `${p.kings} king(s) por lado, mas a tabela ${p.table} pede ${p.tableKings} para vão de ${inch(p.span)} com vento de ` +
            `${p.windSpeed} mph, exposição ${p.exposure}`,
        ),
  OPENING_NUDGED: (p, w) =>
    at(
      w,
      `deslocada ${inch(p.distance)} para a ${p.direction === 'left' ? 'esquerda' : 'direita'} (borda do RO de ${p.from} para ${p.to}) — ` +
        `tocava ${p.touched === 'start' ? 'o início da parede' : p.touched === 'end' ? 'o fim da parede' : `a parede ${p.teeWallId ?? '?'} em T`}; confira a leitura`,
    ),
  WIND_SPEED_MISSING: (_p, w) =>
    at(w, 'parede externa sem config.building.windSpeed — kings pela Tabela R602.7.5 não conferidos; o painel sai com 1 king por lado'),
  SPECIES_NOT_IN_TABLE: (p, w) =>
    at(w, `header pela tabela ${p.table}, que é de SPF No. 2; o projeto especifica ${p.species} — conferir o vão com a tabela da espécie ou usar o header schedule do projeto`),
  DOOR_RO_HEIGHT_MISMATCH: (p, w) =>
    at({ openingId: w.openingId }, `RO da porta com ${inch(p.roughHeight)} de altura (medido do subfloor) não bate com a base do header em ${inch(p.headerBase)}`),
  OPENING_AT_TEE: (p, w) =>
    at(
      { wallId: w.wallId },
      `a parede ${p.teeWallId} encosta em T em x=${p.x} (faixa ${p.lo}–${p.hi}), na zona da(s) abertura(s) ${list(p.openingIds)} [${p.start}, ${p.end}] — ` +
        'kings/jacks e o ladder blocking disputam o lugar; afaste a abertura ou a parede',
    ),
  OPENING_NEAR_CORNER: (p, w) =>
    at(w, `king a ${inch(p.gap)} do ${p.end === 'start' ? 'início' : 'fim'} da parede — não cabe o stud de ponta (mínimo ${inch(p.min)}); encoste a abertura no canto ou afaste-a`),
  STUDS_OVERLAP: (p, w) =>
    at({ wallId: w.wallId }, `${p.aRole} em x=${p.aX} e ${p.bRole} em x=${p.bX} se sobrepõem em ${inch(p.overlap)} — a fábrica decide se dobra o stud ou omite a marca`),
  STUD_HEIGHT_ABOVE_LIMIT: (p, w) =>
    at(
      { wallId: w.wallId },
      `stud de ${inch(p.studLength)} passa do máximo de ${inch(p.limit)} para parede ${p.bearing ? 'portante' : 'não portante'} ${p.section} (Tabela R602.3(5)) — exige projeto estrutural`,
    ),
  FIRE_BLOCKING_REQUIRED: (p, w) =>
    at({ wallId: w.wallId }, `cavidade contínua de ${inch(p.cavity)} passa de ${inch(p.limit)} — exige fire blocking horizontal (R302.11), que o painel ainda não desenha`),
  PANEL_OVERWEIGHT: (p) =>
    `painel ${p.panelId}: peso estimado de ${p.weight} lb passa do máximo de ${p.max} lb (config.panel.maxWeight) e não há quebra que resolva — confira com a fábrica`,
};

const ERROR_PT: Record<EngineErrorCode, Template> = {
  WALL_POINT_NOT_FINITE: (p, w) => at(w, `${p.end} deve ter x e y finitos (recebido ${p.x}, ${p.y})`),
  WALL_ZERO_LENGTH: (p, w) => at(w, `start e end coincidem (${p.x}, ${p.y})`),
  WALL_OFF_AXIS: (p, w) => at(w, `fora dos eixos da planta (de ${p.x0}, ${p.y0} a ${p.x1}, ${p.y1}) — só paredes paralelas a x ou a y`),
  WALL_DUPLICATE_ID: (_p, w) => at(w, 'id duplicado'),
  WALL_END_TWO_JOINTS: (p, w) =>
    at(w, `ponta ${p.end} ligada a duas paredes (${p.first} e ${p.second}) — três pontas no mesmo ponto ou canto e T no mesmo lugar`),
  WALLS_CROSS: (p, w) => `paredes ${w.wallId} e ${p.otherWallId} se cruzam em (${p.x}, ${p.y}) — divida uma delas no cruzamento`,
  WALLS_OVERLAP: (p, w) => `paredes ${w.wallId} e ${p.otherWallId} se sobrepõem em ${inch(p.overlap)} — é a mesma parede duas vezes?`,
  CORNER_ENDS_CONFLICT: (p, w) =>
    `paredes ${w.wallId} (${p.end}) e ${p.otherWallId} (${p.otherEnd}): as duas declaram ends "${p.rule}" no mesmo canto`,
  PLATE_NO_LENGTH: (p, w) => at(w, `plate sem comprimento (${inch(p.length)}) — as paredes das pontas ocupam tudo`),
  OPENING_OFF_PLATE: (p, w) =>
    at(w, `RO de ${inch(p.from)} a ${inch(p.to)} do start não cabe na plate (de ${inch(p.s0)} a ${inch(p.s1)} do start)`),

  OPENING_TAG_UNKNOWN: (p, w) => at(w, `tag "${p.tag}" não está em config.openingTypes`),
  OPENING_TYPE_MISSING: (_p, w) => at(w, 'sem type nem tag no catálogo'),
  OPENING_SIZE_MISSING: (_p, w) => at(w, 'sem roughWidth/roughHeight e sem tag no catálogo'),
  OPENING_POSITION_MISSING: (_p, w) => at(w, 'sem offset nem center'),
  HEADER_MARK_UNKNOWN: (p, w) => at(w, `marca "${p.mark}" não está em config.headerSchedule`),
  OPENING_NOT_FINITE: (_p, w) => at(w, 'medidas devem ser números finitos'),
  OPENING_SIZE_INVALID: (_p, w) => at(w, 'RO deve ter largura e altura > 0'),
  OPENING_OUT_OF_WALL: (p, w) => at(w, `zona [${p.start}, ${p.end}] (RO com kings e jacks) sai da parede de ${inch(p.length)}`),
  OPENINGS_TOO_CLOSE: (p, w) =>
    `${w.wallId === undefined ? '' : `parede ${w.wallId}: `}aberturas ${p.prevId} e ${w.openingId}: ${inch(p.gap)} entre os RO não comportam jacks e king ` +
    `compartilhado (mínimo ${inch(p.needed)})` +
    (p.fit === true ? `; nem 1 jack + 1 king + 1 jack (${inch(p.min3)}) cabe — confira a posição e o RO das duas` : ''),
  HEADER_ABOVE_TOP_PLATE: (p, w) =>
    at(w, `header ${p.section} com base em ${inch(p.base)} vai até ${inch(p.top)}, acima da top plate (${inch(p.topPlate)})`),
  HEADER_NO_ROOM_FOR_JACK: (p, w) =>
    at(w, `base do header em ${inch(p.base)} não deixa espaço para jack sobre a bottom plate (topo em ${inch(p.plateTop)})`),
  SILL_NO_ROOM: (p, w) =>
    at(w, `base do RO em ${inch(p.roBase)} não deixa espaço para o sill${p.double === true ? ' duplo' : ''} sobre a bottom plate (topo em ${inch(p.plateTop)})`),

  HEADER_SECTION_UNKNOWN: (p, w) => at(w, `header.section desconhecida (${p.section})`),
  HEADER_TOO_THICK: (p, w) =>
    at(w, `header do projeto com ${p.plies} plies de ${p.section} (${inch(p.thickness)}) não cabe em parede ${p.wallSection} (${inch(p.depth)})`),
  FLAT_HEADER_SPAN: (p, w) =>
    at(w, `parede não portante com RO de ${inch(p.span)} — a peça deitada (R602.7.4) vale até ${inch(p.max)}; informe o header da abertura`),
  FLAT_HEADER_GAP: (p, w) =>
    at(
      w,
      `peça deitada (R602.7.4) com topo em ${inch(p.top)} fica a ${inch(p.gap)} da top plate (${inch(p.topPlate)}), acima do limite de ${inch(p.max)}; ` +
        'informe o header da abertura',
    ),
  HEADER_DATA_MISSING: (p, w) =>
    at(
      w,
      `parede portante sem header no projeto e sem ${p.missing === 'building' ? 'config.building (neve e largura da edificação)' : 'wall.floorsSupported (pavimentos acima da parede)'} — ` +
        'não dá para escolher o header pela tabela; informe o dado ou o header da abertura',
    ),
  HEADER_OUT_OF_TABLE: (p, w) => at(w, `header fora da tabela (${reasonFromParams(p)}) — exige engenheiro; informe o header da abertura`),
  HEADER_TABLE_NOT_APPLICABLE: (_p, w) => at(w, 'tabela de headers não se aplica'),
  KINGS_OUT_OF_TABLE: (p, w) => at(w, `kings fora da tabela (${reasonFromParams(p)}) — exige engenheiro; informe kingStuds na abertura`),
  SNOW_LOAD_REQUIRED: (_p, w) => at(w, 'groundSnowLoad é obrigatório em parede externa portante'),

  CORNER_STUD_OFF_PLATE: (p, w) => at(w, `stud de canto em x=${p.x} não cabe na plate de ${inch(p.length)}`),
  TEE_IN_OPENING: (p, w) => at(w, `a parede ${p.teeWallId} encosta em T em x=${p.x} (faixa ${p.lo}–${p.hi}), dentro do RO [${p.from}, ${p.to}]`),
  TEE_WITHOUT_STUD: (p, w) => at(w, `faixa do T ${p.lo}–${p.hi} sem stud vizinho de um dos lados — não há onde apoiar o ladder`),
  EXTRA_STUD_INVALID: (p, w) =>
    `${locusPt(w)}, extraStuds[${p.index}]: ${p.field === 'x' ? 'x deve ser número finito' : 'count deve ser inteiro ≥ 1'} (recebido ${p.value})`,
  EXTRA_STUD_OUT_OF_WALL: (p, w) => `${locusPt(w)}, extraStuds[${p.index}]: ${p.count} stud(s) a partir de x=${p.x} saem da parede de ${inch(p.length)}`,
  EXTRA_STUD_IN_OPENING: (p, w) =>
    `${locusPt(w)}, extraStuds[${p.index}]: stud em x=${p.x} cai na zona de abertura [${p.start}, ${p.end}] — studs extras ficam fora de kings, jacks e RO`,

  CANNOT_SPLIT: (p, w) =>
    `${w.wallId === undefined ? 'parede' : `parede ${w.wallId}`}: não há como dividir ${inch(p.length)} em painéis de até ${inch(p.maxLength)}` +
    `${p.maxWeight === undefined ? '' : ` / ${p.maxWeight} lb`} — nenhum stud de layout livre (fora de abertura, T, canto e studs extras) entre x=${p.from} e x=${p.to}`,
  LAP_NO_ROOM: (p, w) =>
    at(
      { wallId: w.wallId },
      `lap da double top após a quebra em x=${p.at}: ` +
        (p.blocker === undefined
          ? `o painel seguinte acaba em x=${p.limit} e nem o mínimo de ${inch(p.minLap)} cabe`
          : `${p.blocker === 'header' ? `o header em x=${p.blockerX}` : `a faixa do T${p.teeWallId === undefined ? '' : ` da parede ${p.teeWallId}`}`} ocupa ${p.lo}–${p.hi} e não há marca livre até x=${p.limit}`),
    ),
  SPLICE_NO_STUD: (p, w) =>
    `${w.wallId ?? ''}: ${p.role} de ${inch(p.memberLength)}: não há stud entre x=${p.from} e x=${p.to} para emendar a plate com defasagem de ${inch(p.min)} das outras emendas (estoque máximo ${inch(p.maxStock)})`,
  PANEL_MIN_LAP_ABOVE_LAP: (p) => `config.panel.minLap (${p.minLap}) maior que lap (${p.lap})`,
  PRECUTS_EMPTY: () => 'config.studLength: lista de pré-cortes vazia',
  STOCK_EMPTY: (p) => `${p.scope}: lista de comprimentos comerciais vazia`,
  STOCK_INVALID: (p) => `${p.scope}: comprimento comercial inválido (${p.value})`,
  PIECE_OVER_STOCK: (p) => `bom: peça de ${inch(p.length)} não cabe em nenhum comprimento comercial (máx. ${inch(p.max)})`,

  VALUE_NOT_POSITIVE: (p, w) => at(w, `${p.field} deve ser > 0 (recebido ${p.value})`),
  VALUE_NOT_COUNT: (p, w) => at(w, `${p.field} deve ser inteiro ≥ 1 (recebido ${p.value})`),
  VALUE_INVALID: (p, w) => at(w, `${p.field} ${p.field === 'exposure' ? 'inválida' : 'inválido'} (${p.value})`),
  CONFIG_INVALID: (p) => `${p.field} inválido (${p.value}); esperado ${p.expected === 'weight' ? 'peso em lb > 0' : 'medida > 0'}`,
};

export function warningMessagePt(code: WarningCode, params: MessageParams, where: MessageWhere = {}): string {
  return WARNING_PT[code](params, where);
}

export function engineErrorMessagePt(code: EngineErrorCode, params: MessageParams, where: MessageWhere = {}): string {
  return ERROR_PT[code](params, where);
}

/**
 * Erro do motor com código: o que o projeto pede e não dá para enquadrar. `message` é a frase em português
 * (CLI); quem traduz lê `code`, `wallId`, `openingId` e `params`. Estende `RangeError` (que é `Error`) para
 * quem já tratava `RangeError` como "projeto inválido" continuar tratando.
 */
export class EngineError extends RangeError {
  readonly code: EngineErrorCode;
  readonly wallId: string | undefined;
  readonly openingId: string | undefined;
  readonly alsoWalls: readonly string[] | undefined;
  readonly params: MessageParams;

  constructor(code: EngineErrorCode, where: MessageWhere = {}, params: MessageParams = {}) {
    super(engineErrorMessagePt(code, params, where));
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
 * Aviso de validação. Nunca interrompe a geração. `message` é a frase em português montada de `code` +
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

/** Monta um `Warning` com a frase em português. */
export function warning(code: WarningCode, where: MessageWhere, params: MessageParams, hypothesis?: HypothesisId): Warning {
  const w: Warning = { code, message: warningMessagePt(code, params, where), params };
  if (where.wallId !== undefined) w.wallId = where.wallId;
  if (where.openingId !== undefined) w.openingId = where.openingId;
  if (hypothesis !== undefined) w.hypothesis = hypothesis;
  return w;
}

/** Forma serializável de avisos e erros do motor, como trafegam para a tela (S26). */
export interface EngineNotice {
  code: string;
  /** Frase original em português (detalhe). */
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
