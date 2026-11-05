/**
 * Schema único do arquivo de projeto (S28.2): o que o CLI aceita, em zod, e as peças que o editor do web usa para
 * ler o mesmo arquivo em modo tolerante (`web/src/lib/editor/draft.ts`).
 *
 * - **Strict**: chave desconhecida é erro, com o caminho dela. Chaves que começam com `$` (`$comment`, `$panelizer`,
 *   `$underlay`, `$reviewed`) são de quem escreve o arquivo e passam sem ser lidas.
 * - **Tipos de parede** (S35): `config.wallTypes` por tag e `wallType` na parede. `section`, `exterior` e `bearing`
 *   só podem faltar na parede que traz `wallType`; quem completa (ou recusa, com código) é o core
 *   (`resolveWallType`, em `project.ts`).
 * - **Medidas**: número em polegadas decimais ou texto pés-pol-fração (`12'-0"`, `92 5/8"`), por `parseFeetInches`
 *   do core. `studSpacing` é medida, mas só 16" ou 24" (escopo v1): `"16'"` (192") é erro.
 * - **Formato das paredes**: `loose` (toda parede com `length`) ou `plan` (toda parede com `start`/`end`, S13), como
 *   união discriminada por `format`; misturar os dois é erro apontando a minoria.
 * - **Defaults num lugar**: `studThickness`/`plateThickness` 1.5 e os campos de `config.panel` (os do core) são
 *   preenchidos aqui; o resto ausente fica ausente.
 * - **Estoque num lugar**: `stockLengths` na raiz (formato antigo) entra em `config.stockLengths`; nos dois é erro.
 *
 * Cada falha de campo é uma issue `custom` com a frase em português (a do CLI) e `params: FieldIssueParams` (regra
 * quebrada e valor recebido), para quem mostra em outro idioma não ler o português. Regras de framing não moram
 * aqui: aberturas saem como `OpeningSpec` e quem as resolve é o core (`resolveOpenings`, em `project.ts`).
 */

import { z } from 'zod';
import {
  DEFAULT_PANEL_CONFIG,
  engineeredSection,
  parseEngineeredSection,
  parseFeetInches,
  type BlockingEntry,
  type BlockingPreset,
  type BlockingRow,
  type Building,
  type Config,
  type CornerStyle,
  type DoorFrame,
  type EndRule,
  type Exposure,
  type ExtraStud,
  type FloorSpan,
  type HeaderScheduleEntry,
  type HouseWall,
  type LumberSection,
  type LumberSpecies,
  type OpeningCatalogEntry,
  type OpeningHeader,
  type OpeningSpec,
  type OpeningType,
  type PanelConfig,
  type Post,
  type PostSection,
  type PriceEntry,
  type Point,
  type Section,
  type StudSpacing,
  type TeeStyle,
  type Wall,
  type WallSection,
  type WallSpec,
  type WallTypeEntry,
} from 'core';

// ---- falhas -----------------------------------------------------------------

/** Regra que um campo quebrou (`params.rule` da issue). */
export type FieldRule =
  | 'object'
  | 'list'
  | 'nonEmptyList'
  | 'text'
  | 'boolean'
  | 'oneOf'
  | 'measure'
  | 'nonNegative'
  | 'positive'
  | 'number'
  | 'integer'
  | 'studSpacing'
  | 'headerSection'
  | 'unknownKey'
  | 'removedKey'
  | 'emptyKey'
  /** Regra entre campos (formato misto, id duplicado, estoque duas vezes, `minLap > lap`, norte fora da planta). */
  | 'project';

export interface FieldIssueParams {
  rule: FieldRule;
  /** O valor recebido (ausente = nada). */
  received?: unknown;
  /** `oneOf`: os valores aceitos. */
  allowed?: readonly string[];
  /** `number`/`integer`: o mínimo; `exclusive` = estritamente maior. */
  min?: number;
  exclusive?: boolean;
}

/** Uma issue do schema como os leitores a veem: caminho relativo ao valor lido, frase em português e a regra. */
export interface FieldIssue {
  path: readonly (string | number)[];
  message: string;
  params: FieldIssueParams;
}

class Fail {
  constructor(
    readonly params: FieldIssueParams,
    readonly message: string,
  ) {}
}

type Ctx = z.core.$RefinementCtx;

function report(ctx: Ctx, f: Fail, path: readonly (string | number)[] = []): void {
  ctx.addIssue({ code: 'custom', message: f.message, params: f.params, path: [...path] });
}

/** Repassa as issues de um sub-schema, com o caminho prefixado por `prefix`. */
function forward(ctx: Ctx, issues: readonly z.core.$ZodIssue[], prefix: readonly (string | number)[] = []): void {
  for (const i of issues) {
    const params = (i as { params?: FieldIssueParams }).params ?? { rule: 'project' };
    ctx.addIssue({ code: 'custom', message: i.message, params, path: [...prefix, ...(i.path as (string | number)[])] });
  }
}

/** `schema.safeParse(v)` com as issues repassadas a `ctx` (caminho prefixado); `undefined` quando falhou. */
function sub<S extends z.ZodType>(
  ctx: Ctx,
  schema: S,
  v: unknown,
  prefix: readonly (string | number)[] = [],
): { value: z.output<S> } | undefined {
  const r = schema.safeParse(v);
  if (r.success) return { value: r.data };
  forward(ctx, r.error.issues, prefix);
  return undefined;
}

/** Lê um valor por um schema daqui sem lançar: o valor ou as issues (o editor do web mostra cada uma no caminho). */
export function readField<S extends z.ZodType>(
  schema: S,
  v: unknown,
): { ok: true; value: z.output<S> } | { ok: false; issues: FieldIssue[] } {
  const r = schema.safeParse(v);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => ({
      path: i.path as (string | number)[],
      message: i.message,
      params: (i as { params?: FieldIssueParams }).params ?? { rule: 'project' },
    })),
  };
}

export function show(v: unknown): string {
  if (v === undefined) return 'nothing';
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Tira as chaves com valor `undefined` (exactOptionalPropertyTypes). */
type Clean<T> = { [K in keyof T]: Exclude<T[K], undefined> };

function compact<T extends object>(o: T): Clean<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as Clean<T>;
}

// ---- folhas -----------------------------------------------------------------

/** Um campo: `read` devolve o valor ou a falha; a falha vira uma issue com a frase e a regra. */
function leaf<T>(read: (v: unknown) => T | Fail) {
  return z.unknown().transform((v, ctx): T => {
    const r = read(v);
    if (r instanceof Fail) {
      report(ctx, r);
      return z.NEVER;
    }
    return r;
  });
}

const objectFail = (v: unknown) => new Fail({ rule: 'object', received: v }, `expected an object, got ${show(v)}`);

function readText(v: unknown): string | Fail {
  if (typeof v !== 'string' || v.trim() === '')
    return new Fail({ rule: 'text', received: v }, `expected non-empty text, got ${show(v)}`);
  return v;
}

function readBoolean(v: unknown): boolean | Fail {
  if (typeof v !== 'boolean')
    return new Fail({ rule: 'boolean', received: v }, `expected true/false, got ${show(v)}`);
  return v;
}

function readOneOf<T extends string>(allowed: readonly T[]) {
  return (v: unknown): T | Fail => {
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
      return new Fail(
        { rule: 'oneOf', received: v, allowed },
        `expected one of ${allowed.join(', ')}, got ${show(v)}`,
      );
    }
    return v as T;
  };
}

/** Medida ≥ 0 em polegadas: número decimal ou texto pés-pol-fração. */
export function readMeasure(v: unknown): number | Fail {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return new Fail({ rule: 'measure', received: v }, `invalid measurement ${show(v)}`);
    if (v < 0) return new Fail({ rule: 'nonNegative', received: v }, `invalid measurement ${show(v)}`);
    return v;
  }
  if (typeof v === 'string') {
    try {
      return parseFeetInches(v);
    } catch {
      return new Fail(
        { rule: 'measure', received: v },
        `invalid measurement ${show(v)} (use inches or feet-inches, e.g. 12'-0")`,
      );
    }
  }
  return new Fail({ rule: 'measure', received: v }, `expected a measurement (number or text), got ${show(v)}`);
}

/** Medida com sinal (`layoutOrigin`, coordenadas de planta): número, ou texto pés-pol com `-` opcional na frente. */
function readSigned(v: unknown): number | Fail {
  if (typeof v === 'string' && v.trimStart().startsWith('-')) {
    const n = readMeasure(v.trimStart().slice(1));
    return n instanceof Fail ? n : -n;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return readMeasure(v);
}

function readPositive(v: unknown): number | Fail {
  const n = readMeasure(v);
  if (n instanceof Fail) return n;
  if (n <= 0) return new Fail({ rule: 'positive', received: v }, `expected a measurement > 0, got ${show(v)}`);
  return n;
}

function readStudSpacing(v: unknown): StudSpacing | Fail {
  const n = readPositive(v);
  if (n instanceof Fail) return n;
  if (n !== 16 && n !== 24)
    return new Fail({ rule: 'studSpacing', received: v }, `expected 16 or 24 (inches), got ${show(v)}`);
  return n;
}

/** Número puro (psf, mph, lb, graus), sem unidade de comprimento; `what` entra na frase ("carga em psf (número ≥ 0)"). */
function readNumber(what: string, min?: number, exclusive = false) {
  return (v: unknown): number | Fail => {
    const below = min !== undefined && typeof v === 'number' && (exclusive ? v <= min : v < min);
    if (typeof v !== 'number' || !Number.isFinite(v) || below) {
      const params: FieldIssueParams = {
        rule: 'number',
        received: v,
        ...(min === undefined ? {} : { min, exclusive }),
      };
      return new Fail(params, `expected ${what}, got ${show(v)}`);
    }
    return v;
  };
}

function readInteger(min: number) {
  return (v: unknown): number | Fail => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
      return new Fail({ rule: 'integer', received: v, min }, `expected a whole number ≥ ${min}, got ${show(v)}`);
    }
    return v;
  };
}

export const text = leaf(readText);
export const boolean = leaf(readBoolean);
export const measure = leaf(readMeasure);
export const signedMeasure = leaf(readSigned);
export const positiveMeasure = leaf(readPositive);
export const studSpacing = leaf(readStudSpacing);
/** Inteiro ≥ 1 (plies, kings, jacks, pavimento, studs extras). */
export const count = leaf(readInteger(1));
const floorsSupported = leaf(readInteger(0));
const psf = leaf(readNumber('a load in psf (number ≥ 0)', 0));
const mph = leaf(readNumber('a wind speed in mph (number > 0)', 0, true));
const lb = leaf(readNumber('a weight in lb (number > 0)', 0, true));
const degrees = leaf(readNumber('an angle in degrees'));
const money = leaf(readNumber('a price (number ≥ 0)', 0));

function oneOf<T extends string>(allowed: readonly T[]) {
  return leaf(readOneOf(allowed));
}

const WALL_SECTIONS: readonly WallSection[] = ['2x4', '2x6'];
const LUMBER_SECTIONS: readonly LumberSection[] = ['2x4', '2x6', '2x8', '2x10', '2x12'];
/** Seções de post (S37, P45). */
export const POST_SECTION_LIST: readonly PostSection[] = ['4x4', '4x6', '6x6'];
const OPENING_TYPES: readonly OpeningType[] = ['window', 'door'];
const FLOOR_SPANS: readonly FloorSpan[] = ['center', 'clear'];
const EXPOSURES: readonly Exposure[] = ['B', 'C', 'D'];
const CORNERS: readonly CornerStyle[] = ['california', 'three-stud'];
const TEES: readonly TeeStyle[] = ['ladder', 'backer'];
const SPECIES: readonly LumberSpecies[] = ['SPF', 'Hem-Fir', 'DF', 'SP'];
const DOOR_FRAMES: readonly DoorFrame[] = ['wood', 'hm', 'al'];
const END_RULES: readonly EndRule[] = ['through', 'butt'];

// ---- nós --------------------------------------------------------------------

const UNKNOWN_KEY = 'unknown key — check the spelling; comments go in a key starting with $ (e.g. "$comment")';

/**
 * Objeto strict: as chaves de `shape`; `$…` passam sem ser lidas; qualquer outra é erro (com a frase de `removed`
 * quando a chave foi retirada do formato). A saída só tem as chaves de `shape` com valor.
 */
function node<S extends z.core.$ZodLooseShape>(shape: S, removed: Readonly<Record<string, string>> = {}) {
  const object = z.object(shape);
  return z.unknown().transform((v, ctx): Clean<z.output<typeof object>> => {
    if (!isRecord(v)) {
      report(ctx, objectFail(v));
      return z.NEVER;
    }
    let known = true;
    for (const key of Object.keys(v)) {
      // `undefined` só vem de quem chama em JS (JSON não tem); vale como ausente, como no parser à mão.
      if (Object.hasOwn(shape, key) || key.startsWith('$') || v[key] === undefined) continue;
      known = false;
      const message = removed[key];
      report(ctx, new Fail({ rule: message === undefined ? 'unknownKey' : 'removedKey' }, message ?? UNKNOWN_KEY), [
        key,
      ]);
    }
    const r = sub(ctx, object, v);
    if (r === undefined || !known) return z.NEVER;
    return compact(r.value);
  });
}

/** Lista de `item`; `notList` é a frase quando não é lista (e quando está vazia, com `nonEmpty`). */
function list<S extends z.ZodType>(item: S, notList = 'expected an array', nonEmpty = false) {
  return z.unknown().transform((v, ctx): z.output<S>[] => {
    if (!Array.isArray(v)) {
      report(ctx, new Fail({ rule: 'list', received: v }, `${notList}, got ${show(v)}`));
      return z.NEVER;
    }
    if (nonEmpty && v.length === 0) {
      report(ctx, new Fail({ rule: 'nonEmptyList', received: v }, notList));
      return z.NEVER;
    }
    const out: z.output<S>[] = [];
    let ok = true;
    v.forEach((x, i) => {
      const r = sub(ctx, item, x, [i]);
      if (r === undefined) ok = false;
      else out.push(r.value);
    });
    return ok ? out : z.NEVER;
  });
}

/** Objeto chave → `item` (catálogo por tag ou marca); chave vazia é erro. */
function record<S extends z.ZodType>(item: S) {
  return z.unknown().transform((v, ctx): Record<string, z.output<S>> => {
    if (!isRecord(v)) {
      report(ctx, objectFail(v));
      return z.NEVER;
    }
    const out: Record<string, z.output<S>> = {};
    let ok = true;
    for (const [key, value] of Object.entries(v)) {
      if (key.trim() === '') {
        report(ctx, new Fail({ rule: 'emptyKey' }, 'empty key'));
        ok = false;
        continue;
      }
      const r = sub(ctx, item, value, [key]);
      if (r === undefined) ok = false;
      else out[key] = r.value;
    }
    return ok ? out : z.NEVER;
  });
}

/** Comprimentos comerciais: lista não vazia de medidas > 0. */
export const stockLengths = list(positiveMeasure, 'expected a non-empty array of measurements', true);

/** Pré-cortes de stud: lista não vazia de medidas > 0, ou uma medida só (vira lista de um). */
export const precuts = z.unknown().transform((v, ctx): number[] => {
  if (!Array.isArray(v)) {
    const r = sub(ctx, positiveMeasure, v);
    return r === undefined ? z.NEVER : [r.value];
  }
  if (v.length === 0) {
    report(ctx, new Fail({ rule: 'nonEmptyList', received: v }, 'expected at least one precut length'));
    return z.NEVER;
  }
  return sub(ctx, list(positiveMeasure), v)?.value ?? z.NEVER;
});

/** Seção engenheirada como objeto: `{ material: "LVL", width: "1 3/4\"", depth: "9 1/4\"" }`. */
export const engineeredSectionShape = {
  material: oneOf(['LVL', 'PSL'] as const),
  width: positiveMeasure,
  depth: positiveMeasure,
};
const engineeredSectionNode = node(engineeredSectionShape);

/** Seção de header: serrada (`"2x10"`), engenheirada em texto (`"LVL 1.75x9.25"`) ou em objeto (vira o texto). */
export const headerSection = z.unknown().transform((v, ctx): Section => {
  if (typeof v === 'string' && parseEngineeredSection(v) !== undefined) return v as Section;
  if (isRecord(v)) {
    const r = sub(ctx, engineeredSectionNode, v);
    return r === undefined ? z.NEVER : engineeredSection(r.value.material, r.value.width, r.value.depth);
  }
  if (typeof v === 'string' && (LUMBER_SECTIONS as readonly string[]).includes(v)) return v as Section;
  report(
    ctx,
    new Fail(
      { rule: 'headerSection', received: v },
      `expected one of ${LUMBER_SECTIONS.join(', ')}, "LVL <thickness>x<depth>", "PSL <thickness>x<depth>" or ` +
        `{ material, width, depth }, got ${show(v)}`,
    ),
  );
  return z.NEVER;
});

export const buildingShape = {
  groundSnowLoad: psf,
  buildingWidth: positiveMeasure,
  windSpeed: mph.optional(),
  exposure: oneOf(EXPOSURES).optional(),
  species: oneOf(SPECIES).optional(),
};

/** Divisão em painéis (S15): cada campo ausente vale o default do core. */
export const panelShape = {
  maxLength: positiveMeasure.default(DEFAULT_PANEL_CONFIG.maxLength),
  module: positiveMeasure.default(DEFAULT_PANEL_CONFIG.module),
  lap: positiveMeasure.default(DEFAULT_PANEL_CONFIG.lap),
  minLap: positiveMeasure.default(DEFAULT_PANEL_CONFIG.minLap),
  maxWeight: lb.optional(),
};
const panelNode = node(panelShape).transform((p, ctx): PanelConfig => {
  if (p.minLap > p.lap) {
    report(ctx, new Fail({ rule: 'project', received: p.minLap }, `${p.minLap} is greater than lap (${p.lap})`), ['minLap']);
    return z.NEVER;
  }
  return p;
});

/** Linha do window/door schedule (S12.5). */
export const openingTypeShape = {
  kind: oneOf(OPENING_TYPES),
  width: positiveMeasure,
  height: positiveMeasure,
  frame: oneOf(DOOR_FRAMES).optional(),
  sillHeight: measure.optional(),
  roughWidth: positiveMeasure.optional(),
  roughHeight: positiveMeasure.optional(),
  description: text.optional(),
};

/** Linha do wood header schedule (S12.5). */
export const headerEntryShape = {
  section: headerSection,
  plies: count,
  jackStuds: count,
  kingStuds: count,
  description: text.optional(),
};

/**
 * Fileira de blocking por altura (S36, P44): centro do bloco ao subfloor, trecho opcional (na planta, medido do
 * `start`) e uso. Se o centro cabe entre as plates, quem confere é o motor (depende da altura da parede).
 */
export const blockingRowShape = { y: positiveMeasure, from: measure.optional(), to: measure.optional(), label: text.optional() };
/** Preset de blocking do projeto (S36): centro e uso. */
export const blockingPresetShape = { y: positiveMeasure, label: text.optional() };
const blockingRowNode = node(blockingRowShape);

/** Fileiras de blocking (S36): cada item é um id de preset (texto) ou uma fileira. Preset desconhecido: o motor recusa. */
export const blocking = z.unknown().transform((v, ctx): BlockingEntry[] => {
  const items = sub(ctx, list(z.unknown()), v);
  if (items === undefined) return z.NEVER;
  const out: BlockingEntry[] = [];
  let ok = true;
  items.value.forEach((item, i) => {
    const r = typeof item === 'string' ? sub(ctx, text, item, [i]) : sub(ctx, blockingRowNode, item, [i]);
    if (r === undefined) ok = false;
    else out.push(r.value as BlockingEntry);
  });
  return ok ? out : z.NEVER;
});

/** Linha do catálogo de tipos de parede (S35): tudo opcional — o tipo dá o que a parede não disser. */
export const wallTypeShape = {
  section: oneOf(WALL_SECTIONS).optional(),
  exterior: boolean.optional(),
  bearing: boolean.optional(),
  description: text.optional(),
  /** Fileiras de blocking do tipo (S36): valem na parede sem `blocking`. */
  blocking: blocking.optional(),
};

/** Seção de uma linha de preço: a de header (2x, LVL/PSL) ou a de post (S37: `4x4`, `4x6`, `6x6`). */
export const priceSection = z.unknown().transform((v, ctx): Section => {
  if (typeof v === 'string' && (POST_SECTION_LIST as readonly string[]).includes(v)) return v as Section;
  if (typeof v === 'string' && parseEngineeredSection(v) === undefined && !(LUMBER_SECTIONS as readonly string[]).includes(v)) {
    report(
      ctx,
      new Fail(
        { rule: 'headerSection', received: v },
        `expected one of ${[...LUMBER_SECTIONS, ...POST_SECTION_LIST].join(', ')}, "LVL <thickness>x<depth>", "PSL <thickness>x<depth>" or ` +
          `{ material, width, depth }, got ${show(v)}`,
      ),
    );
    return z.NEVER;
  }
  const r = sub(ctx, headerSection, v);
  return r === undefined ? z.NEVER : r.value;
});

/** Preço por peça de um comprimento de estoque (S31). */
export const pieceCostShape = { section: priceSection, length: positiveMeasure, price: money };
/** Preço por pé linear da seção (S31). */
export const footCostShape = { section: priceSection, perFoot: money };
const pieceCostNode = node(pieceCostShape);
const footCostNode = node(footCostShape);

/**
 * Tabela de preços do orçamento (S31): lista de `{ section, length, price }` ou `{ section, perFoot }`. Quem tem
 * `perFoot` é por pé; o resto, por peça. Repetição (mesma seção e comprimento; dois `perFoot` da seção) é erro.
 */
export const prices = z.unknown().transform((v, ctx): PriceEntry[] => {
  const items = sub(ctx, list(z.unknown()), v);
  if (items === undefined) return z.NEVER;
  const out: PriceEntry[] = [];
  let ok = true;
  items.value.forEach((item, i) => {
    const perFoot = isRecord(item) && Object.hasOwn(item, 'perFoot');
    const r = sub(ctx, perFoot ? footCostNode : pieceCostNode, item, [i]);
    if (r === undefined) {
      ok = false;
      return;
    }
    const p = r.value as PriceEntry;
    const dup = out.some(
      (q) => q.section === p.section && ('perFoot' in q ? 'perFoot' in p : !('perFoot' in p) && Math.abs(q.length - p.length) < 1 / 128),
    );
    if (dup) {
      report(ctx, new Fail({ rule: 'project', received: item }, 'duplicate price for the same section and length'), [i]);
      ok = false;
      return;
    }
    out.push(p);
  });
  return ok ? out : z.NEVER;
});

const REMOVED_CONFIG: Readonly<Record<string, string>> = Object.fromEntries(
  ['defaultHeaderSection', 'defaultHeaderPlies'].map((k) => [
    k,
    'field removed — a non-bearing wall gets a flat member (R602.7.4); a specific header goes in openings[].header',
  ]),
);

export const configShape = {
  studSpacing,
  studThickness: positiveMeasure.default(1.5),
  plateThickness: positiveMeasure.default(1.5),
  studLength: precuts,
  headerHeight: positiveMeasure.optional(),
  building: node(buildingShape).optional(),
  doubleSillOver: positiveMeasure.optional(),
  corner: oneOf(CORNERS).optional(),
  tee: oneOf(TEES).optional(),
  panel: panelNode.optional(),
  stockLengths: stockLengths.optional(),
  openingTypes: record(node(openingTypeShape)).optional(),
  headerSchedule: record(node(headerEntryShape)).optional(),
  wallTypes: record(node(wallTypeShape)).optional(),
  fireBlockAt: positiveMeasure.optional(),
  blockingPresets: record(node(blockingPresetShape)).optional(),
  prices: prices.optional(),
};

export const headerShape = {
  section: headerSection,
  plies: count,
  jackStuds: count.optional(),
};

/**
 * Abertura como o projeto a escreve (S12.5): `tag` + `center` + `headerMark` do catálogo, ou os campos diretos.
 * Quem resolve é `resolveOpenings` do core.
 */
export const openingShape = {
  id: text,
  tag: text.optional(),
  type: oneOf(OPENING_TYPES).optional(),
  center: measure.optional(),
  offset: measure.optional(),
  roughWidth: positiveMeasure.optional(),
  roughHeight: positiveMeasure.optional(),
  headerMark: text.optional(),
  header: node(headerShape).optional(),
  sillHeight: measure.optional(),
  headerHeight: positiveMeasure.optional(),
  kingStuds: count.optional(),
  jackStuds: count.optional(),
};

export const extraStudShape = { x: measure, count: count.optional(), label: text.optional() };
/** Post do projeto (S37, P45): x da borda esquerda (na planta, do `start`), seção e textos do projeto. */
export const postShape = {
  x: measure,
  section: oneOf(POST_SECTION_LIST),
  label: text.optional(),
  base: text.optional(),
  top: text.optional(),
};
export const pointShape = { x: signedMeasure, y: signedMeasure };
export const endsShape = { start: oneOf(END_RULES).optional(), end: oneOf(END_RULES).optional() };

/**
 * Campos comuns aos dois formatos de parede. `section`, `exterior` e `bearing` são opcionais na shape porque o tipo
 * de parede pode dá-los (S35); `typedWall` exige os três na parede sem `wallType`.
 */
export const wallShape = {
  id: text,
  height: positiveMeasure,
  section: oneOf(WALL_SECTIONS).optional(),
  exterior: boolean.optional(),
  bearing: boolean.optional(),
  openings: list(node(openingShape)).default([]),
  buildingWidth: positiveMeasure.optional(),
  floorsSupported: floorsSupported.optional(),
  floorSpan: oneOf(FLOOR_SPANS).optional(),
  level: count.optional(),
  extraStuds: list(node(extraStudShape)).optional(),
  /** Posts 4x4/4x6/6x6 (S37): x da borda esquerda; conectores são texto. */
  posts: list(node(postShape)).optional(),
  /** Quebras de painel forçadas (S29): x da parede (na planta, do `start`); lista completa, crescente. */
  panelBreaks: list(measure).optional(),
  /** Tag do tipo de parede (S35): com a tag em `config.wallTypes`, o tipo dá seção, posição e carga que faltarem. */
  wallType: text.optional(),
  /** Fileiras de blocking por altura (S36): presets e fileiras; ausente = as do tipo de parede. */
  blocking: blocking.optional(),
};

/** Parede solta: `length` e, opcionalmente, `layoutOrigin`. */
export const looseWallShape = { ...wallShape, length: positiveMeasure, layoutOrigin: signedMeasure.optional() };

/** Parede em planta (S13): `start`/`end` no eixo e `ends?`; `length` e `layoutOrigin` saem da planta. */
export const planWallShape = {
  ...wallShape,
  start: node(pointShape),
  end: node(pointShape),
  ends: node(endsShape).optional(),
};

const derived = (key: string) => `a plan wall does not take ${key} — the engine derives it from the plan (start/end)`;
/** Os campos que só o tipo de parede pode suprir, com a leitura de cada um (a frase de "faltou" é a do campo). */
const TYPED_FIELDS = [
  ['section', readOneOf(WALL_SECTIONS)],
  ['exterior', readBoolean],
  ['bearing', readBoolean],
] as const;

/** Parede sem `wallType` tem de trazer seção, posição e carga, como sempre; com `wallType`, o core resolve. */
function typedWall<W extends { wallType?: string; section?: WallSection; exterior?: boolean; bearing?: boolean }>(
  w: W,
  ctx: Ctx,
): W {
  if (w.wallType !== undefined) return w;
  let ok = true;
  for (const [key, read] of TYPED_FIELDS) {
    if (w[key] !== undefined) continue;
    report(ctx, read(undefined) as Fail, [key]);
    ok = false;
  }
  return ok ? w : z.NEVER;
}

const looseWallNode = node(looseWallShape).transform(typedWall);
const planWallNode = node(planWallShape, { length: derived('length'), layoutOrigin: derived('layoutOrigin') }).transform(typedWall);

export type LooseWallFile = Clean<z.output<typeof looseWallNode>>;
export type PlanWallFile = Clean<z.output<typeof planWallNode>>;

/** Parede em planta? (`start` ou `end` presente; o resto do arquivo segue o formato da maioria.) */
export function isPlanWallInput(w: unknown): boolean {
  return isRecord(w) && ('start' in w || 'end' in w);
}

type WallsFile = { format: 'loose'; walls: LooseWallFile[] } | { format: 'plan'; walls: PlanWallFile[] };

const walls = z.unknown().transform((v, ctx): WallsFile => {
  if (!Array.isArray(v)) {
    report(ctx, new Fail({ rule: 'list', received: v }, `expected an array of walls, got ${show(v)}`));
    return z.NEVER;
  }
  if (v.length === 0) {
    report(ctx, new Fail({ rule: 'nonEmptyList', received: v }, 'no walls'));
    return z.NEVER;
  }
  const inPlan = v.map(isPlanWallInput);
  const planCount = inPlan.filter(Boolean).length;
  if (planCount > 0 && planCount < v.length) {
    const first = inPlan.indexOf(planCount * 2 <= v.length);
    report(
      ctx,
      new Fail(
        { rule: 'project' },
        'plan walls (start/end) and loose walls (length) in the same file — use only one format',
      ),
      [first],
    );
    return z.NEVER;
  }
  const parsed: WallsFile | undefined =
    planCount > 0
      ? mapped(sub(ctx, list(planWallNode), v), (walls) => ({ format: 'plan', walls }))
      : mapped(sub(ctx, list(looseWallNode), v), (walls) => ({ format: 'loose', walls }));
  if (parsed === undefined) return z.NEVER;
  const ids = new Set<string>();
  for (const w of parsed.walls) {
    if (ids.has(w.id)) {
      report(ctx, new Fail({ rule: 'project', received: w.id }, `duplicate id "${w.id}"`));
      return z.NEVER;
    }
    ids.add(w.id);
  }
  return parsed;
});

function mapped<T, U>(r: { value: T } | undefined, f: (v: T) => U): U | undefined {
  return r === undefined ? undefined : f(r.value);
}

export const rootShape = {
  name: text.optional(),
  /** Data e revisão das folhas de fabricação (S17), texto livre. */
  date: text.optional(),
  revision: text.optional(),
  /** Chave legada gravada pela S34 (`pt` ou `en`): aceita e ignorada — folhas e planta são sempre em inglês (P51). */
  locale: oneOf(['pt', 'en'] as const).optional(),
  /** Seta do norte da planta (S16), graus; só em projeto em planta. */
  northAngle: degrees.optional(),
  config: node(configShape, REMOVED_CONFIG),
  walls,
  /** Formato antigo do estoque; entra em `config.stockLengths`. */
  stockLengths: stockLengths.optional(),
};

/** O arquivo de projeto lido e normalizado, com as aberturas ainda na forma do projeto (`OpeningSpec`). */
export type ProjectFile = {
  name?: string;
  date?: string;
  revision?: string;
  config: Config;
} & ({ format: 'loose'; walls: LooseWallFile[] } | { format: 'plan'; walls: PlanWallFile[]; northAngle?: number });

export const projectFileSchema = node(rootShape).transform((p, ctx): ProjectFile => {
  let config: Config = p.config;
  if (p.stockLengths !== undefined) {
    if (config.stockLengths !== undefined) {
      report(ctx, new Fail({ rule: 'project' }, 'give the stock lengths only once (here or in config.stockLengths)'), [
        'stockLengths',
      ]);
      return z.NEVER;
    }
    config = { ...config, stockLengths: p.stockLengths };
  }
  if (p.northAngle !== undefined && p.walls.format !== 'plan') {
    report(ctx, new Fail({ rule: 'project' }, 'only valid in a plan project (walls with start/end)'), ['northAngle']);
    return z.NEVER;
  }
  const head = compact({ name: p.name, date: p.date, revision: p.revision });
  if (p.walls.format === 'loose') return { ...head, config, format: 'loose', walls: p.walls.walls };
  return { ...head, config, format: 'plan', walls: p.walls.walls, ...compact({ northAngle: p.northAngle }) };
});

// ---- o schema bate com os tipos do core ---------------------------------------
// Atribuições só de tipo: se o core mudar um campo, o typecheck acusa aqui.

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type WallInput = WallSpec<Omit<Wall, 'openings' | 'joints'> & { openings: OpeningSpec[] }>;
type HouseWallInput = WallSpec<Omit<HouseWall, 'openings'> & { openings: OpeningSpec[] }>;
export type SchemaMatchesCore = [
  Assert<Same<Clean<z.output<ReturnType<typeof node<typeof configShape>>>>, Omit<Config, never>>>,
  Assert<Same<Clean<z.output<ReturnType<typeof node<typeof buildingShape>>>>, Building>>,
  Assert<Same<z.output<typeof panelNode>, PanelConfig>>,
  Assert<Same<Clean<z.output<ReturnType<typeof node<typeof openingTypeShape>>>>, OpeningCatalogEntry>>,
  Assert<Same<Clean<z.output<ReturnType<typeof node<typeof headerEntryShape>>>>, HeaderScheduleEntry>>,
  Assert<Same<Clean<z.output<ReturnType<typeof node<typeof wallTypeShape>>>>, WallTypeEntry>>,
  Assert<Same<Clean<z.output<ReturnType<typeof node<typeof headerShape>>>>, OpeningHeader>>,
  Assert<Same<Clean<z.output<ReturnType<typeof node<typeof openingShape>>>>, OpeningSpec>>,
  Assert<Same<Clean<z.output<ReturnType<typeof node<typeof extraStudShape>>>>, ExtraStud>>,
  Assert<Same<Clean<z.output<ReturnType<typeof node<typeof postShape>>>>, Post>>,
  Assert<Same<Clean<z.output<ReturnType<typeof node<typeof blockingRowShape>>>>, BlockingRow>>,
  Assert<Same<Clean<z.output<ReturnType<typeof node<typeof blockingPresetShape>>>>, BlockingPreset>>,
  Assert<Same<z.output<typeof blocking>, BlockingEntry[]>>,
  Assert<Same<Clean<z.output<ReturnType<typeof node<typeof pointShape>>>>, Point>>,
  Assert<Same<LooseWallFile, WallInput>>,
  Assert<Same<PlanWallFile, HouseWallInput>>,
];
