/**
 * Leitura e validação do JSON de projeto que o CLI recebe.
 *
 * Formato:
 * ```json
 * { "name": "Casa X", "config": { ...Config }, "walls": [ ...Wall ], "stockLengths": [96, 120, ...] }
 * ```
 * Medidas (`length`, `height`, `offset`, `roughWidth`, `roughHeight`, `studLength`, `headerHeight`)
 * aceitam número em polegadas decimais ou string em pés-pol-fração (`12'-0"`, `92 5/8"`), convertida
 * por `parseFeetInches` do core — o JSON pode vir de humano ou de IA, e a fábrica pensa em pés-pol.
 * `config.studLength` é a lista de pré-cortes (`[92.625, 104.625]`); uma medida só vira lista de um.
 * `headerHeight` vale no `config` e em cada abertura; a da abertura sobrescreve (P2).
 *
 * Header de abertura (S9.2): `config.building = { groundSnowLoad (psf), buildingWidth (medida) }` são os
 * dados da casa para a tabela IRC; cada parede portante declara `floorsSupported` (pavimentos acima) e,
 * se quiser, `floorSpan` ('center' | 'clear') e `buildingWidth` próprio (casa em L). O header do
 * structural drawings entra na abertura: `header: { section, plies, jackStuds? }`, e manda sobre a tabela.
 * Parede não portante sem `header` leva a peça deitada da R602.7.4 (S9.3); `defaultHeader*` não existe mais.
 *
 * Dados do estrutural (S12): `config.building.windSpeed` (mph, Vult) e `exposure` ('B' | 'C' | 'D') para os
 * kings pela Tabela R602.7.5; `config.doubleSillOver` (medida) para a sill dupla; na parede,
 * `extraStuds: [{ x (medida), count?, label? }]` para studs de altura inteira pedidos pelo projeto.
 *
 * Catálogo do projeto (S12.5): `config.openingTypes = { W41: { kind, width, height, frame?, sillHeight?,
 * roughWidth?, roughHeight?, description? } }` (window/door schedule) e `config.headerSchedule = { HDR2:
 * { section, plies, jackStuds, kingStuds, description? } }` (wood header schedule). A abertura pode então
 * vir como `{ id, tag, center, headerMark }`; os campos diretos continuam valendo e sobrescrevem o
 * catálogo. `header.section` aceita `"LVL 1.75x9.25"` ou `{ material, width, depth }`;
 * `config.building.species` ('SPF' | 'Hem-Fir' | 'DF' | 'SP') guarda a espécie das notas estruturais.
 *
 * Casa em planta (S13): cada parede vem com `start: { x, y }` e `end: { x, y }` (eixo da parede; cada
 * coordenada é medida com sinal, número ou pés-pol) em vez de `length`, mais `ends?: { start?, end? }`
 * ('through' | 'butt') e `level?`. `offset`, `center` e `extraStuds[].x` são medidos do `start`; comprimento
 * de plate, cantos, T e origem de layout saem do core (`panelizeHouse`). `length` ou `layoutOrigin` numa
 * parede em planta é erro, e misturar paredes em planta com paredes soltas no mesmo arquivo também.
 *
 * Montagem de canto e T (S14): `config.corner` ('california' | 'three-stud', default california) e
 * `config.tee` ('ladder' | 'backer', default ladder) — P5.
 *
 * Divisão em painéis (S15): `config.panel = { maxLength?, maxWeight?, module?, lap?, minLap? }` (medidas; peso
 * em lb; cada campo ausente vale o default do core: 240, sem limite, 48, 48, 24) e `config.stockLengths`
 * (medidas; o `stockLengths` na raiz do arquivo continua aceito e vale o mesmo — os dois juntos é erro). Plate
 * mais longa que o maior estoque é emendada sobre stud pelo core; a BOM usa a mesma lista.
 *
 * A validação é estrutural (tipos e campos obrigatórios), com mensagem apontando o caminho do campo.
 * Regras de framing não são validadas aqui: isso é papel do core (S10).
 */

import {
  DEFAULT_PANEL_CONFIG,
  engineeredSection,
  parseEngineeredSection,
  parseFeetInches,
  resolveOpenings,
  type Config,
  type PanelConfig,
  type DoorFrame,
  type EndRule,
  type CornerStyle,
  type Exposure,
  type TeeStyle,
  type ExtraStud,
  type FloorSpan,
  type HeaderScheduleEntry,
  type House,
  type HouseWall,
  type LumberSpecies,
  type OpeningCatalogEntry,
  type OpeningHeader,
  type OpeningSpec,
  type OpeningType,
  type Point,
  type Section,
  type Wall,
  type WallSection,
} from 'core';

export interface Project {
  name: string;
  config: Config;
  /** Paredes soltas (formato por comprimento). Vazio quando o projeto vem em planta (`house`). */
  walls: Wall[];
  /** Casa em planta (S13): paredes com `start`/`end`. Presente ⇔ `walls` vazio. */
  house?: House;
  /** Comprimentos comerciais para a BOM; ausente = default do core (hipótese P9). */
  stockLengths?: number[];
}

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectError';
  }
}

const WALL_SECTIONS: readonly WallSection[] = ['2x4', '2x6'];
const SECTIONS: readonly Section[] = ['2x4', '2x6', '2x8', '2x10', '2x12'];
const OPENING_TYPES: readonly OpeningType[] = ['window', 'door'];
const FLOOR_SPANS: readonly FloorSpan[] = ['center', 'clear'];
const EXPOSURES: readonly Exposure[] = ['B', 'C', 'D'];
const CORNERS: readonly CornerStyle[] = ['california', 'three-stud'];
const TEES: readonly TeeStyle[] = ['ladder', 'backer'];
const SPECIES: readonly LumberSpecies[] = ['SPF', 'Hem-Fir', 'DF', 'SP'];
const DOOR_FRAMES: readonly DoorFrame[] = ['wood', 'hm', 'al'];
const END_RULES: readonly EndRule[] = ['through', 'butt'];

/** Converte o texto do arquivo em `Project` validado. */
export function parseProject(text: string, source = 'projeto'): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ProjectError(`${source}: JSON inválido — ${(e as Error).message}`);
  }
  return projectFrom(raw, source);
}

export function projectFrom(raw: unknown, source = 'projeto'): Project {
  const root = obj(raw, source);
  const name = root['name'] === undefined ? source : str(root['name'], `${source}.name`);
  const config = configFrom(root['config'], `${source}.config`);

  const wallsRaw = root['walls'];
  if (!Array.isArray(wallsRaw)) throw new ProjectError(`${source}.walls: esperado array de paredes`);
  if (wallsRaw.length === 0) throw new ProjectError(`${source}.walls: nenhuma parede`);

  // Formato: planta (toda parede com `start`/`end`) ou paredes soltas (toda parede com `length`).
  const inPlan = wallsRaw.map((w) => typeof w === 'object' && w !== null && ('start' in w || 'end' in w));
  const planCount = inPlan.filter(Boolean).length;
  if (planCount > 0 && planCount < wallsRaw.length) {
    const first = inPlan.indexOf(planCount * 2 > wallsRaw.length ? false : true);
    throw new ProjectError(
      `${source}.walls[${first}]: paredes em planta (start/end) e soltas (length) no mesmo arquivo — ` +
        'use um formato só',
    );
  }
  const house = planCount > 0;
  const walls = house ? [] : wallsRaw.map((w, i) => wallFrom(w, `${source}.walls[${i}]`, config));
  const houseWalls = house ? wallsRaw.map((w, i) => houseWallFrom(w, `${source}.walls[${i}]`, config)) : [];

  const ids = new Set<string>();
  for (const w of house ? houseWalls : walls) {
    if (ids.has(w.id)) throw new ProjectError(`${source}.walls: id duplicado "${w.id}"`);
    ids.add(w.id);
  }

  const project: Project = { name, config, walls };
  if (house) project.house = { walls: houseWalls };
  // Estoque: `config.stockLengths` (S15) ou, como antes, `stockLengths` na raiz — o mesmo valor nos dois lugares,
  // porque o core emenda plates por ele e a BOM compra por ele.
  if (root['stockLengths'] !== undefined) {
    if (config.stockLengths !== undefined) {
      throw new ProjectError(`${source}.stockLengths: informe o estoque só uma vez (aqui ou em config.stockLengths)`);
    }
    config.stockLengths = stockList(root['stockLengths'], `${source}.stockLengths`);
  }
  if (config.stockLengths !== undefined) project.stockLengths = config.stockLengths;
  return project;
}

function configFrom(raw: unknown, path: string): Config {
  const c = obj(raw, path);
  const config: Config = {
    studSpacing: positive(c['studSpacing'], `${path}.studSpacing`),
    studThickness: positive(c['studThickness'] ?? 1.5, `${path}.studThickness`),
    plateThickness: positive(c['plateThickness'] ?? 1.5, `${path}.plateThickness`),
    studLength: precuts(c['studLength'], `${path}.studLength`),
  };
  if (c['headerHeight'] !== undefined) {
    config.headerHeight = positive(c['headerHeight'], `${path}.headerHeight`);
  }
  for (const removed of ['defaultHeaderSection', 'defaultHeaderPlies']) {
    if (c[removed] !== undefined) {
      throw new ProjectError(
        `${path}.${removed}: campo removido na S9.3 — parede não portante leva peça deitada (R602.7.4); ` +
          'header específico vai em openings[].header',
      );
    }
  }
  if (c['building'] !== undefined) {
    const b = obj(c['building'], `${path}.building`);
    config.building = {
      groundSnowLoad: psf(b['groundSnowLoad'], `${path}.building.groundSnowLoad`),
      buildingWidth: positive(b['buildingWidth'], `${path}.building.buildingWidth`),
    };
    if (b['windSpeed'] !== undefined) {
      config.building.windSpeed = mph(b['windSpeed'], `${path}.building.windSpeed`);
    }
    if (b['exposure'] !== undefined) {
      config.building.exposure = oneOf(b['exposure'], EXPOSURES, `${path}.building.exposure`);
    }
    if (b['species'] !== undefined) {
      config.building.species = oneOf(b['species'], SPECIES, `${path}.building.species`);
    }
  }
  if (c['doubleSillOver'] !== undefined) {
    config.doubleSillOver = positive(c['doubleSillOver'], `${path}.doubleSillOver`);
  }
  if (c['corner'] !== undefined) config.corner = oneOf(c['corner'], CORNERS, `${path}.corner`);
  if (c['tee'] !== undefined) config.tee = oneOf(c['tee'], TEES, `${path}.tee`);
  if (c['panel'] !== undefined) config.panel = panelConfigFrom(c['panel'], `${path}.panel`);
  if (c['stockLengths'] !== undefined) config.stockLengths = stockList(c['stockLengths'], `${path}.stockLengths`);
  if (c['openingTypes'] !== undefined) {
    config.openingTypes = record(c['openingTypes'], `${path}.openingTypes`, openingTypeFrom);
  }
  if (c['headerSchedule'] !== undefined) {
    config.headerSchedule = record(c['headerSchedule'], `${path}.headerSchedule`, headerScheduleFrom);
  }
  return config;
}

/** Divisão em painéis (S15): cada campo ausente vale o default do core. */
function panelConfigFrom(raw: unknown, path: string): PanelConfig {
  const p = obj(raw, path);
  const panel: PanelConfig = {
    maxLength: p['maxLength'] === undefined ? DEFAULT_PANEL_CONFIG.maxLength : positive(p['maxLength'], `${path}.maxLength`),
    module: p['module'] === undefined ? DEFAULT_PANEL_CONFIG.module : positive(p['module'], `${path}.module`),
    lap: p['lap'] === undefined ? DEFAULT_PANEL_CONFIG.lap : positive(p['lap'], `${path}.lap`),
    minLap: p['minLap'] === undefined ? DEFAULT_PANEL_CONFIG.minLap : positive(p['minLap'], `${path}.minLap`),
  };
  if (p['maxWeight'] !== undefined) {
    const w = p['maxWeight'];
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
      throw new ProjectError(`${path}.maxWeight: esperado peso em lb (número > 0), recebido ${show(w)}`);
    }
    panel.maxWeight = w;
  }
  if (panel.minLap > panel.lap) {
    throw new ProjectError(`${path}.minLap: ${panel.minLap} maior que lap (${panel.lap})`);
  }
  return panel;
}

/** Comprimentos comerciais: array não vazio de medidas > 0. */
function stockList(raw: unknown, path: string): number[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new ProjectError(`${path}: esperado array não vazio de medidas`);
  return raw.map((v, i) => positive(v, `${path}[${i}]`));
}

/** Objeto chave → valor, cada valor validado por `item`; chave vazia é erro. */
function record<T>(raw: unknown, path: string, item: (v: unknown, p: string) => T): Record<string, T> {
  const o = obj(raw, path);
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(o)) {
    if (key.trim() === '') throw new ProjectError(`${path}: chave vazia`);
    out[key] = item(value, `${path}.${key}`);
  }
  return out;
}

/** Linha do window/door schedule (S12.5). */
function openingTypeFrom(raw: unknown, path: string): OpeningCatalogEntry {
  const e = obj(raw, path);
  const entry: OpeningCatalogEntry = {
    kind: oneOf(e['kind'], OPENING_TYPES, `${path}.kind`),
    width: positive(e['width'], `${path}.width`),
    height: positive(e['height'], `${path}.height`),
  };
  if (e['frame'] !== undefined) entry.frame = oneOf(e['frame'], DOOR_FRAMES, `${path}.frame`);
  if (e['sillHeight'] !== undefined) entry.sillHeight = measure(e['sillHeight'], `${path}.sillHeight`);
  if (e['roughWidth'] !== undefined) entry.roughWidth = positive(e['roughWidth'], `${path}.roughWidth`);
  if (e['roughHeight'] !== undefined) entry.roughHeight = positive(e['roughHeight'], `${path}.roughHeight`);
  if (e['description'] !== undefined) entry.description = str(e['description'], `${path}.description`);
  return entry;
}

/** Linha do wood header schedule (S12.5). */
function headerScheduleFrom(raw: unknown, path: string): HeaderScheduleEntry {
  const h = obj(raw, path);
  const entry: HeaderScheduleEntry = {
    section: headerSectionFrom(h['section'], `${path}.section`),
    plies: count(h['plies'], `${path}.plies`),
    jackStuds: count(h['jackStuds'], `${path}.jackStuds`),
    kingStuds: count(h['kingStuds'], `${path}.kingStuds`),
  };
  if (h['description'] !== undefined) entry.description = str(h['description'], `${path}.description`);
  return entry;
}

/**
 * Seção de header: serrada (`"2x10"`), engenheirada em texto (`"LVL 1.75x9.25"`) ou em objeto
 * (`{ material: "LVL", width: "1 3/4\"", depth: "9 1/4\"" }`, medidas em pés-pol aceitas).
 */
function headerSectionFrom(v: unknown, path: string): Section {
  if (typeof v === 'string' && parseEngineeredSection(v) !== undefined) return v as Section;
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const material = oneOf(o['material'], ['LVL', 'PSL'] as const, `${path}.material`);
    return engineeredSection(material, positive(o['width'], `${path}.width`), positive(o['depth'], `${path}.depth`));
  }
  if (typeof v === 'string' && (SECTIONS as readonly string[]).includes(v)) return v as Section;
  throw new ProjectError(
    `${path}: esperado um de ${SECTIONS.join(', ')}, "LVL <esp>x<prof>", "PSL <esp>x<prof>" ou ` +
      `{ material, width, depth }, recebido ${show(v)}`,
  );
}

/** Parede solta: `length` e, opcionalmente, `layoutOrigin`. */
function wallFrom(raw: unknown, path: string, config: Config): Wall {
  const w = obj(raw, path);
  const wall: Wall = { ...wallCommon(w, path, config), length: positive(w['length'], `${path}.length`) };
  if (w['layoutOrigin'] !== undefined) wall.layoutOrigin = signed(w['layoutOrigin'], `${path}.layoutOrigin`);
  return wall;
}

/**
 * Parede em planta (S13): `start`/`end` no eixo, `ends?` e `level?`. `length` e `layoutOrigin` são
 * derivados pelo core e não podem vir no arquivo. Offsets e studs extras são medidos do `start`.
 */
function houseWallFrom(raw: unknown, path: string, config: Config): HouseWall {
  const w = obj(raw, path);
  for (const derived of ['length', 'layoutOrigin']) {
    if (w[derived] !== undefined) {
      throw new ProjectError(
        `${path}.${derived}: parede em planta não leva ${derived} — o core deriva da planta (start/end)`,
      );
    }
  }
  const wall: HouseWall = {
    ...wallCommon(w, path, config),
    start: point(w['start'], `${path}.start`),
    end: point(w['end'], `${path}.end`),
  };
  if (w['level'] !== undefined) wall.level = count(w['level'], `${path}.level`);
  if (w['ends'] !== undefined) {
    const e = obj(w['ends'], `${path}.ends`);
    const ends: HouseWall['ends'] = {};
    if (e['start'] !== undefined) ends.start = oneOf(e['start'], END_RULES, `${path}.ends.start`);
    if (e['end'] !== undefined) ends.end = oneOf(e['end'], END_RULES, `${path}.ends.end`);
    wall.ends = ends;
  }
  return wall;
}

/** Ponto em planta: `{ x, y }`, cada coordenada medida com sinal (número ou pés-pol). */
function point(v: unknown, path: string): Point {
  const p = obj(v, path);
  return { x: signed(p['x'], `${path}.x`), y: signed(p['y'], `${path}.y`) };
}

/** Campos comuns aos dois formatos de parede: tudo de `Wall` menos `length` e `layoutOrigin`. */
function wallCommon(w: Record<string, unknown>, path: string, config: Config): Omit<Wall, 'length' | 'layoutOrigin'> {
  const openingsRaw = w['openings'] ?? [];
  if (!Array.isArray(openingsRaw)) throw new ProjectError(`${path}.openings: esperado array`);
  const id = str(w['id'], `${path}.id`);
  const specs = openingsRaw.map((o, i) => openingSpecFrom(o, `${path}.openings[${i}]`));
  let openings;
  try {
    openings = resolveOpenings(specs, config, `parede ${id}`);
  } catch (e) {
    // Erros do catálogo (tag ou marca inexistente, RO ou posição sem como resolver) viram erro de projeto.
    throw new ProjectError(`${path}.openings: ${(e as Error).message}`);
  }
  const wall: Omit<Wall, 'length' | 'layoutOrigin'> = {
    id,
    height: positive(w['height'], `${path}.height`),
    section: oneOf(w['section'], WALL_SECTIONS, `${path}.section`),
    exterior: bool(w['exterior'], `${path}.exterior`),
    bearing: bool(w['bearing'], `${path}.bearing`),
    openings,
  };
  if (w['buildingWidth'] !== undefined) {
    wall.buildingWidth = positive(w['buildingWidth'], `${path}.buildingWidth`);
  }
  if (w['floorsSupported'] !== undefined) {
    const n = w['floorsSupported'];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
      throw new ProjectError(`${path}.floorsSupported: esperado inteiro ≥ 0, recebido ${show(n)}`);
    }
    wall.floorsSupported = n;
  }
  if (w['floorSpan'] !== undefined) wall.floorSpan = oneOf(w['floorSpan'], FLOOR_SPANS, `${path}.floorSpan`);
  if (w['extraStuds'] !== undefined) {
    const list = w['extraStuds'];
    if (!Array.isArray(list)) throw new ProjectError(`${path}.extraStuds: esperado array`);
    wall.extraStuds = list.map((e, i) => extraStudFrom(e, `${path}.extraStuds[${i}]`));
  }
  return wall;
}

function extraStudFrom(raw: unknown, path: string): ExtraStud {
  const e = obj(raw, path);
  const extra: ExtraStud = { x: measure(e['x'], `${path}.x`) };
  if (e['count'] !== undefined) extra.count = count(e['count'], `${path}.count`);
  if (e['label'] !== undefined) extra.label = str(e['label'], `${path}.label`);
  return extra;
}

/**
 * Abertura como o projeto a escreve (S12.5): `tag` + `center` + `headerMark` do catálogo, ou os campos
 * diretos `type`/`offset`/`roughWidth`/`roughHeight`/`header`. Quem resolve é `resolveOpenings` do core;
 * aqui só se valida o tipo de cada campo.
 */
function openingSpecFrom(raw: unknown, path: string): OpeningSpec {
  const o = obj(raw, path);
  const spec: OpeningSpec = { id: str(o['id'], `${path}.id`) };
  if (o['tag'] !== undefined) spec.tag = str(o['tag'], `${path}.tag`);
  if (o['type'] !== undefined) spec.type = oneOf(o['type'], OPENING_TYPES, `${path}.type`);
  if (o['center'] !== undefined) spec.center = measure(o['center'], `${path}.center`);
  if (o['offset'] !== undefined) spec.offset = measure(o['offset'], `${path}.offset`);
  if (o['roughWidth'] !== undefined) spec.roughWidth = positive(o['roughWidth'], `${path}.roughWidth`);
  if (o['roughHeight'] !== undefined) spec.roughHeight = positive(o['roughHeight'], `${path}.roughHeight`);
  if (o['headerMark'] !== undefined) spec.headerMark = str(o['headerMark'], `${path}.headerMark`);
  if (o['sillHeight'] !== undefined) spec.sillHeight = measure(o['sillHeight'], `${path}.sillHeight`);
  if (o['kingStuds'] !== undefined) spec.kingStuds = count(o['kingStuds'], `${path}.kingStuds`);
  if (o['jackStuds'] !== undefined) spec.jackStuds = count(o['jackStuds'], `${path}.jackStuds`);
  if (o['headerHeight'] !== undefined) spec.headerHeight = positive(o['headerHeight'], `${path}.headerHeight`);
  if (o['header'] !== undefined) {
    const h = obj(o['header'], `${path}.header`);
    const header: OpeningHeader = {
      section: headerSectionFrom(h['section'], `${path}.header.section`),
      plies: count(h['plies'], `${path}.header.plies`),
    };
    if (h['jackStuds'] !== undefined) header.jackStuds = count(h['jackStuds'], `${path}.header.jackStuds`);
    spec.header = header;
  }
  return spec;
}

/** Pré-cortes de stud: lista não vazia de medidas, ou uma medida só (vira lista de um). */
function precuts(v: unknown, path: string): number[] {
  if (!Array.isArray(v)) return [positive(v, path)];
  if (v.length === 0) throw new ProjectError(`${path}: esperado ao menos um pré-corte`);
  return v.map((p, i) => positive(p, `${path}[${i}]`));
}

// ---- primitivos -------------------------------------------------------------

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new ProjectError(`${path}: esperado objeto, recebido ${show(v)}`);
  }
  return v as Record<string, unknown>;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new ProjectError(`${path}: esperado texto não vazio, recebido ${show(v)}`);
  }
  return v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new ProjectError(`${path}: esperado true/false, recebido ${show(v)}`);
  return v;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new ProjectError(`${path}: esperado um de ${allowed.join(', ')}, recebido ${show(v)}`);
  }
  return v as T;
}

/** Medida ≥ 0 em polegadas: número decimal ou string pés-pol-fração. */
export function measure(v: unknown, path: string): number {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) throw new ProjectError(`${path}: medida inválida ${show(v)}`);
    return v;
  }
  if (typeof v === 'string') {
    try {
      return parseFeetInches(v);
    } catch {
      throw new ProjectError(`${path}: medida inválida ${show(v)} (use polegadas ou pés-pol, ex.: 12'-0")`);
    }
  }
  throw new ProjectError(`${path}: esperado medida (número ou texto), recebido ${show(v)}`);
}

/** Medida com sinal (ex.: `layoutOrigin`): número ou texto pés-pol, com `-` opcional na frente. */
function signed(v: unknown, path: string): number {
  if (typeof v === 'string' && v.trimStart().startsWith('-')) {
    return -measure(v.trimStart().slice(1), path);
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return measure(v, path);
}

function positive(v: unknown, path: string): number {
  const n = measure(v, path);
  if (n <= 0) throw new ProjectError(`${path}: esperado medida > 0, recebido ${show(v)}`);
  return n;
}

/** Carga em psf: número ≥ 0, sem conversão de unidade. */
function psf(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new ProjectError(`${path}: esperado carga em psf (número ≥ 0), recebido ${show(v)}`);
  }
  return v;
}

/** Velocidade de vento em mph: número > 0, sem conversão de unidade. */
function mph(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new ProjectError(`${path}: esperado velocidade de vento em mph (número > 0), recebido ${show(v)}`);
  }
  return v;
}

/** Inteiro ≥ 1 (plies, kings, jacks). */
function count(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new ProjectError(`${path}: esperado inteiro ≥ 1, recebido ${show(v)}`);
  }
  return v;
}

function show(v: unknown): string {
  if (v === undefined) return 'nada';
  const s = JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
}
