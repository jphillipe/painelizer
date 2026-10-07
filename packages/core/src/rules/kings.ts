/**
 * Kings (studs de altura inteira em cada lado do header) pela Tabela R602.7.5 do IRC
 * (`src/data/irc-kings.json`) — parede externa, por vão do header e vento.
 *
 * Regras (docs/02-framing.md, 04-decisoes 2026-10-06):
 * - Coluna = a que atende a velocidade de vento (Vult, mph) e a exposição; se mais de uma atende
 *   (a de ≤ 115 mph B é um subconjunto da de < 140 mph B), vale a de menos kings.
 * - Linha = a de menor vão máximo ≥ span (nota a do livro: vão entre duas linhas usa a maior).
 * - Nunca extrapola: vento fora de todas as colunas ou vão acima da última linha →
 *   `{ requiresEngineer: true, reason }`.
 * - Exposição D não está na tabela → `requiresEngineer`.
 *
 * Entrada inválida lança `RangeError`. Tabela digitada com erro de estrutura também (`loadKingTable`).
 */

import type { Exposure } from '../types';
import { parseFeetInches } from '../units';
import rawIrcKings from '../data/irc-kings.json';

/** Folga numérica para comparar vão pedido com vão de tabela. */
const EPS = 1e-9;

/** Condição de vento que uma coluna atende: `windSpeed < below` ou `windSpeed ≤ upTo`, na exposição dada. */
export interface WindCondition {
  exposure: Exposure;
  below?: number;
  upTo?: number;
}

export interface KingColumn {
  covers: WindCondition[];
}

export interface KingRow {
  /** Vão máximo do header, em polegadas. */
  maxSpan: number;
  /** Kings por lado, um valor por coluna. */
  kings: number[];
}

export interface KingTable {
  id: string;
  columns: KingColumn[];
  rows: KingRow[];
}

export interface KingQuery {
  /** Vão do header = largura do RO, em polegadas. */
  span: number;
  /** Velocidade básica de vento Vult, mph. */
  windSpeed: number;
  /** Ausente = B. */
  exposure?: Exposure;
}

export interface KingSpec {
  /** Kings de cada lado. */
  kings: number;
  /** Vão máximo da linha usada, em polegadas. */
  maxSpan: number;
  table: string;
}

export type KingChoice = KingSpec | { requiresEngineer: true; reason: string };

/** Escolhe o número de kings pela tabela. Ver regras no topo do arquivo. */
export function kingsFor(query: KingQuery, table: KingTable = ircKings()): KingChoice {
  const { span, windSpeed } = query;
  const exposure = query.exposure ?? 'B';
  if (!Number.isFinite(span) || span <= 0) throw new RangeError(`span inválido (${span})`);
  if (!Number.isFinite(windSpeed) || windSpeed <= 0) throw new RangeError(`windSpeed inválido (${windSpeed})`);
  if (!['B', 'C', 'D'].includes(exposure)) throw new RangeError(`exposure inválida (${String(exposure)})`);

  const engineer = (reason: string): KingChoice => ({ requiresEngineer: true, reason });

  const cols = table.columns
    .map((c, i) => i)
    .filter((i) => table.columns[i]!.covers.some((w) => windCovers(w, windSpeed, exposure)));
  if (cols.length === 0) {
    return engineer(`vento ${windSpeed} mph, exposição ${exposure}, fora da tabela ${table.id}`);
  }

  const row = table.rows.find((r) => span <= r.maxSpan + EPS);
  if (row === undefined) {
    return engineer(`vão ${span}" acima da última linha da tabela ${table.id}`);
  }

  const kings = Math.min(...cols.map((i) => row.kings[i]!));
  return { kings, maxSpan: row.maxSpan, table: table.id };
}

function windCovers(w: WindCondition, windSpeed: number, exposure: Exposure): boolean {
  if (w.exposure !== exposure) return false;
  if (w.below !== undefined) return windSpeed < w.below - EPS;
  if (w.upTo !== undefined) return windSpeed <= w.upTo + EPS;
  return false;
}

// ---------------------------------------------------------------------------------------------------
// Leitura do JSON digitado

const SPAN_FORMAT = /^\d+'$/;
const EXPOSURES: readonly unknown[] = ['B', 'C', 'D'];

/**
 * Erros de estrutura do JSON de kings, com o caminho do campo. Lista vazia = estrutura válida.
 * Coerência dos valores (kings não caem com o vão etc.) é conferida nos testes.
 */
export function validateKingTable(json: unknown): string[] {
  const errors: string[] = [];
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`);
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const keys = (path: string, o: Record<string, unknown>, allowed: string[]) => {
    for (const k of Object.keys(o)) if (!k.startsWith('$') && !allowed.includes(k)) err(path, `campo desconhecido "${k}"`);
  };

  if (!isObj(json) || !isObj(json.table)) return ['raiz: esperado { table: {...} }'];
  const t = json.table;
  const tp = 'table';
  keys(tp, t, ['id', 'columns', 'rows']);
  if (typeof t.id !== 'string' || t.id === '') err(`${tp}.id`, 'esperado texto não vazio');

  const columns = Array.isArray(t.columns) ? t.columns : (err(`${tp}.columns`, 'esperado lista'), []);
  if (columns.length === 0) err(`${tp}.columns`, 'nenhuma coluna');
  columns.forEach((c, ci) => {
    const cp = `${tp}.columns[${ci}]`;
    if (!isObj(c)) return err(cp, 'esperado objeto');
    keys(cp, c, ['covers']);
    const covers = Array.isArray(c.covers) ? c.covers : (err(`${cp}.covers`, 'esperado lista'), []);
    if (covers.length === 0) err(`${cp}.covers`, 'coluna sem condição de vento');
    covers.forEach((w, wi) => {
      const wp = `${cp}.covers[${wi}]`;
      if (!isObj(w)) return err(wp, 'esperado objeto');
      keys(wp, w, ['exposure', 'below', 'upTo']);
      if (!EXPOSURES.includes(w.exposure)) err(`${wp}.exposure`, 'esperado "B", "C" ou "D"');
      const hasBelow = w.below !== undefined;
      const hasUpTo = w.upTo !== undefined;
      if (hasBelow === hasUpTo) err(wp, 'esperado exatamente um de below / upTo');
      for (const [k, v] of [
        ['below', w.below],
        ['upTo', w.upTo],
      ] as const) {
        if (v !== undefined && (typeof v !== 'number' || !(v > 0))) err(`${wp}.${k}`, 'esperado mph > 0');
      }
    });
  });

  const rows = Array.isArray(t.rows) ? t.rows : (err(`${tp}.rows`, 'esperado lista'), []);
  if (rows.length === 0) err(`${tp}.rows`, 'nenhuma linha');
  let prevSpan = 0;
  rows.forEach((r, ri) => {
    const rp = `${tp}.rows[${ri}]`;
    if (!isObj(r)) return err(rp, 'esperado objeto');
    keys(rp, r, ['maxSpan', 'kings']);
    if (typeof r.maxSpan !== 'string' || !SPAN_FORMAT.test(r.maxSpan)) {
      err(`${rp}.maxSpan`, `esperado pés como "4'", veio ${JSON.stringify(r.maxSpan)}`);
    } else {
      const span = parseFeetInches(r.maxSpan);
      if (span <= prevSpan) err(`${rp}.maxSpan`, 'vãos devem crescer linha a linha');
      prevSpan = span;
    }
    if (!Array.isArray(r.kings)) return err(`${rp}.kings`, 'esperado lista');
    if (r.kings.length !== columns.length) {
      err(`${rp}.kings`, `${r.kings.length} valores para ${columns.length} colunas`);
    }
    r.kings.forEach((k, ki) => {
      if (!Number.isInteger(k) || (k as number) < 1) err(`${rp}.kings[${ki}]`, `inteiro ≥ 1, veio ${JSON.stringify(k)}`);
    });
  });
  return errors;
}

/** Converte o JSON digitado para polegadas. @throws RangeError com todos os erros de estrutura. */
export function loadKingTable(json: unknown): KingTable {
  const errors = validateKingTable(json);
  if (errors.length > 0) throw new RangeError(`tabela de kings inválida:\n${errors.join('\n')}`);
  type Raw = {
    id: string;
    columns: { covers: WindCondition[] }[];
    rows: { maxSpan: string; kings: number[] }[];
  };
  const t = (json as { table: Raw }).table;
  return {
    id: t.id,
    columns: t.columns.map((c) => ({
      covers: c.covers.map((w) => ({
        exposure: w.exposure,
        ...(w.below === undefined ? {} : { below: w.below }),
        ...(w.upTo === undefined ? {} : { upTo: w.upTo }),
      })),
    })),
    rows: t.rows.map((r) => ({ maxSpan: parseFeetInches(r.maxSpan), kings: [...r.kings] })),
  };
}

let cache: KingTable | undefined;

/** Tabela R602.7.5 de `src/data/irc-kings.json`, convertida na primeira chamada. */
export function ircKings(): KingTable {
  cache ??= loadKingTable(rawIrcKings);
  return cache;
}
