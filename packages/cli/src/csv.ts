/**
 * Saídas tabulares do CLI. CSV conforme RFC 4180: vírgula, campos com vírgula,
 * aspas ou quebra de linha entre aspas (aspas duplicadas), linhas com `\n`.
 * Notação pés-pol usa `"`, então praticamente toda coluna formatada sai entre aspas.
 *
 * Cada medida aparece duas vezes: decimal (`_in`, para planilha) e formatada
 * (para quem lê na serra). Nenhuma conta é feita aqui — os números vêm do core.
 */

import {
  bom,
  cutList,
  DEFAULT_STOCK_LENGTHS,
  formatFeetInches,
  formatInches,
  piecesOf,
  type BomLine,
  type Cost,
  type Panel,
  type SheathingBomLine,
} from 'core';

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
  'stock_type',
  'stock_length_in',
  'stock_length',
  'qty',
  'cut_total_in',
  'waste_in',
  'waste_percent',
] as const;

/**
 * `stock_type` é `precut` (pré-corte de stud, P9), `commercial`, `engineered` (LVL/PSL comprado no
 * comprimento da peça, S12.5) ou `oversize` (peça serrada acima do maior comercial, que o motor não emendou —
 * S15). Pré-corte, engenheirado e oversize saem formatados só em polegadas (`92 5/8"`, como a fábrica os
 * chama); o comercial, em pés (`8'-0"`).
 *
 * Chapas de sheathing (S38) vêm depois da madeira, uma linha por chapa inteira: `section` = `sheathing 7/16"`,
 * `stock_type` = `sheet`, `stock_length_in` = a altura da chapa, `stock_length` = `48" x 96"`, `qty` = chapas
 * (uma por pedaço, sem aproveitamento de sobra), `cut_total_in`/`waste_in` vazios (a medida da chapa é área) e
 * `waste_percent` pela área. Sem chapa, o arquivo sai como antes.
 */
export function bomCsv(lines: readonly BomLine[], sheathing: readonly SheathingBomLine[] = []): string {
  const rows: (string | number)[][] = [[...BOM_HEADER]];
  for (const l of lines) {
    rows.push([
      l.section,
      l.kind,
      l.stockLength,
      l.kind === 'commercial' ? formatFeetInches(l.stockLength) : formatInches(l.stockLength),
      l.qty,
      l.cutTotal,
      l.waste,
      l.wastePercent,
    ]);
  }
  for (const s of sheathing) {
    rows.push([
      `sheathing ${formatInches(s.thickness)}`,
      'sheet',
      s.height,
      `${formatInches(s.width)} x ${formatInches(s.height)}`,
      s.qty,
      '',
      '',
      s.wastePercent,
    ]);
  }
  return toCsv(rows);
}

export const COST_HEADER = [
  'section',
  'stock_type',
  'stock_length_in',
  'stock_length',
  'qty',
  'unit_price',
  'cost',
  'price_source',
] as const;

/**
 * Orçamento (S31): as linhas da BOM com preço unitário, custo e de onde veio o preço (`each` = por peça do
 * comprimento, `perFoot` = por pé linear, `none` = sem preço na tabela, células vazias e fora do total). A última
 * linha é `TOTAL`, com a soma na coluna `cost` e, em `price_source`, quantas linhas ficaram sem preço.
 */
export function costCsv(cost: Cost): string {
  const rows: (string | number)[][] = [[...COST_HEADER]];
  for (const l of cost.lines) {
    rows.push([
      l.section,
      l.kind,
      l.stockLength,
      l.kind === 'commercial' ? formatFeetInches(l.stockLength) : formatInches(l.stockLength),
      l.qty,
      l.unitPrice === undefined ? '' : l.unitPrice.toFixed(2),
      l.cost === undefined ? '' : l.cost.toFixed(2),
      l.source ?? 'none',
    ]);
  }
  rows.push(['TOTAL', '', '', '', '', '', cost.total.toFixed(2), `${cost.unpriced} unpriced`]);
  return toCsv(rows);
}

export const PANELS_HEADER = [
  'panel',
  'wall',
  'level',
  'offset_in',
  'offset',
  'length_in',
  'length',
  'height_in',
  'height',
  'section',
  'pieces',
  'weight_lb',
  'warnings',
  'wall_type',
] as const;

/**
 * Um painel por linha (S15/S16): parede de origem, pavimento, onde começa na parede, dimensões, nº de peças,
 * peso estimado da madeira (hipótese P8, sem sheathing), os códigos dos avisos separados por `;` e a tag do tipo de
 * parede (S35; vazia quando a parede não tem — última coluna, para quem lê as anteriores por posição).
 */
export function panelsCsv(panels: readonly Panel[]): string {
  const rows: (string | number)[][] = [[...PANELS_HEADER]];
  for (const p of panels) {
    rows.push([
      p.id,
      p.wallId,
      p.level,
      p.wallOffset,
      formatFeetInches(p.wallOffset),
      p.length,
      formatFeetInches(p.length),
      p.height,
      formatFeetInches(p.height),
      p.section,
      piecesOf(p),
      p.weightLb,
      p.warnings.map((w) => w.code).join(';'),
      p.wallType ?? '',
    ]);
  }
  return toCsv(rows);
}

/**
 * BOM consolidada de todos os painéis do projeto. Os pré-cortes vêm de `config.studLength`
 * (o que o projeto declara como pré-corte é o que se compra pré-cortado); `stockLengths` ausente
 * = comerciais default do core.
 */
export function projectBom(
  panels: readonly Panel[],
  precuts: readonly number[],
  stockLengths: readonly number[] = DEFAULT_STOCK_LENGTHS,
): BomLine[] {
  return bom(panels, stockLengths, precuts);
}
