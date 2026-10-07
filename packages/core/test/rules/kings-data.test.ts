/**
 * Conferência da Tabela R602.7.5 digitada em `src/data/irc-kings.json` (S12). Um teste vermelho aqui é,
 * quase sempre, erro de digitação: corrija o JSON olhando o livro, não o teste.
 */

import { describe, expect, it } from 'vitest';
import raw from '../../src/data/irc-kings.json';
import { ircKings, kingsFor, validateKingTable, type KingTable } from '../../src/rules/kings';

const ft = (feet: number) => feet * 12;

/** As 8 linhas do livro: [vão (pés), kings na coluna "< 140 B / < 130 C", kings na coluna "≤ 115 B"]. */
const KNOWN: [number, number, number][] = [
  [4, 1, 1],
  [6, 2, 1],
  [8, 2, 1],
  [10, 3, 2],
  [12, 3, 2],
  [14, 3, 2],
  [16, 4, 2],
  [18, 4, 2],
];

/** Coerência: numa coluna, kings não diminuem com o vão; numa linha, a coluna de mais vento não pede menos. */
function kingTableIssues(t: KingTable): string[] {
  const out: string[] = [];
  t.columns.forEach((_, c) => {
    for (let i = 1; i < t.rows.length; i++) {
      const a = t.rows[i - 1]!;
      const b = t.rows[i]!;
      if (b.kings[c]! < a.kings[c]!) {
        out.push(`${t.id} col ${c}: ${b.maxSpan}" pede ${b.kings[c]} < ${a.maxSpan}" pede ${a.kings[c]}`);
      }
    }
  });
  // Coluna 0 (< 140 B) cobre mais vento que a coluna 1 (≤ 115 B): nunca pede menos.
  for (const r of t.rows) {
    if (r.kings[0]! < r.kings[1]!) out.push(`${t.id} ${r.maxSpan}": col 0 (${r.kings[0]}) < col 1 (${r.kings[1]})`);
  }
  return out;
}

describe('irc-kings.json', () => {
  it('estrutura válida (lista todos os erros de digitação com o caminho)', () => {
    expect(validateKingTable(raw)).toEqual([]);
  });

  it('coerência interna: kings não caem com o vão nem com mais vento', () => {
    expect(kingTableIssues(ircKings())).toEqual([]);
  });

  it('origem preenchida (código, edição, quem digitou e quando)', () => {
    const { code, edition, typedBy, typedOn } = raw.source;
    expect({ code, edition, typedBy, typedOn }).toEqual({
      code: 'IRC',
      edition: expect.stringMatching(/2021/),
      typedBy: expect.stringMatching(/\S/),
      typedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('colunas como no livro: < 140 mph B ou < 130 mph C; ≤ 115 mph B', () => {
    expect(ircKings().columns).toEqual([
      { covers: [{ exposure: 'B', below: 140 }, { exposure: 'C', below: 130 }] },
      { covers: [{ exposure: 'B', upTo: 115 }] },
    ]);
  });

  it.each(KNOWN)("vão %d': %d kings a 139 mph B, %d a 115 mph B", (feet, colA, colB) => {
    expect(kingsFor({ span: ft(feet), windSpeed: 139 })).toEqual({ kings: colA, maxSpan: ft(feet), table: 'R602.7.5' });
    expect(kingsFor({ span: ft(feet), windSpeed: 115 })).toMatchObject({ kings: colB });
  });

  it('limites das colunas: 140 B e 130 C fora; 129 C na coluna de mais vento; 115 C idem', () => {
    expect(kingsFor({ span: ft(6), windSpeed: 140 })).toMatchObject({ requiresEngineer: true });
    expect(kingsFor({ span: ft(6), windSpeed: 130, exposure: 'C' })).toMatchObject({ requiresEngineer: true });
    expect(kingsFor({ span: ft(6), windSpeed: 129, exposure: 'C' })).toMatchObject({ kings: 2 });
    expect(kingsFor({ span: ft(6), windSpeed: 115, exposure: 'C' })).toMatchObject({ kings: 2 });
    expect(kingsFor({ span: ft(6), windSpeed: 115.5 })).toMatchObject({ kings: 2 });
  });

  it("nota a: vão entre linhas usa a maior (4'-1\" → linha de 6'); acima de 18' → engenheiro", () => {
    expect(kingsFor({ span: ft(4) + 1, windSpeed: 120 })).toMatchObject({ kings: 2, maxSpan: ft(6) });
    expect(kingsFor({ span: ft(18), windSpeed: 120 })).toMatchObject({ kings: 4 });
    expect(kingsFor({ span: ft(18) + 0.01, windSpeed: 120 })).toMatchObject({ requiresEngineer: true });
  });
});
