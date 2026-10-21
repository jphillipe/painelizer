import { describe, expect, it } from 'vitest';
import { groupBySection, stockLabel } from './result-materials';
import { warningsByPanel } from './result-view';
import { idsFromPanels } from './result-warnings';
import type { BomRow } from '@/types/panels';

const rows: BomRow[] = [
  { section: '2x6', stockLength: 92.625, kind: 'precut', qty: 40, cutTotal: 3705, waste: 0, wastePercent: 0 },
  { section: '2x6', stockLength: 96, kind: 'commercial', qty: 10, cutTotal: 800, waste: 160, wastePercent: 16.7 },
  { section: '2x6', stockLength: 144, kind: 'commercial', qty: 3, cutTotal: 432, waste: 0, wastePercent: 0 },
  { section: '2x10', stockLength: 96, kind: 'commercial', qty: 2, cutTotal: 78, waste: 114, wastePercent: 59.4 },
  { section: '2x6', stockLength: 266.5, kind: 'oversize', qty: 1, cutTotal: 266.5, waste: 0, wastePercent: 0 },
];

describe('aba Materials (M3)', () => {
  it('agrupa a BOM por seção na ordem de chegada, com peças e pés lineares comprados', () => {
    const g = groupBySection(rows);
    expect(g.map((x) => x.section)).toEqual(['2x6', '2x10']);
    expect(g[0]!.rows).toHaveLength(4);
    expect(g[0]!.qty).toBe(54);
    // 40 × 92.625 + 10 × 96 + 3 × 144 + 266.5 = 5363.5" = 446.96 ft
    expect(g[0]!.feet).toBeCloseTo(5363.5 / 12, 3);
    expect(g[1]!.qty).toBe(2);
  });

  it('estoque comercial em pés, pré-corte e oversize em polegadas', () => {
    expect(stockLabel({ stockLength: 96, kind: 'commercial' })).toBe(`8'-0"`);
    expect(stockLabel({ stockLength: 92.625, kind: 'precut' })).toBe(`92 5/8"`);
    expect(stockLabel({ stockLength: 266.5, kind: 'oversize' })).toBe(`266 1/2"`);
  });

  it('avisos contados por painel pelo prefixo do id; ids mínimos a partir dos painéis', () => {
    const panels = [
      { id: '1-S2-P1', wallId: 'S2', length: 144, pieces: 20, weightLb: 200 },
      { id: '1-S2-P2', wallId: 'S2', length: 144, pieces: 20, weightLb: 200 },
      { id: '1-N1-P1', wallId: 'N1', length: 192, pieces: 30, weightLb: 300 },
    ];
    const m = warningsByPanel(['1-S2-P1 HEADER_JACKS_BELOW_TABLE: a', '1-S2-P1 HEADER_JACKS_BELOW_TABLE: b', '1-N1-P1 WIND_SPEED_MISSING: c', 'extração X: d'], panels.map((p) => p.id));
    expect(m.get('1-S2-P1')).toBe(2);
    expect(m.get('1-S2-P2')).toBeUndefined();
    expect(m.get('1-N1-P1')).toBe(1);
    const ids = idsFromPanels(panels);
    expect(ids.walls).toEqual(['S2', 'N1']);
    expect(ids.openings.get('S2')).toEqual([]);
  });
});
