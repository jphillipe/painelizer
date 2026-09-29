import { describe, expect, it } from 'vitest';
import type { Config, Member, Wall } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { bom, DEFAULT_STOCK_LENGTHS, stockLengthFor } from '../../src/output/bom';
import plain from '../fixtures/wall-144-plain.json';
import window from '../fixtures/wall-144-window.json';

const plainPanel = panelizeWall(plain.wall as Wall, plain.config as Config);

describe('stockLengthFor', () => {
  it('escolhe o menor comercial que cabe', () => {
    expect(stockLengthFor(92.625)).toBe(96);
    expect(stockLengthFor(96)).toBe(96);
    expect(stockLengthFor(96.5)).toBe(120);
    expect(stockLengthFor(144)).toBe(144);
    expect(stockLengthFor(192)).toBe(192);
  });

  it('aceita lista de comerciais fora de ordem', () => {
    expect(stockLengthFor(100, [192, 96, 120])).toBe(120);
  });

  it('peça maior que o maior comercial lança RangeError', () => {
    expect(() => stockLengthFor(192.5)).toThrow(RangeError);
    expect(() => stockLengthFor(240)).toThrow(/240/);
  });

  it('lista vazia ou comercial inválido lança RangeError', () => {
    expect(() => stockLengthFor(10, [])).toThrow(RangeError);
    expect(() => stockLengthFor(10, [0, 96])).toThrow(RangeError);
  });

  it("default é 8', 10', 12', 14', 16' (hipótese P9)", () => {
    expect(DEFAULT_STOCK_LENGTHS).toEqual([96, 120, 144, 168, 192]);
  });
});

describe('bom', () => {
  it("fixture wall-144-plain: 10 studs em 8' e 3 plates em 12', com sobra", () => {
    expect(bom([plainPanel])).toEqual([
      { section: '2x6', stockLength: 96, qty: 10, cutTotal: 926.25, waste: 33.75, wastePercent: 3.5 },
      { section: '2x6', stockLength: 144, qty: 3, cutTotal: 432, waste: 0, wastePercent: 0 },
    ]);
  });

  it('consolida vários painéis somando quantidades', () => {
    const lines = bom([plainPanel, plainPanel]);
    expect(lines.map((l) => [l.stockLength, l.qty])).toEqual([
      [96, 20],
      [144, 6],
    ]);
  });

  it("members do fixture da janela: header 2x10 de 2 plies vira 2 peças de 8'; seções em ordem 2x6, 2x10", () => {
    const lines = bom([{ members: window.expected.members as Member[] }]);
    // 2x6 ≤ 96": 7 studs + 2 kings + 2 jacks + 1 sill + 2 cripples = 14
    expect(lines.map((l) => [l.section, l.stockLength, l.qty])).toEqual([
      ['2x6', 96, 14],
      ['2x6', 144, 3],
      ['2x10', 96, 2],
    ]);
    expect(lines.find((l) => l.section === '2x10')).toMatchObject({
      qty: 2,
      cutTotal: 78,
      waste: 114,
      wastePercent: 59.4,
    });
  });

  it("comprimentos comerciais customizados (ex.: só 9' e 20')", () => {
    const lines = bom([plainPanel], [108, 240]);
    expect(lines.map((l) => [l.stockLength, l.qty])).toEqual([
      [108, 10],
      [240, 3],
    ]);
  });

  it('nenhum painel devolve lista vazia', () => {
    expect(bom([])).toEqual([]);
  });

  it('plate mais longa que o maior comercial lança RangeError (até a S12 dividir painéis)', () => {
    const long = panelizeWall({ ...(plain.wall as Wall), id: 'W-20ft', length: 240 }, plain.config as Config);
    expect(() => bom([long])).toThrow(RangeError);
  });
});
