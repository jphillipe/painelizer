/**
 * Coerência interna das tabelas de header (S9, passada 1): pega erro de digitação comparando células
 * que o código garante estarem em ordem. Cada função devolve mensagens; lista vazia = coerente.
 *
 * "a ≥ b" com células: `null` (não permitido) só pode aparecer do lado mais carregado ou menor;
 * `null` no lado que deveria ser maior com valor no outro é erro.
 */

import type { HeaderCell, HeaderGroup, HeaderRow, HeaderTable } from '../../src/rules/headers';
import { SECTION_DEPTH } from '../../src/types';

const fmt = (c: HeaderCell | null) => (c === null ? '—' : `${c.maxSpan}"`);
const rowName = (r: HeaderRow) => `${r.plies}-${r.section}`;
const groupName = (g: HeaderGroup) => `${g.floors} pav.${g.floorSpan ? ` ${g.floorSpan}` : ''}`;
const colName = (t: HeaderTable, i: number) => {
  const c = t.columns[i]!;
  return `col ${i} (${c.groundSnowLoad === undefined ? '' : `${c.groundSnowLoad} psf, `}${c.buildingWidth}")`;
};

/** Mensagem se o vão de `big` for menor que o de `small` (ver regra de `null` no topo). */
function spanAtLeast(big: HeaderCell | null, small: HeaderCell | null, where: string): string[] {
  if (small === null) return [];
  if (big === null) return [`${where}: — onde deveria haver vão ≥ ${fmt(small)}`];
  return big.maxSpan < small.maxSpan ? [`${where}: ${fmt(big)} < ${fmt(small)}`] : [];
}

/** Pares consecutivos de uma lista já ordenada. */
function pairs<T>(xs: T[]): [T, T][] {
  return xs.slice(1).map((x, i) => [xs[i]!, x]);
}

/** Mesmo grupo, mesmos plies, mesma coluna: vão não diminui com a altura da seção. */
export function spanGrowsWithSection(t: HeaderTable): string[] {
  const out: string[] = [];
  for (const g of t.groups) {
    for (const plies of new Set(g.rows.map((r) => r.plies))) {
      const rows = g.rows.filter((r) => r.plies === plies).sort((a, b) => SECTION_DEPTH[a.section] - SECTION_DEPTH[b.section]);
      for (const [a, b] of pairs(rows)) {
        t.columns.forEach((_, i) => {
          out.push(...spanAtLeast(b.cells[i] ?? null, a.cells[i] ?? null, `${t.id} ${groupName(g)} ${colName(t, i)} ${rowName(b)} vs ${rowName(a)}`));
        });
      }
    }
  }
  return out;
}

/** Mesmo grupo, mesma seção, mesma coluna: vão não diminui com mais plies. */
export function spanGrowsWithPlies(t: HeaderTable): string[] {
  const out: string[] = [];
  for (const g of t.groups) {
    for (const section of new Set(g.rows.map((r) => r.section))) {
      const rows = g.rows.filter((r) => r.section === section).sort((a, b) => a.plies - b.plies);
      for (const [a, b] of pairs(rows)) {
        t.columns.forEach((_, i) => {
          out.push(...spanAtLeast(b.cells[i] ?? null, a.cells[i] ?? null, `${t.id} ${groupName(g)} ${colName(t, i)} ${rowName(b)} vs ${rowName(a)}`));
        });
      }
    }
  }
  return out;
}

/** Mesma linha: vão não aumenta com mais neve (mesma largura) nem com mais largura (mesma neve). */
export function spanFallsWithLoad(t: HeaderTable): string[] {
  const out: string[] = [];
  const cols = t.columns.map((c, i) => ({ ...c, i }));
  const byKey = (key: (c: (typeof cols)[number]) => number | undefined, sortBy: (c: (typeof cols)[number]) => number) => {
    const buckets = new Map<number | undefined, typeof cols>();
    for (const c of cols) buckets.set(key(c), [...(buckets.get(key(c)) ?? []), c]);
    return [...buckets.values()].map((b) => b.sort((x, y) => sortBy(x) - sortBy(y)));
  };
  const series = [
    ...byKey((c) => c.buildingWidth, (c) => c.groundSnowLoad ?? 0), // neve crescente
    ...byKey((c) => c.groundSnowLoad, (c) => c.buildingWidth), // largura crescente
  ];
  for (const g of t.groups) {
    for (const r of g.rows) {
      for (const s of series) {
        for (const [light, heavy] of pairs(s)) {
          out.push(
            ...spanAtLeast(r.cells[light.i] ?? null, r.cells[heavy.i] ?? null, `${t.id} ${groupName(g)} ${rowName(r)} ${colName(t, light.i)} vs ${colName(t, heavy.i)}`),
          );
        }
      }
    }
  }
  return out;
}

/**
 * Mesma linha e coluna: vão não aumenta com mais pavimentos (mesmo floorSpan; 0 pavimento compara com
 * todos) e, com o mesmo número de pavimentos, clear span ≤ center-bearing.
 */
export function spanFallsWithFloors(t: HeaderTable): string[] {
  const out: string[] = [];
  const compare = (light: HeaderGroup, heavy: HeaderGroup) => {
    for (const r of heavy.rows) {
      const l = light.rows.find((x) => x.section === r.section && x.plies === r.plies);
      if (!l) continue;
      t.columns.forEach((_, i) => {
        out.push(...spanAtLeast(l.cells[i] ?? null, r.cells[i] ?? null, `${t.id} ${rowName(r)} ${colName(t, i)} ${groupName(light)} vs ${groupName(heavy)}`));
      });
    }
  };
  for (const a of t.groups) {
    for (const b of t.groups) {
      if (a.floors < b.floors && (a.floors === 0 || a.floorSpan === b.floorSpan)) compare(a, b);
      if (a.floors === b.floors && a.floorSpan === 'center' && b.floorSpan === 'clear') compare(a, b);
    }
  }
  return out;
}

/** Mesmo grupo, mesmos plies, mesma coluna: NJ não diminui quando a seção (e o vão) aumenta. */
export function jacksGrowWithSection(t: HeaderTable): string[] {
  const out: string[] = [];
  for (const g of t.groups) {
    for (const plies of new Set(g.rows.map((r) => r.plies))) {
      const rows = g.rows.filter((r) => r.plies === plies).sort((a, b) => SECTION_DEPTH[a.section] - SECTION_DEPTH[b.section]);
      for (const [a, b] of pairs(rows)) {
        t.columns.forEach((_, i) => {
          const ca = a.cells[i] ?? null;
          const cb = b.cells[i] ?? null;
          if (ca && cb && cb.jackStuds < ca.jackStuds) {
            out.push(`${t.id} ${groupName(g)} ${colName(t, i)}: NJ ${rowName(b)} = ${cb.jackStuds} < ${rowName(a)} = ${ca.jackStuds}`);
          }
        });
      }
    }
  }
  return out;
}

/** O livro lista os mesmos tamanhos em todas as condições de carga: linha ausente num grupo = esquecida. */
export function sameRowsInEveryGroup(t: HeaderTable): string[] {
  const all = new Set(t.groups.flatMap((g) => g.rows.map(rowName)));
  return t.groups.flatMap((g) => {
    const here = new Set(g.rows.map(rowName));
    return [...all].filter((r) => !here.has(r)).map((r) => `${t.id} ${groupName(g)}: falta a linha ${r}`);
  });
}

/** Todas as conferências. */
export function headerTableIssues(t: HeaderTable): string[] {
  return [
    ...sameRowsInEveryGroup(t),
    ...spanGrowsWithSection(t),
    ...spanGrowsWithPlies(t),
    ...spanFallsWithLoad(t),
    ...spanFallsWithFloors(t),
    ...jacksGrowWithSection(t),
  ];
}
