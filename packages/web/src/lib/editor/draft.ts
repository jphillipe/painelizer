/**
 * Modelo do editor de paredes (S21): espelho do JSON de projeto do CLI (`packages/cli/src/project.ts`), com toda
 * medida já em polegadas decimais e a forma de catálogo das aberturas (`tag`/`center`/`headerMark`) preservada —
 * o parser do CLI a resolve e descarta, então o editor não pode trabalhar sobre o `Project` parseado.
 *
 * Leitura tolerante pelo **mesmo schema** do CLI (`cli/schema`, S28.2): cada campo passa pelo schema dele
 * (`readField`, o `safeParse` do campo); o que o CLI recusaria vira `DraftProblem` no caminho (campo fica
 * `undefined`, frase em inglês pela regra da issue), não exceção — o editor precisa abrir o projeto para o humano
 * corrigir. Nós (`config`, paredes, aberturas…) são lidos campo a campo para um campo ruim não derrubar os vizinhos;
 * os defaults do schema não entram no draft (campo ausente fica ausente). Invariante: tudo que `parseProject`
 * aceita abre sem problems. Só JSON inválido ou `walls` que não é lista impedem a abertura.
 *
 * Escrita (`textFromDraft`): chaves conhecidas (as das shapes do schema) em ordem fixa, medidas como número (sem
 * perda; pés-pol arredondaria a 1/16"), chaves desconhecidas (`$comment`, `$reviewed`…) devolvidas em `extra` — o
 * CLI ignora as com `/**
 * Modelo do editor de paredes (S21): espelho do JSON de projeto do CLI (`packages/cli/src/project.ts`), com toda
 * medida já em polegadas decimais e a forma de catálogo das aberturas (`tag`/`center`/`headerMark`) preservada —
 * o parser do CLI a resolve e descarta, então o editor não pode trabalhar sobre o `Project` parseado.
 *
 * Leitura tolerante pelo **mesmo schema** do CLI (`cli/schema`, S28.2): cada campo passa pelo schema dele
 * (`readField`, o `safeParse` do campo); o que o CLI recusaria vira `DraftProblem` no caminho (campo fica
 * `undefined`, frase em inglês pela regra da issue), não exceção — o editor precisa abrir o projeto para o humano
 * corrigir. Nós (`config`, paredes, aberturas…) são lidos campo a campo para um campo ruim não derrubar os vizinhos;
 * os defaults do schema não entram no draft (campo ausente fica ausente). Invariante: tudo que `parseProject`
 * aceita abre sem problems. Só JSON inválido ou `walls` que não é lista impedem a abertura.
 *
 * Escrita (`textFromDraft`): chaves conhecidas (as das shapes do schema) em ordem fixa, medidas como número (sem
 * perda; pés-pol arredondaria a 1/16"), chaves desconhecidas (`$comment`, `$reviewed`…) devolvidas em `extra` — o
 e recusa as outras. Nós aninhados (`building`, `panel`, catálogo, `header`, `ends`,
 * `extraStuds`, `blocking`, `blockingPresets`) só guardam chaves conhecidas.
 *
 * `lib/editor/*` é a única camada do cliente que importa `core` (docs/10-design.md §7).
 */

import {
  parseFeetInches,
  type CornerStyle,
  type DoorFrame,
  type EndRule,
  type Exposure,
  type FloorSpan,
  type LumberSpecies,
  type OpeningType,
  type Point,
  type PriceEntry,
  type TeeStyle,
  type WallSection,
} from 'core';
import {
  blockingPresetShape,
  blockingRowShape,
  buildingShape,
  configShape,
  endsShape,
  engineeredSectionShape,
  extraStudShape,
  headerEntryShape,
  headerSection,
  headerShape,
  isRecord,
  looseWallShape,
  openingShape,
  openingTypeShape,
  panelShape,
  planWallShape,
  pointShape,
  readField,
  rootShape,
  wallTypeShape,
  type FieldIssue,
} from 'cli/schema';
import type { z } from 'zod';

export type { CornerStyle, DoorFrame, EndRule, Exposure, FloorSpan, OpeningType, Point, TeeStyle, WallSection };
export type Species = LumberSpecies;
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

/** Fileira de blocking por altura (S36): centro ao subfloor, trecho opcional (na planta, do `start`) e uso. */
export interface DraftBlockingRow {
  y?: number;
  from?: number;
  to?: number;
  label?: string;
}

/** Item da lista de blocking (S36): id de preset ou fileira. */
export type DraftBlockingEntry = string | DraftBlockingRow;

/** Preset de blocking do projeto (S36). */
export interface DraftBlockingPreset {
  y?: number;
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
  /** Tag do tipo de parede (S35): com a tag em `config.wallTypes`, o tipo dá seção, posição e carga que faltarem. */
  wallType?: string;
  extraStuds?: DraftExtraStud[];
  /** Quebras de painel forçadas (S29): x da parede (na planta, do `start`); ausente = automático. */
  panelBreaks?: number[];
  /** Fileiras de blocking por altura (S36); ausente = as do tipo de parede. */
  blocking?: DraftBlockingEntry[];
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

/** Linha do catálogo de tipos de parede (S35): o que o tipo dá à parede que não disser. */
export interface DraftWallType {
  section?: WallSection;
  exterior?: boolean;
  bearing?: boolean;
  description?: string;
  /** Fileiras de blocking do tipo (S36). */
  blocking?: DraftBlockingEntry[];
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
  /** Tipos de parede do projeto, por tag (S35). */
  wallTypes?: Record<string, DraftWallType>;
  /** Fire blocking acima desta cavidade (S31). */
  fireBlockAt?: number;
  /** Presets de blocking do projeto, por id (S36); somados aos embutidos. */
  blockingPresets?: Record<string, DraftBlockingPreset>;
  /** Tabela de preços do orçamento (S31), como o schema a lê; o editor não a edita, só preserva. */
  prices?: PriceEntry[];
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

/** Chaves conhecidas = as das shapes do schema do CLI; as outras vão para `extra`. */
const ROOT_KEYS = Object.keys(rootShape);
const CONFIG_KEYS = Object.keys(configShape);
const WALL_KEYS = [...new Set([...Object.keys(looseWallShape), ...Object.keys(planWallShape)])];
const OPENING_KEYS = Object.keys(openingShape);

// ---- leitura ----------------------------------------------------------------

/** Lê o texto do arquivo. JSON inválido não abre. */
export function draftFromText(text: string): DraftLoad {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, problems: [{ path: '', text: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` }] };
  }
  return draftFromJson(raw);
}

/** Lê o JSON já parseado. Só falha se não for objeto ou se `walls` não for lista. */
export function draftFromJson(raw: unknown): DraftLoad {
  const r = new Reader();
  if (!isRecord(raw)) return { ok: false, problems: [{ path: '', text: `Expected a project object, got ${show(raw)}` }] };
  const wallsRaw = raw['walls'];
  if (!Array.isArray(wallsRaw)) {
    return { ok: false, problems: [{ path: 'walls', text: `Expected a list of walls, got ${show(wallsRaw)}` }] };
  }
  const config = configFrom(r, raw['config'], 'config');
  if (raw['stockLengths'] !== undefined) {
    const list = r.field(rootShape.stockLengths, raw['stockLengths'], 'stockLengths');
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
    name: r.field(rootShape.name, raw['name'], 'name'),
    date: r.field(rootShape.date, raw['date'], 'date'),
    revision: r.field(rootShape.revision, raw['revision'], 'revision'),
    northAngle: r.field(rootShape.northAngle, raw['northAngle'], 'northAngle'),
    config,
    walls,
    extra: rest(raw, ROOT_KEYS),
  });
  return { ok: true, draft, problems: r.problems };
}

function configFrom(r: Reader, raw: unknown, path: string): DraftConfig {
  const c = r.obj(raw, path);
  if (c === undefined) return {};
  const C = configShape;
  return compact({
    studSpacing: r.field(C.studSpacing, c['studSpacing'], `${path}.studSpacing`),
    studThickness: r.field(C.studThickness, c['studThickness'], `${path}.studThickness`),
    plateThickness: r.field(C.plateThickness, c['plateThickness'], `${path}.plateThickness`),
    studLength: r.field(C.studLength, c['studLength'], `${path}.studLength`),
    headerHeight: r.field(C.headerHeight, c['headerHeight'], `${path}.headerHeight`),
    building: buildingFrom(r, c['building'], `${path}.building`),
    doubleSillOver: r.field(C.doubleSillOver, c['doubleSillOver'], `${path}.doubleSillOver`),
    corner: r.field(C.corner, c['corner'], `${path}.corner`),
    tee: r.field(C.tee, c['tee'], `${path}.tee`),
    panel: panelFrom(r, c['panel'], `${path}.panel`),
    stockLengths: r.field(C.stockLengths, c['stockLengths'], `${path}.stockLengths`),
    openingTypes: r.record(c['openingTypes'], `${path}.openingTypes`, openingTypeFrom),
    headerSchedule: r.record(c['headerSchedule'], `${path}.headerSchedule`, headerEntryFrom),
    wallTypes: r.record(c['wallTypes'], `${path}.wallTypes`, wallTypeFrom),
    fireBlockAt: r.field(C.fireBlockAt, c['fireBlockAt'], `${path}.fireBlockAt`),
    blockingPresets: r.record(c['blockingPresets'], `${path}.blockingPresets`, blockingPresetFrom),
    prices: r.field(C.prices, c['prices'], `${path}.prices`),
    extra: rest(c, CONFIG_KEYS),
  });
}

function buildingFrom(r: Reader, raw: unknown, path: string): DraftBuilding | undefined {
  const b = r.obj(raw, path);
  if (b === undefined) return undefined;
  const B = buildingShape;
  return compact({
    groundSnowLoad: r.field(B.groundSnowLoad, b['groundSnowLoad'], `${path}.groundSnowLoad`),
    buildingWidth: r.field(B.buildingWidth, b['buildingWidth'], `${path}.buildingWidth`),
    windSpeed: r.field(B.windSpeed, b['windSpeed'], `${path}.windSpeed`),
    exposure: r.field(B.exposure, b['exposure'], `${path}.exposure`),
    species: r.field(B.species, b['species'], `${path}.species`),
  });
}

function panelFrom(r: Reader, raw: unknown, path: string): DraftPanelConfig | undefined {
  const p = r.obj(raw, path);
  if (p === undefined) return undefined;
  const P = panelShape;
  return compact({
    maxLength: r.field(P.maxLength, p['maxLength'], `${path}.maxLength`),
    maxWeight: r.field(P.maxWeight, p['maxWeight'], `${path}.maxWeight`),
    module: r.field(P.module, p['module'], `${path}.module`),
    lap: r.field(P.lap, p['lap'], `${path}.lap`),
    minLap: r.field(P.minLap, p['minLap'], `${path}.minLap`),
  });
}

function openingTypeFrom(r: Reader, raw: unknown, path: string): DraftOpeningType {
  const e = r.obj(raw, path);
  if (e === undefined) return {};
  const T = openingTypeShape;
  return compact({
    kind: r.field(T.kind, e['kind'], `${path}.kind`),
    width: r.field(T.width, e['width'], `${path}.width`),
    height: r.field(T.height, e['height'], `${path}.height`),
    frame: r.field(T.frame, e['frame'], `${path}.frame`),
    sillHeight: r.field(T.sillHeight, e['sillHeight'], `${path}.sillHeight`),
    roughWidth: r.field(T.roughWidth, e['roughWidth'], `${path}.roughWidth`),
    roughHeight: r.field(T.roughHeight, e['roughHeight'], `${path}.roughHeight`),
    description: r.field(T.description, e['description'], `${path}.description`),
  });
}

function headerEntryFrom(r: Reader, raw: unknown, path: string): DraftHeaderEntry {
  const h = r.obj(raw, path);
  if (h === undefined) return {};
  const H = headerEntryShape;
  return compact({
    section: headerSectionFrom(r, h['section'], `${path}.section`),
    plies: r.field(H.plies, h['plies'], `${path}.plies`),
    jackStuds: r.field(H.jackStuds, h['jackStuds'], `${path}.jackStuds`),
    kingStuds: r.field(H.kingStuds, h['kingStuds'], `${path}.kingStuds`),
    description: r.field(H.description, h['description'], `${path}.description`),
  });
}

function wallTypeFrom(r: Reader, raw: unknown, path: string): DraftWallType {
  const t = r.obj(raw, path);
  if (t === undefined) return {};
  const T = wallTypeShape;
  return compact({
    section: r.field(T.section, t['section'], `${path}.section`),
    exterior: r.field(T.exterior, t['exterior'], `${path}.exterior`),
    bearing: r.field(T.bearing, t['bearing'], `${path}.bearing`),
    description: r.field(T.description, t['description'], `${path}.description`),
    blocking: blockingFrom(r, t['blocking'], `${path}.blocking`),
  });
}

function blockingPresetFrom(r: Reader, raw: unknown, path: string): DraftBlockingPreset {
  const p = r.obj(raw, path);
  if (p === undefined) return {};
  const B = blockingPresetShape;
  return compact({ y: r.field(B.y, p['y'], `${path}.y`), label: r.field(B.label, p['label'], `${path}.label`) });
}

/** Lista de blocking (S36): texto = id de preset (aparado não; vazio é problema), objeto = fileira campo a campo. */
function blockingFrom(r: Reader, raw: unknown, path: string): DraftBlockingEntry[] | undefined {
  return r.list(raw, path)?.flatMap((e, i): DraftBlockingEntry[] => {
    const p = `${path}[${i}]`;
    if (typeof e === 'string') {
      const id = r.field(blockingRowShape.label, e, p);
      return id === undefined ? [] : [id];
    }
    const o = r.obj(e, p);
    if (o === undefined) return [];
    const B = blockingRowShape;
    return [
      compact({
        y: r.field(B.y, o['y'], `${p}.y`),
        from: r.field(B.from, o['from'], `${p}.from`),
        to: r.field(B.to, o['to'], `${p}.to`),
        label: r.field(B.label, o['label'], `${p}.label`),
      }),
    ];
  });
}

/** `"2x10"`, `"LVL 1.75x9.25"` (texto é devolvido como veio) ou `{ material, width, depth }` com medidas. */
function headerSectionFrom(r: Reader, v: unknown, path: string): HeaderSectionDraft | undefined {
  if (v === undefined) return undefined;
  // O schema converte o objeto em texto ("LVL 1.75x9.25"); o editor guarda o objeto como o arquivo o escreveu.
  if (!isRecord(v)) return r.field(headerSection, v, path) === undefined ? undefined : (v as string);
  const E = engineeredSectionShape;
  const material = r.field(E.material, v['material'], `${path}.material`);
  const width = r.field(E.width, v['width'], `${path}.width`);
  const depth = r.field(E.depth, v['depth'], `${path}.depth`);
  if (material === undefined || width === undefined || depth === undefined) return undefined;
  return { material, width, depth };
}

function wallFrom(r: Reader, raw: unknown, path: string, index: number): DraftWall | undefined {
  const w = r.obj(raw, path);
  if (w === undefined) return undefined;
  const W = looseWallShape;
  const id = r.field(W.id, w['id'], `${path}.id`) ?? `wall-${index + 1}`;
  if (w['id'] === undefined) r.fail(`${path}.id`, `Wall without id; named ${id}`);
  const openings: DraftOpening[] = [];
  r.list(w['openings'], `${path}.openings`)?.forEach((o, i) => {
    const op = openingFrom(r, o, `${path}.openings[${i}]`, i);
    if (op !== undefined) openings.push(op);
  });
  const extraStuds = r.list(w['extraStuds'], `${path}.extraStuds`)?.map((e, i) => {
    const p = `${path}.extraStuds[${i}]`;
    const o = r.obj(e, p) ?? {};
    const X = extraStudShape;
    return compact({ x: r.field(X.x, o['x'], `${p}.x`), count: r.field(X.count, o['count'], `${p}.count`), label: r.field(X.label, o['label'], `${p}.label`) });
  });
  const e = r.obj(w['ends'], `${path}.ends`);
  const ends = e === undefined ? undefined : compact({ start: r.field(endsShape.start, e['start'], `${path}.ends.start`), end: r.field(endsShape.end, e['end'], `${path}.ends.end`) });
  return compact({
    id,
    start: pointFrom(r, w['start'], `${path}.start`),
    end: pointFrom(r, w['end'], `${path}.end`),
    ends,
    length: r.field(W.length, w['length'], `${path}.length`),
    layoutOrigin: r.field(W.layoutOrigin, w['layoutOrigin'], `${path}.layoutOrigin`),
    height: r.field(W.height, w['height'], `${path}.height`),
    section: r.field(W.section, w['section'], `${path}.section`),
    exterior: r.field(W.exterior, w['exterior'], `${path}.exterior`),
    bearing: r.field(W.bearing, w['bearing'], `${path}.bearing`),
    floorsSupported: r.field(W.floorsSupported, w['floorsSupported'], `${path}.floorsSupported`),
    floorSpan: r.field(W.floorSpan, w['floorSpan'], `${path}.floorSpan`),
    buildingWidth: r.field(W.buildingWidth, w['buildingWidth'], `${path}.buildingWidth`),
    level: r.field(W.level, w['level'], `${path}.level`),
    wallType: r.field(W.wallType, w['wallType'], `${path}.wallType`),
    extraStuds,
    panelBreaks: r.field(W.panelBreaks, w['panelBreaks'], `${path}.panelBreaks`),
    blocking: blockingFrom(r, w['blocking'], `${path}.blocking`),
    openings,
    extra: rest(w, WALL_KEYS),
  });
}

function pointFrom(r: Reader, v: unknown, path: string): Point | undefined {
  const p = r.obj(v, path);
  if (p === undefined) return undefined;
  if (p['x'] === undefined) r.fail(`${path}.x`, 'Missing coordinate');
  if (p['y'] === undefined) r.fail(`${path}.y`, 'Missing coordinate');
  const x = r.field(pointShape.x, p['x'], `${path}.x`);
  const y = r.field(pointShape.y, p['y'], `${path}.y`);
  if (x === undefined || y === undefined) return undefined;
  return { x, y };
}

function openingFrom(r: Reader, raw: unknown, path: string, index: number): DraftOpening | undefined {
  const o = r.obj(raw, path);
  if (o === undefined) return undefined;
  const O = openingShape;
  const id = r.field(O.id, o['id'], `${path}.id`) ?? `opening-${index + 1}`;
  if (o['id'] === undefined) r.fail(`${path}.id`, `Opening without id; named ${id}`);
  const h = r.obj(o['header'], `${path}.header`);
  const header =
    h === undefined
      ? undefined
      : compact({
          section: headerSectionFrom(r, h['section'], `${path}.header.section`),
          plies: r.field(headerShape.plies, h['plies'], `${path}.header.plies`),
          jackStuds: r.field(headerShape.jackStuds, h['jackStuds'], `${path}.header.jackStuds`),
        });
  return compact({
    id,
    tag: r.field(O.tag, o['tag'], `${path}.tag`),
    type: r.field(O.type, o['type'], `${path}.type`),
    center: r.field(O.center, o['center'], `${path}.center`),
    offset: r.field(O.offset, o['offset'], `${path}.offset`),
    roughWidth: r.field(O.roughWidth, o['roughWidth'], `${path}.roughWidth`),
    roughHeight: r.field(O.roughHeight, o['roughHeight'], `${path}.roughHeight`),
    headerMark: r.field(O.headerMark, o['headerMark'], `${path}.headerMark`),
    header,
    sillHeight: r.field(O.sillHeight, o['sillHeight'], `${path}.sillHeight`),
    headerHeight: r.field(O.headerHeight, o['headerHeight'], `${path}.headerHeight`),
    kingStuds: r.field(O.kingStuds, o['kingStuds'], `${path}.kingStuds`),
    jackStuds: r.field(O.jackStuds, o['jackStuds'], `${path}.jackStuds`),
    extra: rest(o, OPENING_KEYS),
  });
}

/** Leitor tolerante: cada falha vira um problema no caminho e o campo fica `undefined`. */
class Reader {
  readonly problems: DraftProblem[] = [];

  fail(path: string, text: string): void {
    this.problems.push({ path, text });
  }

  /**
   * Lê um campo pelo schema dele no CLI. Ausente fica ausente — o default do schema (`studThickness` 1.5, campos de
   * `panel`) não entra no draft, para o arquivo voltar como veio.
   */
  field<S extends z.ZodType>(schema: S, v: unknown, path: string): z.output<S> | undefined {
    if (v === undefined) return undefined;
    const r = readField(schema, v);
    if (r.ok) return r.value;
    for (const issue of r.issues) this.fail(joinPath(path, issue.path), englishText(issue));
    return undefined;
  }

  obj(v: unknown, path: string): Extra | undefined {
    if (v === undefined) return undefined;
    if (!isRecord(v)) {
      this.fail(path, `Expected an object, got ${show(v)}`);
      return undefined;
    }
    return v;
  }

  list(v: unknown, path: string): unknown[] | undefined {
    if (v === undefined) return undefined;
    if (!Array.isArray(v)) {
      this.fail(path, `Expected a list, got ${show(v)}`);
      return undefined;
    }
    return v;
  }

  record<T>(v: unknown, path: string, item: (r: Reader, raw: unknown, p: string) => T): Record<string, T> | undefined {
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

/** `config.studLength` + `[1]` → `config.studLength[1]`. */
function joinPath(base: string, path: readonly (string | number)[]): string {
  return path.reduce<string>((p, k) => (typeof k === 'number' ? `${p}[${k}]` : `${p}.${k}`), base);
}

/** A frase do problema em inglês, pela regra que o schema diz ter sido quebrada (o português é do CLI). */
function englishText(issue: FieldIssue): string {
  const p = issue.params;
  const got = show(p.received);
  switch (p.rule) {
    case 'object':
      return `Expected an object, got ${got}`;
    case 'list':
      return `Expected a list, got ${got}`;
    case 'nonEmptyList':
      return 'Expected at least one value';
    case 'text':
      return `Expected text, got ${got}`;
    case 'boolean':
      return `Expected true or false, got ${got}`;
    case 'oneOf':
      return `Expected one of ${(p.allowed ?? []).join(', ')}, got ${got}`;
    case 'measure':
      return `Not a measure: ${got} (use inches or feet-inches, e.g. 12'-6 1/2")`;
    case 'nonNegative':
      return `Expected a measure ≥ 0, got ${got}`;
    case 'positive':
      return `Expected a measure > 0, got ${got}`;
    case 'number':
      return `Expected a number${p.min === undefined ? '' : ` ${p.exclusive === true ? '>' : '≥'} ${p.min}`}, got ${got}`;
    case 'integer':
      return `Expected a whole number ≥ ${p.min ?? 0}, got ${got}`;
    case 'studSpacing':
      return `Expected 16 or 24 (inches), got ${got}`;
    case 'headerSection':
      return `Expected 2x4, 2x6, 2x8, 2x10, 2x12, "LVL <thickness>x<depth>", "PSL <thickness>x<depth>" or { material, width, depth }, got ${got}`;
    case 'emptyKey':
      return 'Empty key';
    case 'unknownKey':
      return 'Unknown key';
    default:
      return issue.message;
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

const withoutDollarKeys = (extra: Extra | undefined): Extra | undefined => {
  if (extra === undefined) return undefined;
  const kept = Object.fromEntries(Object.entries(extra).filter(([k]) => !k.startsWith('$')));
  return Object.keys(kept).length === 0 ? undefined : kept;
};
const stripExtra = <T extends { extra?: Extra }>(x: T): T => {
  const extra = withoutDollarKeys(x.extra);
  if (extra === x.extra) return x;
  const { extra: _e, ...rest } = x;
  return (extra === undefined ? rest : { ...rest, extra }) as T;
};

/**
 * O draft como o motor o vê (M10): sem as chaves `$…` que só o editor usa (`$underlay` na raiz, `$reviewed` nas
 * paredes). O parser do CLI as ignora, mas o texto muda com elas e a checagem com debounce as tomava por edição.
 */
export function withoutEditorKeys(d: ProjectDraft): ProjectDraft {
  const walls = d.walls.map((w) => {
    const openings = w.openings.map(stripExtra);
    const same = openings.every((o, i) => o === w.openings[i]);
    return stripExtra(same ? w : { ...w, openings });
  });
  const same = walls.every((w, i) => w === d.walls[i]);
  return stripExtra(same ? d : { ...d, walls });
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
    wallTypes:
      c.wallTypes === undefined ? undefined : mapValues(c.wallTypes, (t) => compact({ ...t, blocking: blockingJson(t.blocking) })),
    fireBlockAt: c.fireBlockAt,
    blockingPresets: c.blockingPresets === undefined ? undefined : mapValues(c.blockingPresets, (p) => compact({ ...p })),
    prices: c.prices?.map((p) => ({ ...p })),
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
    panelBreaks: w.panelBreaks === undefined ? undefined : [...w.panelBreaks],
    blocking: blockingJson(w.blocking),
    openings: w.openings.map(openingJson),
    ...(w.extra ?? {}),
  });
}

function blockingJson(b: readonly DraftBlockingEntry[] | undefined): unknown[] | undefined {
  return b?.map((e) => (typeof e === 'string' ? e : compact({ ...e })));
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

/** Comprimento da parede: `length` da solta, distância entre as pontas da de planta; `undefined` sem os dados. */
export function wallLength(w: DraftWall): number | undefined {
  if (!isPlanWall(w)) return w.length;
  if (w.start === undefined || w.end === undefined) return undefined;
  return Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
}

/** Chave da marca de revisão no `extra` da parede (M5; sobrevive à serialização; o CLI ignora chaves com `$`). */
export const REVIEWED_KEY = '$reviewed';

export function isReviewed(w: Pick<DraftWall, 'extra'>): boolean {
  return w.extra?.[REVIEWED_KEY] === true;
}

/** A parede sem a marca de revisão (S30: parede criada ou mudada por duplicar/dividir/juntar volta a pedir revisão). */
export function withoutReviewed(w: DraftWall): DraftWall {
  if (w.extra?.[REVIEWED_KEY] === undefined) return w;
  const extra = { ...w.extra };
  delete extra[REVIEWED_KEY];
  const out: DraftWall = { ...w, extra };
  if (Object.keys(extra).length === 0) delete out.extra;
  return out;
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
