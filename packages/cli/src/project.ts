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
 *
 * A validação é estrutural (tipos e campos obrigatórios), com mensagem apontando o caminho do campo.
 * Regras de framing não são validadas aqui: isso é papel do core (S10).
 */

import {
  parseFeetInches,
  type Config,
  type Opening,
  type OpeningType,
  type Section,
  type Wall,
  type WallSection,
} from 'core';

export interface Project {
  name: string;
  config: Config;
  walls: Wall[];
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
  const walls = wallsRaw.map((w, i) => wallFrom(w, `${source}.walls[${i}]`));

  const ids = new Set<string>();
  for (const w of walls) {
    if (ids.has(w.id)) throw new ProjectError(`${source}.walls: id duplicado "${w.id}"`);
    ids.add(w.id);
  }

  const project: Project = { name, config, walls };
  if (root['stockLengths'] !== undefined) {
    const list = root['stockLengths'];
    if (!Array.isArray(list) || list.length === 0) {
      throw new ProjectError(`${source}.stockLengths: esperado array não vazio de medidas`);
    }
    project.stockLengths = list.map((v, i) => positive(v, `${source}.stockLengths[${i}]`));
  }
  return project;
}

function configFrom(raw: unknown, path: string): Config {
  const c = obj(raw, path);
  const config: Config = {
    studSpacing: positive(c['studSpacing'], `${path}.studSpacing`),
    studThickness: positive(c['studThickness'] ?? 1.5, `${path}.studThickness`),
    plateThickness: positive(c['plateThickness'] ?? 1.5, `${path}.plateThickness`),
    studLength: positive(c['studLength'], `${path}.studLength`),
  };
  if (c['headerHeight'] !== undefined) {
    config.headerHeight = positive(c['headerHeight'], `${path}.headerHeight`);
  }
  if (c['defaultHeaderSection'] !== undefined) {
    config.defaultHeaderSection = oneOf(c['defaultHeaderSection'], SECTIONS, `${path}.defaultHeaderSection`);
  }
  if (c['defaultHeaderPlies'] !== undefined) {
    const plies = c['defaultHeaderPlies'];
    if (typeof plies !== 'number' || !Number.isInteger(plies) || plies < 1) {
      throw new ProjectError(`${path}.defaultHeaderPlies: esperado inteiro ≥ 1, recebido ${show(plies)}`);
    }
    config.defaultHeaderPlies = plies;
  }
  return config;
}

function wallFrom(raw: unknown, path: string): Wall {
  const w = obj(raw, path);
  const openingsRaw = w['openings'] ?? [];
  if (!Array.isArray(openingsRaw)) throw new ProjectError(`${path}.openings: esperado array`);
  return {
    id: str(w['id'], `${path}.id`),
    length: positive(w['length'], `${path}.length`),
    height: positive(w['height'], `${path}.height`),
    section: oneOf(w['section'], WALL_SECTIONS, `${path}.section`),
    exterior: bool(w['exterior'], `${path}.exterior`),
    bearing: bool(w['bearing'], `${path}.bearing`),
    openings: openingsRaw.map((o, i) => openingFrom(o, `${path}.openings[${i}]`)),
  };
}

function openingFrom(raw: unknown, path: string): Opening {
  const o = obj(raw, path);
  return {
    id: str(o['id'], `${path}.id`),
    type: oneOf(o['type'], OPENING_TYPES, `${path}.type`),
    offset: measure(o['offset'], `${path}.offset`),
    roughWidth: positive(o['roughWidth'], `${path}.roughWidth`),
    roughHeight: positive(o['roughHeight'], `${path}.roughHeight`),
  };
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

function positive(v: unknown, path: string): number {
  const n = measure(v, path);
  if (n <= 0) throw new ProjectError(`${path}: esperado medida > 0, recebido ${show(v)}`);
  return n;
}

function show(v: unknown): string {
  if (v === undefined) return 'nada';
  const s = JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
}
