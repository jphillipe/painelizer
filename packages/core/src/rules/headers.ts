/**
 * Header por tabela IRC R602.7 (`src/data/irc-headers.json`) — fallback quando o projeto não
 * especifica o header (P10).
 *
 * Regras (docs/02-framing.md, 04-decisoes 2026-10-02):
 * - Parede não portante não consulta tabela: devolve `{ nonBearing: true }` (P17).
 * - Tabela pela parede (externa / interna). Coluna = a de menor neve ≥ `groundSnowLoad` e, entre essas,
 *   a de menor largura ≥ `buildingWidth`. Nunca interpola nem extrapola: valor acima da última coluna,
 *   pavimentos sem grupo ou vão acima de todos os headers → `{ requiresEngineer: true }`.
 * - Sem `floorSpan`, vale o pior caso: o header precisa atender todos os grupos com aquele número de
 *   pavimentos; vão máximo = o menor, jacks = o maior.
 * - Entre os headers que atendem: 2 plies de menor altura de seção; se nenhum de 2 plies atende, 3 plies,
 *   depois 4 — padrão de fabricação (P17, respondida em 2026-10-05). Header de 1 ply nunca é escolhido.
 *   Com `wallSection`, header mais espesso que a parede (plies·1.5 > profundidade) é descartado.
 *
 * Entrada inválida lança `RangeError`. Tabela digitada com erro de estrutura também (`loadHeaderTables`).
 */

import type { FloorSpan, Section, WallSection } from '../types';
import { NOMINAL_2X_THICKNESS, SECTION_DEPTH, sectionDepth } from '../types';
import { parseFeetInches } from '../units';
import rawIrcHeaders from '../data/irc-headers.json';

/** Folga numérica para comparar vão pedido com vão de tabela. */
const EPS = 1e-9;

/** Header escolhido pela tabela tem ao menos 2 plies (padrão de fabricação, P17). */
const MIN_PLIES = 2;

export interface HeaderCell {
  /** Vão máximo do header, em polegadas. */
  maxSpan: number;
  /** NJ da tabela: jack studs em cada apoio. */
  jackStuds: number;
}

export interface HeaderColumn {
  /** psf; só na tabela externa. */
  groundSnowLoad?: number;
  /** Largura da edificação, em polegadas. */
  buildingWidth: number;
}

export interface HeaderRow {
  section: Section;
  plies: number;
  /** Uma por coluna; `null` = não permitido ("—" no livro). */
  cells: (HeaderCell | null)[];
}

export interface HeaderGroup {
  floors: number;
  floorSpan?: FloorSpan;
  rows: HeaderRow[];
}

export interface HeaderTable {
  id: string;
  exterior: boolean;
  columns: HeaderColumn[];
  groups: HeaderGroup[];
}

export interface HeaderQuery {
  /** Vão do header = largura do RO, em polegadas. */
  span: number;
  exterior: boolean;
  bearing: boolean;
  /** Largura da edificação, em polegadas. */
  buildingWidth: number;
  /** Carga de neve no solo, psf. Obrigatória em parede externa portante. */
  groundSnowLoad?: number;
  /** Pavimentos suportados (0 = só telhado e forro). */
  floorsSupported: number;
  /** Ausente = pior caso entre os grupos. */
  floorSpan?: FloorSpan;
  /** Se informada, descarta header mais espesso que a parede. */
  wallSection?: WallSection;
}

export interface HeaderSpec {
  section: Section;
  plies: number;
  jackStuds: number;
  /** Vão máximo da tabela para o header escolhido, em polegadas. */
  maxSpan: number;
  /** Tabela de origem (ex.: "R602.7(1)"). */
  table: string;
}

export type HeaderChoice = HeaderSpec | { requiresEngineer: true; reason: string } | { nonBearing: true };

/** Escolhe o header pela tabela. Ver regras no topo do arquivo. */
export function headerFor(query: HeaderQuery, tables: readonly HeaderTable[] = ircHeaders()): HeaderChoice {
  const { span, exterior, bearing, buildingWidth, groundSnowLoad, floorsSupported, floorSpan, wallSection } =
    query;
  if (!Number.isFinite(span) || span <= 0) throw new RangeError(`span inválido (${span})`);
  if (!Number.isFinite(buildingWidth) || buildingWidth <= 0) {
    throw new RangeError(`buildingWidth inválido (${buildingWidth})`);
  }
  if (!Number.isInteger(floorsSupported) || floorsSupported < 0) {
    throw new RangeError(`floorsSupported inválido (${floorsSupported})`);
  }
  if (!bearing) return { nonBearing: true };
  if (exterior && groundSnowLoad === undefined) {
    throw new RangeError('groundSnowLoad é obrigatório em parede externa portante');
  }
  if (groundSnowLoad !== undefined && (!Number.isFinite(groundSnowLoad) || groundSnowLoad < 0)) {
    throw new RangeError(`groundSnowLoad inválido (${groundSnowLoad})`);
  }

  const engineer = (reason: string): HeaderChoice => ({ requiresEngineer: true, reason });
  const table = tables.find((t) => t.exterior === exterior);
  if (!table) return engineer(`sem tabela de header para parede ${exterior ? 'externa' : 'interna'}`);

  const col = pickColumn(table, buildingWidth, exterior ? groundSnowLoad : undefined);
  if (col === undefined) {
    return engineer(
      `largura ${buildingWidth}"` +
        (exterior ? ` com neve ${groundSnowLoad} psf` : '') +
        ` fora da tabela ${table.id}`,
    );
  }

  const groups = table.groups.filter(
    (g) =>
      g.floors === floorsSupported &&
      (floorSpan === undefined || g.floorSpan === undefined || g.floorSpan === floorSpan),
  );
  if (groups.length === 0) {
    return engineer(
      `${floorsSupported} pavimento(s)${floorSpan ? ` (${floorSpan})` : ''} sem grupo na tabela ${table.id}`,
    );
  }

  const maxPlies =
    wallSection === undefined ? Infinity : Math.floor(sectionDepth(wallSection) / NOMINAL_2X_THICKNESS + EPS);
  const candidates: HeaderSpec[] = [];
  for (const row of groups[0]!.rows) {
    if (row.plies < MIN_PLIES || row.plies > maxPlies) continue;
    let maxSpan = Infinity;
    let jackStuds = 0;
    for (const g of groups) {
      const cell = g.rows.find((r) => r.section === row.section && r.plies === row.plies)?.cells[col];
      if (!cell) {
        maxSpan = -Infinity;
        break;
      }
      maxSpan = Math.min(maxSpan, cell.maxSpan);
      jackStuds = Math.max(jackStuds, cell.jackStuds);
    }
    if (span <= maxSpan + EPS) {
      candidates.push({ section: row.section, plies: row.plies, jackStuds, maxSpan, table: table.id });
    }
  }
  candidates.sort((a, b) => a.plies - b.plies || SECTION_DEPTH[a.section] - SECTION_DEPTH[b.section]);
  const best = candidates[0];
  if (!best) {
    return engineer(
      `vão ${span}" acima de todos os headers da tabela ${table.id}` +
        (wallSection === undefined ? '' : ` que cabem em parede ${wallSection}`),
    );
  }
  return best;
}

/** Índice da coluna: menor neve ≥ pedida, depois menor largura ≥ pedida. `undefined` = fora da tabela. */
function pickColumn(table: HeaderTable, buildingWidth: number, groundSnowLoad: number | undefined) {
  let best: number | undefined;
  table.columns.forEach((c, i) => {
    if (c.buildingWidth < buildingWidth - EPS) return;
    if (groundSnowLoad !== undefined && (c.groundSnowLoad ?? -Infinity) < groundSnowLoad - EPS) return;
    if (best === undefined) {
      best = i;
      return;
    }
    const b = table.columns[best]!;
    const snowDiff = (c.groundSnowLoad ?? 0) - (b.groundSnowLoad ?? 0);
    if (snowDiff < 0 || (snowDiff === 0 && c.buildingWidth < b.buildingWidth)) best = i;
  });
  return best;
}

// ---------------------------------------------------------------------------------------------------
// Leitura do JSON digitado

const SPAN_FORMAT = /^\d+'-(\d+)$/;
const WIDTH_FORMAT = /^\d+'$/;
const FLOOR_SPANS: readonly unknown[] = ['center', 'clear'];

/**
 * Erros de estrutura do JSON de headers, com o caminho do campo (`tables[0].groups[1].headers[2].cells[3]`).
 * Lista vazia = estrutura válida. Coerência dos valores (vão cresce com a seção etc.) é conferida nos testes.
 */
export function validateHeaderTables(json: unknown): string[] {
  const errors: string[] = [];
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`);
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const keys = (path: string, o: Record<string, unknown>, allowed: string[]) => {
    for (const k of Object.keys(o)) if (!k.startsWith('$') && !allowed.includes(k)) err(path, `campo desconhecido "${k}"`);
  };
  const posInt = (v: unknown) => Number.isInteger(v) && (v as number) >= 1;

  if (!isObj(json) || !Array.isArray(json.tables)) return ['raiz: esperado { tables: [...] }'];
  const seenExterior = new Set<boolean>();
  json.tables.forEach((t, ti) => {
    const tp = `tables[${ti}]`;
    if (!isObj(t)) return err(tp, 'esperado objeto');
    keys(tp, t, ['id', 'exterior', 'columns', 'groups']);
    if (typeof t.id !== 'string' || t.id === '') err(`${tp}.id`, 'esperado texto não vazio');
    if (typeof t.exterior !== 'boolean') err(`${tp}.exterior`, 'esperado true/false');
    else if (seenExterior.has(t.exterior)) err(`${tp}.exterior`, 'duas tabelas para o mesmo tipo de parede');
    else seenExterior.add(t.exterior);

    const columns = Array.isArray(t.columns) ? t.columns : (err(`${tp}.columns`, 'esperado lista'), []);
    const seenCols = new Set<string>();
    columns.forEach((c, ci) => {
      const cp = `${tp}.columns[${ci}]`;
      if (!isObj(c)) return err(cp, 'esperado objeto');
      keys(cp, c, ['groundSnowLoad', 'buildingWidth']);
      if (typeof c.buildingWidth !== 'string' || !WIDTH_FORMAT.test(c.buildingWidth)) {
        err(`${cp}.buildingWidth`, `esperado pés como "12'", veio ${JSON.stringify(c.buildingWidth)}`);
      }
      if (t.exterior === true) {
        if (typeof c.groundSnowLoad !== 'number' || !(c.groundSnowLoad > 0)) {
          err(`${cp}.groundSnowLoad`, 'tabela externa: esperado psf > 0');
        }
      } else if (c.groundSnowLoad !== undefined) {
        err(`${cp}.groundSnowLoad`, 'tabela interna não tem neve');
      }
      const key = `${c.groundSnowLoad}|${c.buildingWidth}`;
      if (seenCols.has(key)) err(cp, 'coluna repetida');
      seenCols.add(key);
    });

    const groups = Array.isArray(t.groups) ? t.groups : (err(`${tp}.groups`, 'esperado lista'), []);
    const seenGroups = new Set<string>();
    groups.forEach((g, gi) => {
      const gp = `${tp}.groups[${gi}]`;
      if (!isObj(g)) return err(gp, 'esperado objeto');
      keys(gp, g, ['supports', 'headers']);
      const s = g.supports;
      if (!isObj(s)) err(`${gp}.supports`, 'esperado objeto');
      else {
        keys(`${gp}.supports`, s, ['floors', 'floorSpan']);
        if (!Number.isInteger(s.floors) || (s.floors as number) < 0) err(`${gp}.supports.floors`, 'esperado inteiro ≥ 0');
        if (s.floorSpan !== undefined && !FLOOR_SPANS.includes(s.floorSpan)) {
          err(`${gp}.supports.floorSpan`, `esperado "center" ou "clear"`);
        }
        if (s.floors === 0 && s.floorSpan !== undefined) err(`${gp}.supports.floorSpan`, 'sem pavimento não tem floorSpan');
        const key = `${s.floors}|${s.floorSpan}`;
        if (seenGroups.has(key)) err(`${gp}.supports`, 'grupo repetido');
        seenGroups.add(key);
      }

      const headers = Array.isArray(g.headers) ? g.headers : (err(`${gp}.headers`, 'esperado lista'), []);
      const seenRows = new Set<string>();
      headers.forEach((h, hi) => {
        const hp = `${gp}.headers[${hi}]`;
        if (!isObj(h)) return err(hp, 'esperado objeto');
        keys(hp, h, ['plies', 'section', 'cells']);
        if (!posInt(h.plies)) err(`${hp}.plies`, 'esperado inteiro ≥ 1');
        if (typeof h.section !== 'string' || !(h.section in SECTION_DEPTH)) {
          err(`${hp}.section`, `seção desconhecida ${JSON.stringify(h.section)}`);
        }
        const key = `${h.plies}-${h.section}`;
        if (seenRows.has(key)) err(hp, `linha ${key} repetida`);
        seenRows.add(key);
        if (!Array.isArray(h.cells)) return err(`${hp}.cells`, 'esperado lista');
        if (h.cells.length !== columns.length) {
          err(`${hp}.cells`, `${h.cells.length} células para ${columns.length} colunas`);
        }
        h.cells.forEach((cell, ci) => {
          const cp = `${hp}.cells[${ci}]`;
          if (cell === null) return;
          if (!Array.isArray(cell) || cell.length !== 2) return err(cp, 'esperado [vão, NJ] ou null');
          const [spanText, nj] = cell as unknown[];
          const m = typeof spanText === 'string' ? SPAN_FORMAT.exec(spanText) : null;
          if (!m || Number(m[1]) >= 12) err(cp, `vão como "3'-6", veio ${JSON.stringify(spanText)}`);
          else if (parseFeetInches(spanText as string) <= 0) err(cp, 'vão zero');
          if (!posInt(nj)) err(cp, `NJ inteiro ≥ 1, veio ${JSON.stringify(nj)}`);
        });
      });
    });
  });
  return errors;
}

/** Converte o JSON digitado para polegadas. @throws RangeError com todos os erros de estrutura. */
export function loadHeaderTables(json: unknown): HeaderTable[] {
  const errors = validateHeaderTables(json);
  if (errors.length > 0) throw new RangeError(`tabela de headers inválida:\n${errors.join('\n')}`);
  type Raw = {
    id: string;
    exterior: boolean;
    columns: { groundSnowLoad?: number; buildingWidth: string }[];
    groups: {
      supports: { floors: number; floorSpan?: FloorSpan };
      headers: { plies: number; section: Section; cells: ([string, number] | null)[] }[];
    }[];
  };
  return (json as { tables: Raw[] }).tables.map((t) => ({
    id: t.id,
    exterior: t.exterior,
    columns: t.columns.map((c) => ({
      ...(c.groundSnowLoad === undefined ? {} : { groundSnowLoad: c.groundSnowLoad }),
      buildingWidth: parseFeetInches(c.buildingWidth),
    })),
    groups: t.groups.map((g) => ({
      floors: g.supports.floors,
      ...(g.supports.floorSpan === undefined ? {} : { floorSpan: g.supports.floorSpan }),
      rows: g.headers.map((h) => ({
        section: h.section,
        plies: h.plies,
        cells: h.cells.map((c) => (c === null ? null : { maxSpan: parseFeetInches(c[0]), jackStuds: c[1] })),
      })),
    })),
  }));
}

let cache: HeaderTable[] | undefined;

/**
 * Tabelas IRC de `src/data/irc-headers.json`, convertidas na primeira chamada (não na importação: erro de
 * digitação não derruba quem importa o core sem usar headers).
 */
export function ircHeaders(): readonly HeaderTable[] {
  cache ??= loadHeaderTables(rawIrcHeaders);
  return cache;
}
