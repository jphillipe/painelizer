import { describe, expect, it } from 'vitest';
import {
  headerFor,
  loadHeaderTables,
  validateHeaderTables,
  type HeaderQuery,
} from '../../src/rules/headers';
import { fakeHeaderJson } from '../helpers/fakeHeaderTables';
import {
  headerTableIssues,
  jacksGrowWithSection,
  sameRowsInEveryGroup,
  spanFallsWithFloors,
  spanFallsWithLoad,
  spanGrowsWithPlies,
  spanGrowsWithSection,
} from '../helpers/headerConsistency';

// Tabela FALSA (ver helper): colunas A = 20 psf/10', B = 20 psf/30', C = 40 psf/10', D = 40 psf/30'.
const FAKE = loadHeaderTables(fakeHeaderJson());
const ft = (feet: number, inches = 0) => feet * 12 + inches;

/** Parede externa portante, só telhado, coluna A. */
const q = (span: number, extra: Partial<HeaderQuery> = {}): HeaderQuery => ({
  span,
  exterior: true,
  bearing: true,
  buildingWidth: ft(10),
  groundSnowLoad: 20,
  floorsSupported: 0,
  ...extra,
});

describe('headerFor — escolha', () => {
  it('2 plies de menor seção: 2-2x6, não o 1-2x8 que também atende', () => {
    expect(headerFor(q(ft(4)), FAKE)).toEqual({
      section: '2x6',
      plies: 2,
      jackStuds: 1,
      maxSpan: ft(5),
      table: 'FAKE-EXT',
    });
  });

  it('sem 2 plies que atenda, passa a 3 plies; vão igual ao da tabela atende', () => {
    expect(headerFor(q(ft(8)), FAKE)).toMatchObject({ section: '2x10', plies: 2, jackStuds: 2, maxSpan: ft(8) });
    expect(headerFor(q(ft(8) + 0.01), FAKE)).toMatchObject({ section: '2x10', plies: 3, maxSpan: ft(10) });
  });

  it('vão logo acima do limite passa para o próximo header (nunca extrapola)', () => {
    expect(headerFor(q(ft(5)), FAKE)).toMatchObject({ section: '2x6', plies: 2 });
    expect(headerFor(q(ft(5) + 1 / 16), FAKE)).toMatchObject({ section: '2x10', plies: 2 });
  });

  it('vão acima de todos os headers → requiresEngineer', () => {
    expect(headerFor(q(ft(14) + 1), FAKE)).toEqual({
      requiresEngineer: true,
      reason: expect.stringMatching(/acima de todos os headers/),
    });
  });

  it('célula "—" não é permitida: na coluna D o 4-2x12 não existe', () => {
    const r = headerFor(q(ft(8) + 1, { groundSnowLoad: 40, buildingWidth: ft(30) }), FAKE);
    expect(r).toMatchObject({ requiresEngineer: true });
  });
});

describe('headerFor — padrão de 2 plies (P17, respondida em 2026-10-05)', () => {
  type Json = ReturnType<typeof fakeHeaderJson>;
  const tables = (mutate: (j: Json) => void) => {
    const j = fakeHeaderJson();
    mutate(j);
    return loadHeaderTables(j);
  };

  it('2 plies de seção maior ganha de 3 plies de seção menor', () => {
    const cell: [string, number] = ["9'-0", 1];
    const withThreePly = tables((j) =>
      j.tables[0]!.groups[0]!.headers.push({ plies: 3, section: '2x6', cells: [cell, cell, cell, cell] }),
    );
    expect(headerFor(q(ft(8)), withThreePly)).toMatchObject({ section: '2x10', plies: 2 });
    // acima dos 8' do 2-2x10 não há 2 plies: aí entra o de 3 plies de menor seção
    expect(headerFor(q(ft(8, 6)), withThreePly)).toMatchObject({ section: '2x6', plies: 3 });
  });

  it('header de 1 ply nunca é escolhido, mesmo sendo o único que atende', () => {
    const cell: [string, number] = ["20'-0", 1];
    const bigOnePly = tables((j) => (j.tables[0]!.groups[0]!.headers[0]!.cells = [cell, cell, cell, cell]));
    expect(headerFor(q(ft(3)), bigOnePly)).toMatchObject({ section: '2x6', plies: 2 });
    expect(headerFor(q(ft(15)), bigOnePly)).toMatchObject({ requiresEngineer: true });
  });
});

describe('headerFor — coluna', () => {
  it('largura e neve exatas usam a própria coluna', () => {
    expect(headerFor(q(ft(3, 6), { groundSnowLoad: 40, buildingWidth: ft(30) }), FAKE)).toMatchObject({
      section: '2x6',
      plies: 2,
      maxSpan: ft(3, 6),
    });
  });

  it('valores entre colunas sobem para a próxima (sem interpolar)', () => {
    // 25 psf → 40; 20' → 30': coluna D.
    expect(headerFor(q(ft(3, 6), { groundSnowLoad: 25, buildingWidth: ft(20) }), FAKE)).toMatchObject({
      section: '2x6',
      maxSpan: ft(3, 6),
    });
    expect(headerFor(q(ft(3, 7), { groundSnowLoad: 25, buildingWidth: ft(20) }), FAKE)).toMatchObject({
      section: '2x10',
    });
  });

  it('abaixo da primeira coluna usa a primeira', () => {
    expect(headerFor(q(ft(5), { groundSnowLoad: 0, buildingWidth: ft(6) }), FAKE)).toMatchObject({
      section: '2x6',
      maxSpan: ft(5),
    });
  });

  it('neve manda antes da largura: 20 psf com 10\'-1" vai para B (20/30\'), não para C (40/10\')', () => {
    // Em B o 2-2x6 vai até 4'; em C iria até 4'-6".
    expect(headerFor(q(ft(4, 2), { buildingWidth: ft(10, 1) }), FAKE)).toMatchObject({ section: '2x10' });
  });

  it.each([
    ['neve acima da última coluna', { groundSnowLoad: 41 }, /neve 41 psf/],
    ['largura acima da última coluna', { buildingWidth: ft(30) + 1 }, /largura 361"/],
  ])('%s → requiresEngineer', (_, extra, reason) => {
    expect(headerFor(q(ft(2), extra), FAKE)).toEqual({ requiresEngineer: true, reason: expect.stringMatching(reason) });
  });
});

describe('headerFor — pavimentos', () => {
  const one = (span: number, extra: Partial<HeaderQuery> = {}) =>
    q(span, { floorsSupported: 1, buildingWidth: ft(30), ...extra });

  it('floorSpan informado escolhe o grupo', () => {
    expect(headerFor(one(ft(3, 6), { floorSpan: 'center' }), FAKE)).toMatchObject({
      section: '2x6',
      jackStuds: 1,
      maxSpan: ft(3, 6),
    });
    expect(headerFor(one(ft(3), { floorSpan: 'clear' }), FAKE)).toMatchObject({
      section: '2x6',
      jackStuds: 2,
      maxSpan: ft(3),
    });
  });

  it('sem floorSpan vale o pior caso: menor vão e maior NJ entre center e clear', () => {
    expect(headerFor(one(ft(3, 4)), FAKE)).toEqual({
      section: '2x10',
      plies: 2,
      jackStuds: 3,
      maxSpan: ft(5, 6),
      table: 'FAKE-EXT',
    });
    expect(headerFor(one(ft(3)), FAKE)).toMatchObject({ section: '2x6', jackStuds: 2, maxSpan: ft(3) });
  });

  it('número de pavimentos sem grupo na tabela → requiresEngineer', () => {
    expect(headerFor(q(ft(2), { floorsSupported: 2 }), FAKE)).toEqual({
      requiresEngineer: true,
      reason: expect.stringMatching(/2 pavimento/),
    });
  });
});

describe('headerFor — espessura da parede', () => {
  it('2x4 aceita até 2 plies; 2x6 até 3', () => {
    expect(headerFor(q(ft(9), { wallSection: '2x6' }), FAKE)).toMatchObject({ section: '2x10', plies: 3 });
    expect(headerFor(q(ft(9), { wallSection: '2x4' }), FAKE)).toEqual({
      requiresEngineer: true,
      reason: expect.stringMatching(/cabem em parede 2x4/),
    });
  });

  it('4 plies não cabem em 2x6: sem wallSection o 4-2x12 é escolhido, com 2x6 não', () => {
    expect(headerFor(q(ft(12)), FAKE)).toMatchObject({ section: '2x12', plies: 4, jackStuds: 3 });
    expect(headerFor(q(ft(12), { wallSection: '2x6' }), FAKE)).toMatchObject({ requiresEngineer: true });
  });
});

describe('headerFor — parede interna e não portante', () => {
  const int = (span: number, extra: Partial<HeaderQuery> = {}): HeaderQuery => ({
    span,
    exterior: false,
    bearing: true,
    buildingWidth: ft(30),
    floorsSupported: 1,
    ...extra,
  });

  it('interna usa a tabela sem neve; neve informada é ignorada', () => {
    expect(headerFor(int(ft(3)), FAKE)).toEqual({
      section: '2x6',
      plies: 2,
      jackStuds: 1,
      maxSpan: ft(3),
      table: 'FAKE-INT',
    });
    expect(headerFor(int(ft(3), { groundSnowLoad: 999 }), FAKE)).toMatchObject({ section: '2x6' });
  });

  it('interna: floorSpan informado não exclui grupo que não distingue', () => {
    expect(headerFor(int(ft(4), { floorsSupported: 2, floorSpan: 'clear' }), FAKE)).toMatchObject({
      section: '2x10',
      maxSpan: ft(4),
    });
  });

  it('interna sem pavimento suportado não está na tabela → requiresEngineer', () => {
    expect(headerFor(int(ft(3), { floorsSupported: 0 }), FAKE)).toMatchObject({ requiresEngineer: true });
  });

  it('não portante não consulta tabela (P17), externa ou interna', () => {
    expect(headerFor(q(ft(6), { bearing: false }), FAKE)).toEqual({ nonBearing: true });
    expect(headerFor(int(ft(6), { bearing: false }), [])).toEqual({ nonBearing: true });
  });

  it('sem tabela para o tipo de parede → requiresEngineer', () => {
    const onlyExterior = FAKE.filter((t) => t.exterior);
    expect(headerFor(int(ft(3)), onlyExterior)).toEqual({
      requiresEngineer: true,
      reason: 'sem tabela de header para parede interna',
    });
  });
});

describe('headerFor — entrada inválida', () => {
  it.each<[string, Partial<HeaderQuery>]>([
    ['span 0', { span: 0 }],
    ['span NaN', { span: Number.NaN }],
    ['largura negativa', { buildingWidth: -1 }],
    ['pavimentos fracionários', { floorsSupported: 1.5 }],
    ['pavimentos negativos', { floorsSupported: -1 }],
    ['neve negativa', { groundSnowLoad: -1 }],
  ])('%s lança RangeError', (_, extra) => {
    expect(() => headerFor(q(ft(3), extra), FAKE)).toThrow(RangeError);
  });

  it('parede externa portante sem neve lança RangeError', () => {
    const { groundSnowLoad: _, ...noSnow } = q(ft(3));
    expect(() => headerFor(noSnow, FAKE)).toThrow(/groundSnowLoad/);
  });
});

describe('loadHeaderTables / validateHeaderTables', () => {
  it('tabela válida: sem erros; vãos e larguras em polegadas', () => {
    expect(validateHeaderTables(fakeHeaderJson())).toEqual([]);
    const ext = FAKE[0]!;
    expect(ext.columns[1]).toEqual({ groundSnowLoad: 20, buildingWidth: 360 });
    expect(ext.groups[1]).toMatchObject({ floors: 1, floorSpan: 'center' });
    expect(ext.groups[0]!.rows[1]).toEqual({
      section: '2x6',
      plies: 2,
      cells: [
        { maxSpan: 60, jackStuds: 1 },
        { maxSpan: 48, jackStuds: 1 },
        { maxSpan: 54, jackStuds: 1 },
        { maxSpan: 42, jackStuds: 1 },
      ],
    });
    expect(ext.groups[0]!.rows[4]!.cells[3]).toBeNull();
    expect(FAKE[1]!.columns[0]).toEqual({ buildingWidth: 120 });
  });

  type Json = ReturnType<typeof fakeHeaderJson>;
  const broken = (mutate: (j: Json) => void) => {
    const j = fakeHeaderJson();
    mutate(j);
    return validateHeaderTables(j);
  };
  const row0 = (j: Json) => j.tables[0]!.groups[0]!.headers[0]!;

  it.each<[string, (j: Json) => void, RegExp]>([
    ['vão sem apóstrofo (como no livro)', (j) => (row0(j).cells[0] = ['3-6', 1]), /cells\[0\]: vão como/],
    ['polegadas ≥ 12', (j) => (row0(j).cells[1] = ["3'-12", 1]), /cells\[1\]: vão como/],
    ['vão zero', (j) => (row0(j).cells[1] = ["0'-0", 1]), /vão zero/],
    ['NJ 0', (j) => (row0(j).cells[2] = ["3'-0", 0]), /cells\[2\]: NJ inteiro/],
    ['célula sem NJ', (j) => ((row0(j).cells as unknown[])[0] = ["3'-0"]), /esperado \[vão, NJ\]/],
    ['célula a menos', (j) => row0(j).cells.pop(), /headers\[0\]\.cells: 3 células para 4 colunas/],
    ['seção desconhecida', (j) => (row0(j).section = '2x5'), /seção desconhecida "2x5"/],
    ['plies 0', (j) => (row0(j).plies = 0), /plies: esperado inteiro/],
    ['campo com erro de digitação', (j) => Object.assign(row0(j), { plie: 2 }), /campo desconhecido "plie"/],
    ['linha repetida', (j) => j.tables[0]!.groups[0]!.headers.push(row0(j)), /linha 1-2x8 repetida/],
    [
      'grupo repetido',
      (j) => j.tables[0]!.groups.push(j.tables[0]!.groups[1]!),
      /groups\[3\]\.supports: grupo repetido/,
    ],
    [
      'floorSpan sem pavimento',
      (j) => Object.assign(j.tables[0]!.groups[0]!.supports, { floorSpan: 'center' }),
      /sem pavimento não tem floorSpan/,
    ],
    [
      'floorSpan inválido',
      (j) => Object.assign(j.tables[0]!.groups[1]!.supports, { floorSpan: 'centre' }),
      /floorSpan: esperado "center" ou "clear"/,
    ],
    [
      'coluna externa sem neve',
      (j) => delete (j.tables[0]!.columns[0] as { groundSnowLoad?: number }).groundSnowLoad,
      /columns\[0\]\.groundSnowLoad: tabela externa/,
    ],
    [
      'coluna interna com neve',
      (j) => Object.assign(j.tables[1]!.columns[0]!, { groundSnowLoad: 30 }),
      /tabela interna não tem neve/,
    ],
    ['largura sem pés', (j) => (j.tables[0]!.columns[0]!.buildingWidth = '12'), /buildingWidth: esperado pés/],
    ['coluna repetida', (j) => (j.tables[0]!.columns[1]!.buildingWidth = "10'"), /columns\[1\]: coluna repetida/],
    ['duas tabelas externas', (j) => (j.tables[1]!.exterior = true), /duas tabelas para o mesmo tipo/],
  ])('%s', (_, mutate, message) => {
    expect(broken(mutate).join('\n')).toMatch(message);
  });

  it('todos os erros vêm juntos, com caminho', () => {
    const errors = broken((j) => {
      row0(j).cells[0] = ['3-6', 1];
      j.tables[1]!.groups[1]!.headers[0]!.cells[1] = ["2'-0", 0];
    });
    expect(errors).toEqual([
      `tables[0].groups[0].headers[0].cells[0]: vão como "3'-6", veio "3-6"`,
      'tables[1].groups[1].headers[0].cells[1]: NJ inteiro ≥ 1, veio 0',
    ]);
  });

  it('raiz inválida', () => {
    expect(validateHeaderTables(null)).toEqual(['raiz: esperado { tables: [...] }']);
    expect(validateHeaderTables({ tables: {} })).toEqual(['raiz: esperado { tables: [...] }']);
  });

  it('loadHeaderTables lança RangeError com a lista de erros', () => {
    const j = fakeHeaderJson();
    row0(j).cells[0] = ['3-6', 1];
    expect(() => loadHeaderTables(j)).toThrow(RangeError);
    expect(() => loadHeaderTables(j)).toThrow(/cells\[0\]: vão como/);
  });
});

describe('conferências de coerência (helper da passada 3)', () => {
  type Json = ReturnType<typeof fakeHeaderJson>;
  const issues = (mutate: (j: Json) => void, check: (t: (typeof FAKE)[number]) => string[]) => {
    const j = fakeHeaderJson();
    mutate(j);
    return loadHeaderTables(j).flatMap(check);
  };
  const ext = (j: Json, group: number, row: number) => j.tables[0]!.groups[group]!.headers[row]!;

  it('tabela falsa é coerente', () => {
    expect(FAKE.flatMap(headerTableIssues)).toEqual([]);
  });

  it.each<[string, (j: Json) => void, (t: (typeof FAKE)[number]) => string[], RegExp]>([
    ['seção maior com vão menor', (j) => (ext(j, 0, 2).cells[0] = ["4'-0", 2]), spanGrowsWithSection, /2-2x10 vs 2-2x6: 48" < 60"/],
    ['seção maior com "—"', (j) => (ext(j, 0, 2).cells[0] = null), spanGrowsWithSection, /— onde deveria haver vão ≥ 60"/],
    ['mais plies com vão menor', (j) => (ext(j, 0, 3).cells[0] = ["7'-0", 2]), spanGrowsWithPlies, /3-2x10 vs 2-2x10: 84" < 96"/],
    ['mais neve com vão maior', (j) => (ext(j, 0, 1).cells[3] = ["5'-6", 1]), spanFallsWithLoad, /col 1 .* vs col 3 .*: 48" < 66"/],
    ['mais largura com vão maior', (j) => (ext(j, 0, 1).cells[1] = ["5'-6", 1]), spanFallsWithLoad, /col 0 .* vs col 1 .*: 60" < 66"/],
    ['mais pavimentos com vão maior', (j) => (ext(j, 1, 1).cells[0] = ["5'-6", 1]), spanFallsWithFloors, /0 pav\. vs 1 pav\. center: 60" < 66"/],
    ['clear span maior que center', (j) => (ext(j, 2, 1).cells[0] = ["4'-9", 1]), spanFallsWithFloors, /1 pav\. center vs 1 pav\. clear: 54" < 57"/],
    ['NJ diminui com a seção', (j) => (ext(j, 0, 1).cells[0] = ["5'-0", 3]), jacksGrowWithSection, /NJ 2-2x10 = 2 < 2-2x6 = 3/],
    ['linha esquecida num grupo', (j) => j.tables[0]!.groups[2]!.headers.splice(0, 1), sameRowsInEveryGroup, /1 pav\. clear: falta a linha 1-2x8/],
  ])('%s', (_, mutate, check, message) => {
    expect(issues(mutate, check).join('\n')).toMatch(message);
  });
});
