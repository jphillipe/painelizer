/**
 * Modelo do editor de paredes (S21): espelho do JSON de projeto do CLI (`packages/cli/src/project.ts`), com toda
 * medida já em polegadas decimais e a forma de catálogo das aberturas (`tag`/`center`/`headerMark`) preservada —
 * o parser do CLI a resolve e descarta, então o editor não pode trabalhar sobre o `Project` parseado.
 *
 * Leitura tolerante: o que o parser recusaria vira `DraftProblem` (campo fica `undefined`), não exceção — o
 * editor precisa abrir o projeto para o humano corrigir. Invariante: tudo que `parseProject` aceita abre sem
 * problems. Só JSON inválido ou `walls` que não é lista impedem a abertura.
 *
 * Escrita (`textFromDraft`): chaves conhecidas em ordem fixa, medidas como número (sem perda; pés-pol
 * arredondaria a 1/16"), chaves desconhecidas (`$comment`, `wallType`…) devolvidas em `extra`. Nós aninhados
 * (`building`, `panel`, catálogo, `header`, `ends`, `extraStuds`) só guardam chaves conhecidas.
 *
 * `lib/editor/*` é a única camada do cliente que importa `core` (docs/10-design.md §7).
 */

import { parseFeetInches } from 'core';

export interface Point {
  x: number;
  y: number;
}

export type WallSection = '2x4' | '2x6';
export type OpeningType = 'window' | 'door';
export type EndRule = 'through' | 'butt';
export type FloorSpan = 'center' | 'clear';
export type Exposure = 'B' | 'C' | 'D';
export type Species = 'SPF' | 'Hem-Fir' | 'DF' | 'SP';
export type DoorFrame = 'wood' | 'hm' | 'al';
export type CornerStyle = 'california' | 'three-stud';
export type TeeStyle = 'ladder' | 'backer';
/** Seção de header como o arquivo escreve: `"2x10"`, `"LVL 1.75x9.25"` ou objeto com medidas em polegadas. */
export type HeaderSectionDraft = string | { material: 'LVL' | 'PSL'; width: number; depth: number };
/** Chaves que o parser ignora e o editor devolve intactas. */
export type Extra = Record<string, unknown>;

export interface DraftHeader {
  section?: HeaderSectionDraft;
  plies?: number;
  jackStuds?: number;
}

export interface DraftOpening {
  id: string;
  tag?: string;
  type?: OpeningType;
  center?: number;
  offset?: number;
  roughWidth?: number;
  roughHeight?: number;
  headerMark?: string;
  header?: DraftHeader;
  sillHeight?: number;
  headerHeight?: number;
  kingStuds?: number;
  jackStuds?: number;
  extra?: Extra;
}

export interface DraftExtraStud {
  x?: number;
  count?: number;
  label?: string;
}

export interface DraftWall {
  id: string;
  /** Planta (S13): eixo da parede. */
  start?: Point;
  end?: Point;
  ends?: { start?: EndRule; end?: EndRule };
  /** Parede solta. */
  length?: number;
  layoutOrigin?: number;
  height?: number;
  section?: WallSection;
  exterior?: boolean;
  bearing?: boolean;
  floorsSupported?: number;
  floorSpan?: FloorSpan;
  buildingWidth?: number;
  level?: number;
  /** Tipo de parede do arquiteto (a extração escreve; o parser ignora). */
  wallType?: string;
  extraStuds?: DraftExtraStud[];
  openings: DraftOpening[];
  extra?: Extra;
}

export interface DraftBuilding {
  groundSnowLoad?: number;
  buildingWidth?: number;
  windSpeed?: number;
  exposure?: Exposure;
  species?: Species;
}

export interface DraftPanelConfig {
  maxLength?: number;
  maxWeight?: number;
  module?: number;
  lap?: number;
  minLap?: number;
}

export interface DraftOpeningType {
  kind?: OpeningType;
  width?: number;
  height?: number;
  frame?: DoorFrame;
  sillHeight?: number;
  roughWidth?: number;
  roughHeight?: number;
  description?: string;
}

export interface DraftHeaderEntry {
  section?: HeaderSectionDraft;
  plies?: number;
  jackStuds?: number;
  kingStuds?: number;
  description?: string;
}

export interface DraftConfig {
  studSpacing?: number;
  studThickness?: number;
  plateThickness?: number;
  studLength?: number[];
  headerHeight?: number;
  building?: DraftBuilding;
  doubleSillOver?: number;
  corner?: CornerStyle;
  tee?: TeeStyle;
  panel?: DraftPanelConfig;
  /** `stockLengths` da raiz do arquivo entra aqui (o parser aceita os dois lugares, nunca ambos). */
  stockLengths?: number[];
  openingTypes?: Record<string, DraftOpeningType>;
  headerSchedule?: Record<string, DraftHeaderEntry>;
  extra?: Extra;
}

export interface ProjectDraft {
  name?: string;
  date?: string;
  revision?: string;
  northAngle?: number;
  config: DraftConfig;
  walls: DraftWall[];
  extra?: Extra;
}

/** Formato das paredes: planta (`start`/`end`), soltas (`length`), misto (erro no parser) ou sem paredes. */
export type DraftFormat = 'plan' | 'loose' | 'mixed' | 'empty';

export interface DraftProblem {
  /** Caminho do campo, como o parser escreve: `walls[2].openings[0].center`; vazio para o arquivo inteiro. */
  path: string;
  text: string;
}

export type DraftLoad =
  | { ok: true; draft: ProjectDraft; problems: DraftProblem[] }
  | { ok: false; problems: DraftProblem[] };

const WALL_SECTIONS: readonly WallSection[] = ['2x4', '2x6'];
const OPENING_TYPES: readonly OpeningType[] = ['window', 'door'];
const END_RULES: readonly EndRule[] = ['through', 'butt'];
const FLOOR_SPANS: readonly FloorSpan[] = ['center', 'clear'];
const EXPOSURES: readonly Exposure[] = ['B', 'C', 'D'];
const SPECIES: readonly Species[] = ['SPF', 'Hem-Fir', 'DF', 'SP'];
const DOOR_FRAMES: readonly DoorFrame[] = ['wood', 'hm', 'al'];
const CORNERS: readonly CornerStyle[] = ['california', 'three-stud'];
const TEES: readonly TeeStyle[] = ['ladder', 'backer'];

const ROOT_KEYS = ['name', 'date', 'revision', 'northAngle', 'config', 'walls', 'stockLengths'] as const;
const CONFIG_KEYS = [
  'studSpacing', 'studThickness', 'plateThickness', 'studLength', 'headerHeight', 'building', 'doubleSillOver',
  'corner', 'tee', 'panel', 'stockLengths', 'openingTypes', 'headerSchedule',
] as const;
const WALL_KEYS = [
  'id', 'start', 'end', 'ends', 'length', 'layoutOrigin', 'height', 'section', 'exterior', 'bearing',
  'floorsSupported', 'floorSpan', 'buildingWidth', 'level', 'wallType', 'extraStuds', 'openings',
] as const;
const OPENING_KEYS = [
  'id', 'tag', 'type', 'center', 'offset', 'roughWidth', 'roughHeight', 'headerMark', 'header', 'sillHeight',
  'headerHeight', 'kingStuds', 'jackStuds',
] as const;

// ---- leitura ----------------------------------------------------------------

/** Lê o texto do arquivo. JSON inválido não abre. */
export function draftFromText(text: string): DraftLoad {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, problems: [{ path: '', text: `Invalid JSON: ${(e as Error).message}` }] };
  }
  return draftFromJson(raw);
}

/** Lê o JSON já parseado. Só falha se não for objeto ou se `walls` não for lista. */
export function draftFromJson(raw: unknown): DraftLoad {
  const r = new Reader();
  if (!isObject(raw)) return { ok: false, problems: [{ path: '', text: `Expected a project object, got ${show(raw)}` }] };
  const wallsRaw = raw['walls'];
  if (!Array.isArray(wallsRaw)) {
    return { ok: false, problems: [{ path: 'walls', text: `Expected a list of walls, got ${show(wallsRaw)}` }] };
  }
  const config = configFrom(r, raw['config'], 'config');
  if (raw['stockLengths'] !== undefined) {
    const list = r.measureList(raw['stockLengths'], 'stockLengths', { positive: true });
    if (config.stockLengths !== undefined) {
      r.fail('stockLengths', 'Stock lengths given twice (here and in config.stockLengths); keeping config');
    } else if (list !== undefined) {
      config.stockLengths = list;
    }
  }
  const walls: DraftWall[] = [];
  wallsRaw.forEach((w, i) => {
    const wall = wallFrom(r, w, `walls[${i}]`, i);
    if (wall !== undefined) walls.push(wall);
  });
  const draft: ProjectDraft = compact({
    name: r.str(raw['name'], 'name'),
    date: r.str(raw['date'], 'date'),
    revision: r.str(raw['revision'], 'revision'),
    northAngle: r.num(raw['northAngle'], 'northAngle'),
    config,
    walls,
    extra: rest(raw, ROOT_KEYS),
  });
  return { ok: true, draft, problems: r.problems };
}

function configFrom(r: Reader, raw: unknown, path: string): DraftConfig {
  const c = r.obj(raw, path);
  if (c === undefined) return {};
  const studLengthRaw = c['studLength'];
  const studLength =
    studLengthRaw === undefined
      ? undefined
      : Array.isArray(studLengthRaw)
        ? r.measureList(studLengthRaw, `${path}.studLength`, { positive: true })
        : wrap(r.measure(studLengthRaw, `${path}.studLength`, { positive: true }));
  return compact({
    studSpacing: r.measure(c['studSpacing'], `${path}.studSpacing`, { positive: true }),
    studThickness: r.measure(c['studThickness'], `${path}.studThickness`, { positive: true }),
    plateThickness: r.measure(c['plateThickness'], `${path}.plateThickness`, { positive: true }),
    studLength,
    headerHeight: r.measure(c['headerHeight'], `${path}.headerHeight`, { positive: true }),
    building: buildingFrom(r, c['building'], `${path}.building`),
    doubleSillOver: r.measure(c['doubleSillOver'], `${path}.doubleSillOver`, { positive: true }),
    corner: r.oneOf(c['corner'], CORNERS, `${path}.corner`),
    tee: r.oneOf(c['tee'], TEES, `${path}.tee`),
    panel: panelFrom(r, c['panel'], `${path}.panel`),
    stockLengths: r.measureList(c['stockLengths'], `${path}.stockLengths`, { positive: true }),
    openingTypes: r.record(c['openingTypes'], `${path}.openingTypes`, openingTypeFrom),
    headerSchedule: r.record(c['headerSchedule'], `${path}.headerSchedule`, headerEntryFrom),
    extra: rest(c, CONFIG_KEYS),
  });
}

function buildingFrom(r: Reader, raw: unknown, path: string): DraftBuilding | undefined {
  if (raw === undefined) return undefined;
  const b = r.obj(raw, path);
  if (b === undefined) return undefined;
  return compact({
    groundSnowLoad: r.num(b['groundSnowLoad'], `${path}.groundSnowLoad`, 0),
    buildingWidth: r.measure(b['buildingWidth'], `${path}.buildingWidth`, { positive: true }),
    windSpeed: r.num(b['windSpeed'], `${path}.windSpeed`, 0),
    exposure: r.oneOf(b['exposure'], EXPOSURES, `${path}.exposure`),
    species: r.oneOf(b['species'], SPECIES, `${path}.species`),
  });
}

function panelFrom(r: Reader, raw: unknown, path: string): DraftPanelConfig | undefined {
  if (raw === undefined) return undefined;
  const p = r.obj(raw, path);
  if (p === undefined) return undefined;
  return compact({
    maxLength: r.measure(p['maxLength'], `${path}.maxLength`, { positive: true }),
    maxWeight: r.num(p['maxWeight'], `${path}.maxWeight`, 0),
    module: r.measure(p['module'], `${path}.module`, { positive: true }),
    lap: r.measure(p['lap'], `${path}.lap`, { positive: true }),
    minLap: r.measure(p['minLap'], `${path}.minLap`, { positive: true }),
  });
}

function openingTypeFrom(r: Reader, raw: unknown, path: string): DraftOpeningType {
  const e = r.obj(raw, path);
  if (e === undefined) return {};
  return compact({
    kind: r.oneOf(e['kind'], OPENING_TYPES, `${path}.kind`),
    width: r.measure(e['width'], `${path}.width`, { positive: true }),
    height: r.measure(e['height'], `${path}.height`, { positive: true }),
    frame: r.oneOf(e['frame'], DOOR_FRAMES, `${path}.frame`),
    sillHeight: r.measure(e['sillHeight'], `${path}.sillHeight`),
    roughWidth: r.measure(e['roughWidth'], `${path}.roughWidth`, { positive: true }),
    roughHeight: r.measure(e['roughHeight'], `${path}.roughHeight`, { positive: true }),
    description: r.str(e['description'], `${path}.description`),
  });
}

function headerEntryFrom(r: Reader, raw: unknown, path: string): DraftHeaderEntry {
  const h = r.obj(raw, path);
  if (h === undefined) return {};
  return compact({
    section: headerSectionFrom(r, h['section'], `${path}.section`),
    plies: r.int(h['plies'], `${path}.plies`, 1),
    jackStuds: r.int(h['jackStuds'], `${path}.jackStuds`, 1),
    kingStuds: r.int(h['kingStuds'], `${path}.kingStuds`, 1),
    description: r.str(h['description'], `${path}.description`),
  });
}

/** `"2x10"`, `"LVL 1.75x9.25"` (texto é devolvido como veio) ou `{ material, width, depth }` com medidas. */
function headerSectionFrom(r: Reader, v: unknown, path: string): HeaderSectionDraft | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'string') return v;
  const o = r.obj(v, path);
  if (o === undefined) return undefined;
  const material = r.oneOf(o['material'], ['LVL', 'PSL'] as const, `${path}.material`);
  const width = r.measure(o['width'], `${path}.width`, { positive: true });
  const depth = r.measure(o['depth'], `${path}.depth`, { positive: true });
  if (material === undefined || width === undefined || depth === undefined) return undefined;
  return { material, width, depth };
}

function wallFrom(r: Reader, raw: unknown, path: string, index: number): DraftWall | undefined {
  const w = r.obj(raw, path);
  if (w === undefined) return undefined;
  const id = r.str(w['id'], `${path}.id`) ?? `wall-${index + 1}`;
  if (w['id'] === undefined) r.fail(`${path}.id`, `Wall without id; named ${id}`);
  const openingsRaw = w['openings'] ?? [];
  const openings: DraftOpening[] = [];
  if (!Array.isArray(openingsRaw)) {
    r.fail(`${path}.openings`, `Expected a list of openings, got ${show(openingsRaw)}`);
  } else {
    openingsRaw.forEach((o, i) => {
      const op = openingFrom(r, o, `${path}.openings[${i}]`, i);
      if (op !== undefined) openings.push(op);
    });
  }
  const extraStudsRaw = w['extraStuds'];
  let extraStuds: DraftExtraStud[] | undefined;
  if (extraStudsRaw !== undefined) {
    if (!Array.isArray(extraStudsRaw)) {
      r.fail(`${path}.extraStuds`, `Expected a list, got ${show(extraStudsRaw)}`);
    } else {
      extraStuds = extraStudsRaw.map((e, i) => {
        const p = `${path}.extraStuds[${i}]`;
        const o = r.obj(e, p) ?? {};
        return compact({ x: r.measure(o['x'], `${p}.x`), count: r.int(o['count'], `${p}.count`, 1), label: r.str(o['label'], `${p}.label`) });
      });
    }
  }
  let ends: DraftWall['ends'];
  if (w['ends'] !== undefined) {
    const e = r.obj(w['ends'], `${path}.ends`);
    if (e !== undefined) {
      ends = compact({ start: r.oneOf(e['start'], END_RULES, `${path}.ends.start`), end: r.oneOf(e['end'], END_RULES, `${path}.ends.end`) });
    }
  }
  return compact({
    id,
    start: pointFrom(r, w['start'], `${path}.start`),
    end: pointFrom(r, w['end'], `${path}.end`),
    ends,
    length: r.measure(w['length'], `${path}.length`, { positive: true }),
    layoutOrigin: r.measure(w['layoutOrigin'], `${path}.layoutOrigin`, { signed: true }),
    height: r.measure(w['height'], `${path}.height`, { positive: true }),
    section: r.oneOf(w['section'], WALL_SECTIONS, `${path}.section`),
    exterior: r.bool(w['exterior'], `${path}.exterior`),
    bearing: r.bool(w['bearing'], `${path}.bearing`),
    floorsSupported: r.int(w['floorsSupported'], `${path}.floorsSupported`, 0),
    floorSpan: r.oneOf(w['floorSpan'], FLOOR_SPANS, `${path}.floorSpan`),
    buildingWidth: r.measure(w['buildingWidth'], `${path}.buildingWidth`, { positive: true }),
    level: r.int(w['level'], `${path}.level`, 1),
    wallType: r.str(w['wallType'], `${path}.wallType`),
    extraStuds,
    openings,
    extra: rest(w, WALL_KEYS),
  });
}

function pointFrom(r: Reader, v: unknown, path: string): Point | undefined {
  if (v === undefined) return undefined;
  const p = r.obj(v, path);
  if (p === undefined) return undefined;
  if (p['x'] === undefined) r.fail(`${path}.x`, 'Missing coordinate');
  if (p['y'] === undefined) r.fail(`${path}.y`, 'Missing coordinate');
  const x = r.measure(p['x'], `${path}.x`, { signed: true });
  const y = r.measure(p['y'], `${path}.y`, { signed: true });
  if (x === undefined || y === undefined) return undefined;
  return { x, y };
}

function openingFrom(r: Reader, raw: unknown, path: string, index: number): DraftOpening | undefined {
  const o = r.obj(raw, path);
  if (o === undefined) return undefined;
  const id = r.str(o['id'], `${path}.id`) ?? `opening-${index + 1}`;
  if (o['id'] === undefined) r.fail(`${path}.id`, `Opening without id; named ${id}`);
  let header: DraftHeader | undefined;
  if (o['header'] !== undefined) {
    const h = r.obj(o['header'], `${path}.header`);
    if (h !== undefined) {
      header = compact({
        section: headerSectionFrom(r, h['section'], `${path}.header.section`),
        plies: r.int(h['plies'], `${path}.header.plies`, 1),
        jackStuds: r.int(h['jackStuds'], `${path}.header.jackStuds`, 1),
      });
    }
  }
  return compact({
    id,
    tag: r.str(o['tag'], `${path}.tag`),
    type: r.oneOf(o['type'], OPENING_TYPES, `${path}.type`),
    center: r.measure(o['center'], `${path}.center`),
    offset: r.measure(o['offset'], `${path}.offset`),
    roughWidth: r.measure(o['roughWidth'], `${path}.roughWidth`, { positive: true }),
    roughHeight: r.measure(o['roughHeight'], `${path}.roughHeight`, { positive: true }),
    headerMark: r.str(o['headerMark'], `${path}.headerMark`),
    header,
    sillHeight: r.measure(o['sillHeight'], `${path}.sillHeight`),
    headerHeight: r.measure(o['headerHeight'], `${path}.headerHeight`, { positive: true }),
    kingStuds: r.int(o['kingStuds'], `${path}.kingStuds`, 1),
    jackStuds: r.int(o['jackStuds'], `${path}.jackStuds`, 1),
    extra: rest(o, OPENING_KEYS),
  });
}

/** Leitor tolerante: cada falha vira um problema no caminho e o campo fica `undefined`. */
class Reader {
  readonly problems: DraftProblem[] = [];

  fail(path: string, text: string): void {
    this.problems.push({ path, text });
  }

  obj(v: unknown, path: string): Extra | undefined {
    if (v === undefined) return undefined;
    if (!isObject(v)) {
      this.fail(path, `Expected an object, got ${show(v)}`);
      return undefined;
    }
    return v;
  }

  str(v: unknown, path: string): string | undefined {
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || v.trim() === '') {
      this.fail(path, `Expected text, got ${show(v)}`);
      return undefined;
    }
    return v;
  }

  bool(v: unknown, path: string): boolean | undefined {
    if (v === undefined) return undefined;
    if (typeof v !== 'boolean') {
      this.fail(path, `Expected true or false, got ${show(v)}`);
      return undefined;
    }
    return v;
  }

  oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): T | undefined {
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
      this.fail(path, `Expected one of ${allowed.join(', ')}, got ${show(v)}`);
      return undefined;
    }
    return v as T;
  }

  /** Número puro (psf, mph, graus, lb), sem unidade de comprimento. */
  num(v: unknown, path: string, min?: number): number | undefined {
    if (v === undefined) return undefined;
    if (typeof v !== 'number' || !Number.isFinite(v) || (min !== undefined && v < min)) {
      this.fail(path, `Expected a number${min !== undefined ? ` ≥ ${min}` : ''}, got ${show(v)}`);
      return undefined;
    }
    return v;
  }

  int(v: unknown, path: string, min: number): number | undefined {
    if (v === undefined) return undefined;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
      this.fail(path, `Expected a whole number ≥ ${min}, got ${show(v)}`);
      return undefined;
    }
    return v;
  }

  /** Medida em polegadas: número ou texto pés-pol; `signed` aceita `-` na frente; `positive` exige > 0. */
  measure(v: unknown, path: string, opts: { signed?: boolean; positive?: boolean } = {}): number | undefined {
    if (v === undefined) return undefined;
    const n = measureValue(v, opts.signed === true);
    if (n === undefined) {
      this.fail(path, `Not a measure: ${show(v)} (use inches or feet-inches, e.g. 12'-6 1/2")`);
      return undefined;
    }
    if (opts.positive === true && n <= 0) {
      this.fail(path, `Expected a measure > 0, got ${show(v)}`);
      return undefined;
    }
    if (opts.signed !== true && n < 0) {
      this.fail(path, `Expected a measure ≥ 0, got ${show(v)}`);
      return undefined;
    }
    return n;
  }

  measureList(v: unknown, path: string, opts: { positive?: boolean } = {}): number[] | undefined {
    if (v === undefined) return undefined;
    if (!Array.isArray(v)) {
      this.fail(path, `Expected a list of measures, got ${show(v)}`);
      return undefined;
    }
    const out: number[] = [];
    v.forEach((item, i) => {
      const n = this.measure(item, `${path}[${i}]`, opts);
      if (n !== undefined) out.push(n);
    });
    return out;
  }

  record<T>(v: unknown, path: string, item: (r: Reader, raw: unknown, p: string) => T): Record<string, T> | undefined {
    if (v === undefined) return undefined;
    const o = this.obj(v, path);
    if (o === undefined) return undefined;
    const out: Record<string, T> = {};
    for (const [key, value] of Object.entries(o)) {
      if (key.trim() === '') {
        this.fail(path, 'Empty key');
        continue;
      }
      out[key] = item(this, value, `${path}.${key}`);
    }
    return out;
  }
}

/** Mesma regra de `measure`/`signed` do parser do CLI; `undefined` quando não lê. */
export function measureValue(v: unknown, signed: boolean): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const t = v.trimStart();
  if (signed && t.startsWith('-')) {
    const n = measureValue(t.slice(1), false);
    return n === undefined ? undefined : -n;
  }
  try {
    return parseFeetInches(v);
  } catch {
    return undefined;
  }
}

function wrap(n: number | undefined): number[] | undefined {
  return n === undefined ? undefined : [n];
}

function isObject(v: unknown): v is Extra {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function show(v: unknown): string {
  if (v === undefined) return 'nothing';
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
}

/** Chaves do objeto que não estão na lista de conhecidas, na ordem original; `undefined` se não houver. */
function rest(o: Extra, known: readonly string[]): Extra | undefined {
  const out: Extra = {};
  let any = false;
  for (const [k, v] of Object.entries(o)) {
    if (!known.includes(k)) {
      out[k] = v;
      any = true;
    }
  }
  return any ? out : undefined;
}

/** Tira as chaves com valor `undefined` (exactOptionalPropertyTypes). */
export function compact<T extends Record<string, unknown>>(o: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as { [K in keyof T]: Exclude<T[K], undefined> };
}

// ---- escrita ----------------------------------------------------------------

/** JSON do CLI a partir do draft: chaves conhecidas em ordem fixa, medidas em número, extras no fim. */
export function jsonFromDraft(d: ProjectDraft): Record<string, unknown> {
  return compact({
    name: d.name,
    date: d.date,
    revision: d.revision,
    northAngle: d.northAngle,
    config: configJson(d.config),
    walls: d.walls.map(wallJson),
    ...(d.extra ?? {}),
  });
}

export function textFromDraft(d: ProjectDraft): string {
  return JSON.stringify(jsonFromDraft(d), null, 2);
}

function configJson(c: DraftConfig): Record<string, unknown> {
  return compact({
    studSpacing: c.studSpacing,
    studThickness: c.studThickness,
    plateThickness: c.plateThickness,
    studLength: c.studLength,
    headerHeight: c.headerHeight,
    building: c.building === undefined ? undefined : compact({ ...c.building }),
    doubleSillOver: c.doubleSillOver,
    corner: c.corner,
    tee: c.tee,
    panel: c.panel === undefined ? undefined : compact({ ...c.panel }),
    stockLengths: c.stockLengths,
    openingTypes: c.openingTypes === undefined ? undefined : mapValues(c.openingTypes, (t) => compact({ ...t })),
    headerSchedule:
      c.headerSchedule === undefined ? undefined : mapValues(c.headerSchedule, (h) => compact({ ...h, section: sectionJson(h.section) })),
    ...(c.extra ?? {}),
  });
}

function wallJson(w: DraftWall): Record<string, unknown> {
  return compact({
    id: w.id,
    start: w.start === undefined ? undefined : { x: w.start.x, y: w.start.y },
    end: w.end === undefined ? undefined : { x: w.end.x, y: w.end.y },
    ends: w.ends === undefined ? undefined : compact({ ...w.ends }),
    length: w.length,
    layoutOrigin: w.layoutOrigin,
    height: w.height,
    section: w.section,
    exterior: w.exterior,
    bearing: w.bearing,
    floorsSupported: w.floorsSupported,
    floorSpan: w.floorSpan,
    buildingWidth: w.buildingWidth,
    level: w.level,
    wallType: w.wallType,
    extraStuds: w.extraStuds === undefined ? undefined : w.extraStuds.map((e) => compact({ ...e })),
    openings: w.openings.map(openingJson),
    ...(w.extra ?? {}),
  });
}

function openingJson(o: DraftOpening): Record<string, unknown> {
  return compact({
    id: o.id,
    tag: o.tag,
    type: o.type,
    center: o.center,
    offset: o.offset,
    roughWidth: o.roughWidth,
    roughHeight: o.roughHeight,
    headerMark: o.headerMark,
    header: o.header === undefined ? undefined : compact({ ...o.header, section: sectionJson(o.header.section) }),
    sillHeight: o.sillHeight,
    headerHeight: o.headerHeight,
    kingStuds: o.kingStuds,
    jackStuds: o.jackStuds,
    ...(o.extra ?? {}),
  });
}

function sectionJson(s: HeaderSectionDraft | undefined): unknown {
  return s === undefined || typeof s === 'string' ? s : { material: s.material, width: s.width, depth: s.depth };
}

function mapValues<T>(o: Record<string, T>, f: (v: T) => unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = f(v);
  return out;
}

// ---- consultas --------------------------------------------------------------

export function isPlanWall(w: DraftWall): boolean {
  return w.start !== undefined || w.end !== undefined;
}

export function draftFormat(d: ProjectDraft): DraftFormat {
  if (d.walls.length === 0) return 'empty';
  const plan = d.walls.filter(isPlanWall).length;
  return plan === 0 ? 'loose' : plan === d.walls.length ? 'plan' : 'mixed';
}

export function wallById(d: ProjectDraft, id: string): DraftWall | undefined {
  return d.walls.find((w) => w.id === id);
}

export function openingById(d: ProjectDraft, wallId: string, openingId: string): DraftOpening | undefined {
  return wallById(d, wallId)?.openings.find((o) => o.id === openingId);
}

export function openingCount(d: ProjectDraft): number {
  return d.walls.reduce((n, w) => n + w.openings.length, 0);
}

/** Id livre? Aberturas são únicas no projeto inteiro (os avisos do motor só trazem o id da abertura). */
export function isIdFree(d: ProjectDraft, id: string, kind: 'wall' | 'opening'): boolean {
  if (kind === 'wall') return !d.walls.some((w) => w.id === id);
  return !d.walls.some((w) => w.openings.some((o) => o.id === id));
}

/**
 * Próximo id de parede no padrão dominante do projeto (`W01…W07` → `W08`, `N1, S1, I1` → `W1`): prefixo mais
 * frequente (com pelo menos duas paredes), maior número + 1, mesmo zero à esquerda. Sem padrão, `W1`, `W2`…
 */
export function nextWallId(d: ProjectDraft): string {
  const byPrefix = new Map<string, { max: number; width: number; count: number }>();
  for (const w of d.walls) {
    const m = /^([A-Za-z]+)(\d+)$/.exec(w.id);
    if (!m) continue;
    const prefix = m[1]!;
    const digits = m[2]!;
    const cur = byPrefix.get(prefix) ?? { max: 0, width: 0, count: 0 };
    cur.max = Math.max(cur.max, Number(digits));
    cur.width = Math.max(cur.width, digits.length);
    cur.count += 1;
    byPrefix.set(prefix, cur);
  }
  let best: { prefix: string; max: number; width: number; count: number } | undefined;
  for (const [prefix, v] of byPrefix) {
    if (best === undefined || v.count > best.count) best = { prefix, ...v };
  }
  const pattern = best !== undefined && best.count >= 2 ? best : { prefix: 'W', max: 0, width: 1, count: 0 };
  for (let n = pattern.max + 1; ; n += 1) {
    const id = `${pattern.prefix}${String(n).padStart(pattern.width, '0')}`;
    if (isIdFree(d, id, 'wall')) return id;
  }
}

/** `<wallId>-O1`, `<wallId>-O2`…, único no projeto. */
export function nextOpeningId(d: ProjectDraft, wallId: string): string {
  for (let n = 1; ; n += 1) {
    const id = `${wallId}-O${n}`;
    if (isIdFree(d, id, 'opening')) return id;
  }
}
