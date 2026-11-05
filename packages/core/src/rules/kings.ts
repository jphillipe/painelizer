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

import type { Exposure } from '../config';
import { EPS } from '../eps';
import { parseFeetInches } from '../units';
import { EngineError, engineerReasonText, type EngineerReason } from '../messages';
import type { RequiresEngineer } from './headers';
import { tableErrors } from './tableJson';
import rawIrcKings from '../data/irc-kings.json';

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

/** Resultado de `kingsFor`, discriminado por `requiresEngineer` (ausente na linha escolhida). */
export type KingChoice = (KingSpec & { requiresEngineer?: never }) | RequiresEngineer;

/** Escolhe o número de kings pela tabela. Ver regras no topo do arquivo. */
export function kingsFor(query: KingQuery, table: KingTable = ircKings()): KingChoice {
  const { span, windSpeed } = query;
  const exposure = query.exposure ?? 'B';
  if (!Number.isFinite(span) || span <= 0) throw new EngineError('VALUE_INVALID', {}, { field: 'span', value: span });
  if (!Number.isFinite(windSpeed) || windSpeed <= 0) throw new EngineError('VALUE_INVALID', {}, { field: 'windSpeed', value: windSpeed });
  if (!['B', 'C', 'D'].includes(exposure)) throw new EngineError('VALUE_INVALID', {}, { field: 'exposure', value: String(exposure) });

  const engineer = (detail: EngineerReason): KingChoice => ({ requiresEngineer: true, reason: engineerReasonText(detail), detail });

  const cols = table.columns
    .map((_c, i) => i)
    .filter((i) => table.columns[i]!.covers.some((w) => windCovers(w, windSpeed, exposure)));
  if (cols.length === 0) {
    return engineer({ why: 'wind', windSpeed, exposure, table: table.id });
  }

  const row = table.rows.find((r) => span <= r.maxSpan + EPS);
  if (row === undefined) {
    return engineer({ why: 'kingSpan', span, table: table.id });
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
  const { errors, err, isObj, keys } = tableErrors();

  if (!isObj(json) || !isObj(json.table)) return ['root: expected { table: {...} }'];
  const t = json.table;
  const tp = 'table';
  keys(tp, t, ['id', 'columns', 'rows']);
  if (typeof t.id !== 'string' || t.id === '') err(`${tp}.id`, 'expected non-empty text');

  const columns = Array.isArray(t.columns) ? t.columns : (err(`${tp}.columns`, 'expected a list'), []);
  if (columns.length === 0) err(`${tp}.columns`, 'no columns');
  columns.forEach((c, ci) => {
    const cp = `${tp}.columns[${ci}]`;
    if (!isObj(c)) return err(cp, 'expected an object');
    keys(cp, c, ['covers']);
    const covers = Array.isArray(c.covers) ? c.covers : (err(`${cp}.covers`, 'expected a list'), []);
    if (covers.length === 0) err(`${cp}.covers`, 'column with no wind condition');
    covers.forEach((w, wi) => {
      const wp = `${cp}.covers[${wi}]`;
      if (!isObj(w)) return err(wp, 'expected an object');
      keys(wp, w, ['exposure', 'below', 'upTo']);
      if (!EXPOSURES.includes(w.exposure)) err(`${wp}.exposure`, 'expected "B", "C" or "D"');
      const hasBelow = w.below !== undefined;
      const hasUpTo = w.upTo !== undefined;
      if (hasBelow === hasUpTo) err(wp, 'expected exactly one of below / upTo');
      for (const [k, v] of [
        ['below', w.below],
        ['upTo', w.upTo],
      ] as const) {
        if (v !== undefined && (typeof v !== 'number' || !(v > 0))) err(`${wp}.${k}`, 'expected mph > 0');
      }
    });
  });

  const rows = Array.isArray(t.rows) ? t.rows : (err(`${tp}.rows`, 'expected a list'), []);
  if (rows.length === 0) err(`${tp}.rows`, 'no rows');
  let prevSpan = 0;
  rows.forEach((r, ri) => {
    const rp = `${tp}.rows[${ri}]`;
    if (!isObj(r)) return err(rp, 'expected an object');
    keys(rp, r, ['maxSpan', 'kings']);
    if (typeof r.maxSpan !== 'string' || !SPAN_FORMAT.test(r.maxSpan)) {
      err(`${rp}.maxSpan`, `expected feet like "4'", got ${JSON.stringify(r.maxSpan)}`);
    } else {
      const span = parseFeetInches(r.maxSpan);
      if (span <= prevSpan) err(`${rp}.maxSpan`, 'spans must grow row by row');
      prevSpan = span;
    }
    if (!Array.isArray(r.kings)) return err(`${rp}.kings`, 'expected a list');
    if (r.kings.length !== columns.length) {
      err(`${rp}.kings`, `${r.kings.length} values for ${columns.length} columns`);
    }
    r.kings.forEach((k, ki) => {
      if (!Number.isInteger(k) || (k as number) < 1) err(`${rp}.kings[${ki}]`, `expected a whole number ≥ 1, got ${JSON.stringify(k)}`);
    });
  });
  return errors;
}

/** Converte o JSON digitado para polegadas. @throws RangeError com todos os erros de estrutura. */
export function loadKingTable(json: unknown): KingTable {
  const errors = validateKingTable(json);
  if (errors.length > 0) throw new RangeError(`invalid king stud table:\n${errors.join('\n')}`);
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
