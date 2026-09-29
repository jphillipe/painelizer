/**
 * Saídas tabulares do CLI. CSV conforme RFC 4180: vírgula, campos com vírgula,
 * aspas ou quebra de linha entre aspas (aspas duplicadas), linhas com `\n`.
 * Notação pés-pol usa `"`, então praticamente toda coluna formatada sai entre aspas.
 *
 * Cada medida aparece duas vezes: decimal (`_in`, para planilha) e formatada
 * (para quem lê na serra). Nenhuma conta é feita aqui — os números vêm do core.
 */

import { bom, cutList, formatFeetInches, formatInches, type BomLine, type Panel } from 'core';

export function csvCell(value: string | number): string {
  const s = typeof value === 'number' ? String(value) : value;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

export const CUTLIST_HEADER = ['panel', 'role', 'section', 'length_in', 'length', 'qty'] as const;

/** Uma lista de corte por painel, concatenadas, na ordem dos painéis. */
export function cutListCsv(panels: readonly Panel[]): string {
  const rows: (string | number)[][] = [[...CUTLIST_HEADER]];
  for (const panel of panels) {
    for (const line of cutList(panel)) {
      rows.push([panel.id, line.role, line.section, line.length, formatInches(line.length), line.qty]);
    }
  }
  return toCsv(rows);
}

export const BOM_HEADER = [
  'section',
  'stock_length_in',
  'stock_length',
  'qty',
  'cut_total_in',
  'waste_in',
  'waste_percent',
] as const;

export function bomCsv(lines: readonly BomLine[]): string {
  const rows: (string | number)[][] = [[...BOM_HEADER]];
  for (const l of lines) {
    rows.push([
      l.section,
      l.stockLength,
      formatFeetInches(l.stockLength),
      l.qty,
      l.cutTotal,
      l.waste,
      l.wastePercent,
    ]);
  }
  return toCsv(rows);
}

/** BOM consolidada de todos os painéis do projeto. */
export function projectBom(panels: readonly Panel[], stockLengths?: readonly number[]): BomLine[] {
  return stockLengths ? bom(panels, stockLengths) : bom(panels);
}
