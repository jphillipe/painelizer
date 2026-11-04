import { describe, expect, it } from 'vitest';
import type { BomLine } from '../../src/output/bom';
import { costOf } from '../../src/output/cost';
import type { PriceEntry } from '../../src/config';

const line = (
  section: BomLine['section'],
  stockLength: number,
  qty: number,
  kind: BomLine['kind'] = 'commercial',
): BomLine => ({
  section,
  stockLength,
  kind,
  qty,
  cutTotal: qty * stockLength,
  waste: 0,
  wastePercent: 0,
});

const bom: BomLine[] = [
  line('2x4', 92.625, 10, 'precut'),
  line('2x4', 96, 4),
  line('2x6', 144, 3),
  line('LVL 1.75x9.25', 75, 2, 'engineered'),
  line('2x10', 120, 1),
];

const prices: PriceEntry[] = [
  { section: '2x4', length: 92.625, price: 3.75 },
  { section: '2x4', length: 96, price: 3.98 },
  { section: '2x6', perFoot: 0.85 },
  { section: 'LVL 1.75x9.25', perFoot: 9.5 },
];

describe('costOf (S31)', () => {
  it('por peça do comprimento, por pé linear, ou sem preço; total só das linhas com preço', () => {
    const c = costOf(bom, prices);
    expect(c.lines.map((l) => [l.section, l.stockLength, l.unitPrice, l.cost, l.source])).toEqual([
      ['2x4', 92.625, 3.75, 37.5, 'each'],
      ['2x4', 96, 3.98, 15.92, 'each'],
      ['2x6', 144, 10.2, 30.6, 'perFoot'],
      ['LVL 1.75x9.25', 75, 59.38, 118.76, 'perFoot'],
      ['2x10', 120, undefined, undefined, undefined],
    ]);
    expect(c.total).toBe(202.78);
    expect(c.unpriced).toBe(1);
    // A linha sem preço é a da BOM, sem campos de custo.
    expect(c.lines[4]).toEqual(bom[4]);
  });

  it('preço por peça vence o por pé da mesma seção', () => {
    const c = costOf(
      [line('2x6', 144, 2)],
      [
        { section: '2x6', perFoot: 1 },
        { section: '2x6', length: 144, price: 9 },
      ],
    );
    expect(c.lines[0]).toMatchObject({ unitPrice: 9, cost: 18, source: 'each' });
  });

  it('tabela vazia: tudo sem preço, total 0', () => {
    expect(costOf(bom, [])).toEqual({ lines: bom, total: 0, unpriced: 5 });
  });

  it('preço negativo, comprimento inválido ou entrada repetida é erro', () => {
    expect(() => costOf(bom, [{ section: '2x4', length: 96, price: -1 }])).toThrow(/preço inválido/);
    expect(() => costOf(bom, [{ section: '2x4', length: 0, price: 1 }])).toThrow(/comprimento inválido/);
    expect(() =>
      costOf(bom, [
        { section: '2x4', length: 96, price: 1 },
        { section: '2x4', length: 96, price: 2 },
      ]),
    ).toThrow(/repetido/);
    expect(() =>
      costOf(bom, [
        { section: '2x6', perFoot: 1 },
        { section: '2x6', perFoot: 2 },
      ]),
    ).toThrow(/repetido/);
  });
});
