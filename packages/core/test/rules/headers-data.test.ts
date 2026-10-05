/**
 * Conferência da tabela IRC digitada em `src/data/irc-headers.json` (S9, passadas 2 e 3).
 * Enquanto a tabela estiver vazia, as conferências passam sem conferir nada e as linhas conhecidas
 * ficam como `todo`. Um teste vermelho aqui é, quase sempre, erro de digitação: corrija o JSON
 * olhando o livro, não o teste.
 */

import { describe, expect, it } from 'vitest';
import raw from '../../src/data/irc-headers.json';
import { headerFor, ircHeaders, validateHeaderTables, type HeaderChoice, type HeaderQuery } from '../../src/rules/headers';
import { headerTableIssues } from '../helpers/headerConsistency';

/**
 * Passada 2: 3 casos conferidos à mão no livro, de preferência um por grupo de carga e um com NJ > 1.
 * Medidas em polegadas (largura 24' = 288). Exemplo do formato (valores fictícios):
 *   { note: 'R602.7(1), só telhado, 30 psf, 24\', vão 4\'', query: { span: 48, exterior: true, bearing: true,
 *     buildingWidth: 288, groundSnowLoad: 30, floorsSupported: 0 },
 *     expected: { section: '2x8', plies: 2, jackStuds: 1, maxSpan: 50, table: 'R602.7(1)' } },
 */
const KNOWN: { note: string; query: HeaderQuery; expected: HeaderChoice }[] = [
  {
    note: "R602.7(2), 1 pavimento, 12', vão 3'-0 → 2-2x4 (4-1, NJ 1)",
    query: { span: 36, exterior: false, bearing: true, buildingWidth: 144, floorsSupported: 1 },
    expected: { section: '2x4', plies: 2, jackStuds: 1, maxSpan: 49, table: 'R602.7(2)' },
  },
  {
    note: "R602.7(2), 1 pavimento, 20' (sobe para 24'), vão 6'-0, parede 2x4 → 2-2x10 (6-6, NJ 2)",
    query: { span: 72, exterior: false, bearing: true, buildingWidth: 240, floorsSupported: 1, wallSection: '2x4' },
    expected: { section: '2x10', plies: 2, jackStuds: 2, maxSpan: 78, table: 'R602.7(2)' },
  },
  {
    note: "R602.7(2), 2 pavimentos, 36', vão 4'-0, parede 2x4 → 2-2x12 (4-3, NJ 3)",
    query: { span: 48, exterior: false, bearing: true, buildingWidth: 432, floorsSupported: 2, wallSection: '2x4' },
    expected: { section: '2x12', plies: 2, jackStuds: 3, maxSpan: 51, table: 'R602.7(2)' },
  },
  {
    note: "R602.7(1), só telhado, 40 psf (sobe para 50), 28' (sobe para 36'), vão 3'-0 → 2-2x6 (3-3, NJ 2)",
    query: { span: 36, exterior: true, bearing: true, buildingWidth: 336, groundSnowLoad: 40, floorsSupported: 0 },
    expected: { section: '2x6', plies: 2, jackStuds: 2, maxSpan: 39, table: 'R602.7(1)' },
  },
  {
    note: "R602.7(1), 1 pavimento center-bearing, 50 psf, 24', vão 3'-2 → 2-2x6 (3-6, NJ 2)",
    query: {
      span: 38,
      exterior: true,
      bearing: true,
      buildingWidth: 288,
      groundSnowLoad: 50,
      floorsSupported: 1,
      floorSpan: 'center',
    },
    expected: { section: '2x6', plies: 2, jackStuds: 2, maxSpan: 42, table: 'R602.7(1)' },
  },
  {
    note: "R602.7(1), 1 pavimento sem floorSpan (pior caso), 30 psf, 36', vão 4'-0, parede 2x6 → 3-2x8 (clear 4-5, NJ 2)",
    query: {
      span: 48,
      exterior: true,
      bearing: true,
      buildingWidth: 432,
      groundSnowLoad: 30,
      floorsSupported: 1,
      wallSection: '2x6',
    },
    expected: { section: '2x8', plies: 3, jackStuds: 2, maxSpan: 53, table: 'R602.7(1)' },
  },
];

const rowCount = ircHeaders().reduce((n, t) => n + t.groups.reduce((m, g) => m + g.rows.length, 0), 0);

describe('irc-headers.json', () => {
  it('estrutura válida (lista todos os erros de digitação com o caminho)', () => {
    expect(validateHeaderTables(raw)).toEqual([]);
  });

  it('coerência interna: vão cresce com seção e plies, cai com neve, largura e pavimentos; NJ não cai com a seção', () => {
    expect(ircHeaders().flatMap(headerTableIssues)).toEqual([]);
  });

  it('tabela preenchida exige a origem preenchida (código, edição, quem digitou e quando)', () => {
    if (rowCount === 0) return;
    const { code, edition, typedBy, typedOn } = raw.source;
    expect({ code, edition, typedBy, typedOn }).toEqual({
      code: expect.stringMatching(/\S/),
      edition: expect.stringMatching(/\S/),
      typedBy: expect.stringMatching(/\S/),
      typedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('tabela preenchida exige ao menos 3 linhas conhecidas', () => {
    if (rowCount === 0) return;
    expect(KNOWN.length).toBeGreaterThanOrEqual(3);
  });

  if (KNOWN.length === 0) {
    it.todo('3 linhas conhecidas conferidas no livro (passada 2: preencher KNOWN)');
  } else {
    it.each(KNOWN)('$note', ({ query, expected }) => {
      expect(headerFor(query)).toEqual(expected);
    });
  }

  it('tabela externa vazia: parede externa portante → requiresEngineer (nunca inventa header)', () => {
    if (ircHeaders().some((t) => t.exterior && t.groups.some((g) => g.rows.length > 0))) return;
    expect(
      headerFor({ span: 36, exterior: true, bearing: true, buildingWidth: 288, groundSnowLoad: 30, floorsSupported: 0 }),
    ).toMatchObject({ requiresEngineer: true });
  });
});
