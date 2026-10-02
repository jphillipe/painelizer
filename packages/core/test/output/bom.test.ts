import { describe, expect, it } from 'vitest';
import type { Config, Member, Wall } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { bom, DEFAULT_STOCK_LENGTHS, stockLengthFor } from '../../src/output/bom';
import plain from '../fixtures/wall-144-plain.json';
import window from '../fixtures/wall-144-window.json';
import low from '../fixtures/wall-144-window-82.5.json';

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
  it('fixture wall-144-plain: 10 studs no pré-corte 92 5/8" (sem sobra) e 3 plates em 12\'', () => {
    expect(bom([plainPanel])).toEqual([
      { section: '2x6', stockLength: 92.625, precut: true, qty: 10, cutTotal: 926.25, waste: 0, wastePercent: 0 },
      { section: '2x6', stockLength: 144, precut: false, qty: 3, cutTotal: 432, waste: 0, wastePercent: 0 },
    ]);
  });

  it('consolida vários painéis somando quantidades', () => {
    const lines = bom([plainPanel, plainPanel]);
    expect(lines.map((l) => [l.stockLength, l.qty])).toEqual([
      [92.625, 20],
      [144, 6],
    ]);
  });

  it("members do fixture da janela: header 2x10 de 2 plies vira 2 peças de 8'; seções em ordem 2x6, 2x10", () => {
    const lines = bom([{ members: window.expected.members as Member[] }]);
    // pré-corte: 7 studs + 2 kings = 9; 8': 2 jacks + 1 sill + 2 cripples = 5
    expect(lines.map((l) => [l.section, l.stockLength, l.precut, l.qty])).toEqual([
      ['2x6', 92.625, true, 9],
      ['2x6', 96, false, 5],
      ['2x6', 144, false, 3],
      ['2x10', 96, false, 2],
    ]);
    expect(lines.find((l) => l.section === '2x10')).toMatchObject({
      qty: 2,
      cutTotal: 78,
      waste: 114,
      wastePercent: 59.4,
    });
  });

  it('fixture wall-144-window-82.5: jacks de 81 e cripples curtos vão para o 8\', não para o pré-corte', () => {
    const panel = panelizeWall(low.wall as Wall, low.config as Config);
    const lines = bom([panel], DEFAULT_STOCK_LENGTHS, low.config.studLength);
    // pré-corte: 7 studs + 2 kings; 8': 2 jacks + 1 sill + 4 cripples
    expect(lines.map((l) => [l.section, l.stockLength, l.precut, l.qty])).toEqual([
      ['2x6', 92.625, true, 9],
      ['2x6', 96, false, 7],
      ['2x6', 144, false, 3],
      ['2x10', 96, false, 2],
    ]);
  });

  it("parede de 9': studs no pré-corte de 104 5/8\"", () => {
    const nine = panelizeWall({ ...(plain.wall as Wall), height: 109.125 }, plain.config as Config);
    expect(bom([nine]).map((l) => [l.stockLength, l.precut, l.qty, l.waste])).toEqual([
      [104.625, true, 10, 0],
      [144, false, 3, 0],
    ]);
  });

  it('pré-corte só atende 2x4/2x6 (P7): peça 2x10 de 92 5/8" vai para o comercial', () => {
    const lines = bom([
      { members: [{ role: 'header', section: '2x10', length: 92.625, x: 0, y: 0, orientation: 'horizontal' }] },
    ]);
    expect(lines).toMatchObject([{ section: '2x10', stockLength: 96, precut: false, qty: 1 }]);
  });

  it('sem pré-cortes ([]) os studs voltam ao 8\' comercial, com sobra', () => {
    expect(bom([plainPanel], DEFAULT_STOCK_LENGTHS, [])).toEqual([
      { section: '2x6', stockLength: 96, precut: false, qty: 10, cutTotal: 926.25, waste: 33.75, wastePercent: 3.5 },
      { section: '2x6', stockLength: 144, precut: false, qty: 3, cutTotal: 432, waste: 0, wastePercent: 0 },
    ]);
  });

  it("comprimentos comerciais customizados (ex.: só 9' e 20'), sem pré-corte", () => {
    const lines = bom([plainPanel], [108, 240], []);
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
