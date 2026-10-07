import { describe, expect, it } from 'vitest';
import { kingsFor, loadKingTable, validateKingTable, type KingTable } from '../../src/rules/kings';

/**
 * Tabela FALSA, só para a lógica: valores inventados, diferentes do IRC.
 * Coluna A: < 150 mph B ou < 120 mph C. Coluna B: ≤ 100 mph B.
 */
function fakeKingJson() {
  return {
    source: { code: 'FAKE' },
    table: {
      id: 'FAKE-KINGS',
      columns: [
        { covers: [{ exposure: 'B', below: 150 }, { exposure: 'C', below: 120 }] },
        { covers: [{ exposure: 'B', upTo: 100 }] },
      ],
      rows: [
        { maxSpan: "3'", kings: [1, 1] },
        { maxSpan: "5'", kings: [2, 1] },
        { maxSpan: "9'", kings: [3, 2] },
      ],
    },
  };
}
const FAKE: KingTable = loadKingTable(fakeKingJson());
const ft = (feet: number, inches = 0) => feet * 12 + inches;

describe('kingsFor — escolha', () => {
  it('linha = menor vão máximo ≥ span (nota a: entre linhas, usa a maior); coluna pelo vento', () => {
    expect(kingsFor({ span: ft(3), windSpeed: 130 }, FAKE)).toEqual({ kings: 1, maxSpan: 36, table: 'FAKE-KINGS' });
    expect(kingsFor({ span: ft(3) + 0.01, windSpeed: 130 }, FAKE)).toMatchObject({ kings: 2, maxSpan: 60 });
    expect(kingsFor({ span: ft(5), windSpeed: 130 }, FAKE)).toMatchObject({ kings: 2 });
    expect(kingsFor({ span: ft(9), windSpeed: 130 }, FAKE)).toMatchObject({ kings: 3 });
  });

  it('vento que cabe nas duas colunas usa a de menos kings (a coluna ≤ 100 B é subconjunto da < 150 B)', () => {
    expect(kingsFor({ span: ft(5), windSpeed: 100 }, FAKE)).toMatchObject({ kings: 1 });
    expect(kingsFor({ span: ft(5), windSpeed: 100.5 }, FAKE)).toMatchObject({ kings: 2 });
    expect(kingsFor({ span: ft(9), windSpeed: 90 }, FAKE)).toMatchObject({ kings: 2 });
  });

  it('exposição ausente = B; exposição C só na coluna que a cobre', () => {
    expect(kingsFor({ span: ft(5), windSpeed: 100, exposure: 'B' }, FAKE)).toMatchObject({ kings: 1 });
    expect(kingsFor({ span: ft(5), windSpeed: 100, exposure: 'C' }, FAKE)).toMatchObject({ kings: 2 });
    expect(kingsFor({ span: ft(5), windSpeed: 119.9, exposure: 'C' }, FAKE)).toMatchObject({ kings: 2 });
  });

  it('nunca extrapola: vento fora das colunas ou exposição D → requiresEngineer', () => {
    expect(kingsFor({ span: ft(3), windSpeed: 150 }, FAKE)).toEqual({
      requiresEngineer: true,
      reason: expect.stringMatching(/vento 150 mph, exposição B/),
    });
    expect(kingsFor({ span: ft(3), windSpeed: 120, exposure: 'C' }, FAKE)).toMatchObject({ requiresEngineer: true });
    expect(kingsFor({ span: ft(3), windSpeed: 50, exposure: 'D' }, FAKE)).toMatchObject({
      requiresEngineer: true,
      reason: expect.stringMatching(/exposição D/),
    });
  });

  it('nunca extrapola: vão acima da última linha → requiresEngineer', () => {
    expect(kingsFor({ span: ft(9) + 0.01, windSpeed: 100 }, FAKE)).toEqual({
      requiresEngineer: true,
      reason: expect.stringMatching(/vão 108\.01" acima da última linha/),
    });
  });

  it('entrada inválida lança RangeError', () => {
    expect(() => kingsFor({ span: 0, windSpeed: 100 }, FAKE)).toThrow(RangeError);
    expect(() => kingsFor({ span: NaN, windSpeed: 100 }, FAKE)).toThrow(RangeError);
    expect(() => kingsFor({ span: 36, windSpeed: 0 }, FAKE)).toThrow(RangeError);
    expect(() => kingsFor({ span: 36, windSpeed: 100, exposure: 'A' as 'B' }, FAKE)).toThrow(RangeError);
  });
});

describe('validateKingTable / loadKingTable', () => {
  type Json = ReturnType<typeof fakeKingJson>;
  const mutated = (mutate: (j: Json) => void) => {
    const j = fakeKingJson();
    mutate(j);
    return j as unknown;
  };

  it('tabela falsa é válida e converte os vãos para polegadas', () => {
    expect(validateKingTable(fakeKingJson())).toEqual([]);
    expect(FAKE.rows.map((r) => r.maxSpan)).toEqual([36, 60, 108]);
    expect(FAKE.columns[0]!.covers).toEqual([
      { exposure: 'B', below: 150 },
      { exposure: 'C', below: 120 },
    ]);
  });

  it('aponta o caminho do erro de digitação', () => {
    expect(validateKingTable(mutated((j) => (j.table.rows[1]!.kings = [2])))).toEqual([
      'table.rows[1].kings: 1 valores para 2 colunas',
    ]);
    expect(validateKingTable(mutated((j) => (j.table.rows[1]!.maxSpan = "4'-6")))).toEqual([
      expect.stringMatching(/table\.rows\[1\]\.maxSpan: esperado pés como "4'"/),
    ]);
    expect(validateKingTable(mutated((j) => (j.table.rows[2]!.maxSpan = "5'")))).toEqual([
      'table.rows[2].maxSpan: vãos devem crescer linha a linha',
    ]);
    expect(validateKingTable(mutated((j) => (j.table.rows[0]!.kings = [0, 1])))).toEqual([
      'table.rows[0].kings[0]: inteiro ≥ 1, veio 0',
    ]);
    expect(validateKingTable(mutated((j) => (j.table.columns[1]!.covers = [{ exposure: 'B' }] as never)))).toEqual([
      'table.columns[1].covers[0]: esperado exatamente um de below / upTo',
    ]);
    expect(validateKingTable(mutated((j) => ((j.table.columns[0] as { extra?: number }).extra = 1)))).toEqual([
      'table.columns[0]: campo desconhecido "extra"',
    ]);
    expect(validateKingTable({ tables: [] })).toEqual(['raiz: esperado { table: {...} }']);
  });

  it('loadKingTable lança RangeError com todos os erros', () => {
    expect(() => loadKingTable(mutated((j) => (j.table.rows = [])))).toThrow(/tabela de kings inválida:\ntable\.rows: nenhuma linha/);
  });
});
