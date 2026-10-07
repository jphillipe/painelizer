import { describe, expect, it } from 'vitest';
import type { Config, Opening, Wall } from '../../src/types';
import { loadHeaderTables } from '../../src/rules/headers';
import { resolveOpeningHeader } from '../../src/rules/openingHeader';
import { fakeHeaderJson } from '../helpers/fakeHeaderTables';
import irc from '../fixtures/wall-144-window-irc.json';
import nonBearingDoor from '../fixtures/wall-120-door-nonbearing.json';

// Tabela FALSA (ver helper): colunas A = 20 psf/10', B = 20 psf/30', C = 40 psf/10', D = 40 psf/30'.
const FAKE = loadHeaderTables(fakeHeaderJson());

const config: Config = {
  studSpacing: 16,
  studThickness: 1.5,
  plateThickness: 1.5,
  studLength: [92.625],
  building: { groundSnowLoad: 20, buildingWidth: 120, windSpeed: 120 },
};

const wall: Wall = {
  id: 'W1',
  length: 144,
  height: 97.125,
  section: '2x6',
  exterior: true,
  bearing: true,
  floorsSupported: 0,
  openings: [],
};

const op = (roughWidth: number, extra: Partial<Opening> = {}): Opening => ({
  id: 'o1',
  type: 'window',
  offset: 30,
  roughWidth,
  roughHeight: 48,
  ...extra,
});

const resolve = (o: Opening, w: Wall = wall, c: Config = config) => resolveOpeningHeader(o, w, c, FAKE);

describe('resolveOpeningHeader — header do projeto', () => {
  it('manda sobre a tabela, mesmo sem dados da casa; origem project, 1 jack por padrão', () => {
    const { building: _b, ...noBuilding } = config;
    const { floorsSupported: _f, ...noFloors } = wall;
    expect(resolve(op(72, { header: { section: '2x12', plies: 2 } }), noFloors, noBuilding)).toEqual({
      section: '2x12',
      plies: 2,
      jackStuds: 1,
      kingStuds: 1,
      source: 'project',
      flat: false,
      warnings: [expect.objectContaining({ code: 'WIND_SPEED_MISSING' })],
    });
  });

  it('jacks: opening.jackStuds → header.jackStuds → 1; sem aviso de tabela', () => {
    const header = { section: '2x10', plies: 2, jackStuds: 2 } as const;
    expect(resolve(op(72, { header }))).toMatchObject({ jackStuds: 2, warnings: [] });
    expect(resolve(op(72, { header, jackStuds: 3 }))).toMatchObject({ jackStuds: 3, warnings: [] });
    expect(resolve(op(72, { header, jackStuds: 1 }))).toMatchObject({ jackStuds: 1, warnings: [] });
  });

  it('vale também em parede não portante', () => {
    const r = resolve(op(36, { header: { section: '2x6', plies: 2 } }), { ...wall, bearing: false });
    expect(r).toMatchObject({ section: '2x6', source: 'project' });
  });

  it('mais espesso que a parede: erro (4 plies em 2x6, 3 plies em 2x4)', () => {
    expect(() => resolve(op(36, { header: { section: '2x12', plies: 4 } }))).toThrow(
      /parede W1, abertura o1: header do projeto com 4 plies \(6"\) não cabe em parede 2x6/,
    );
    expect(() => resolve(op(36, { header: { section: '2x12', plies: 3 } }), { ...wall, section: '2x4' })).toThrow(
      /não cabe em parede 2x4/,
    );
    expect(() => resolve(op(36, { header: { section: '2x12', plies: 3 } }))).not.toThrow();
  });

  it.each([
    [{ header: { section: '2x10', plies: 0 } }],
    [{ header: { section: '2x10', plies: 2, jackStuds: 1.5 } }],
    [{ header: { section: '2x5', plies: 2 } }],
    [{ jackStuds: 0 }],
  ])('número inválido %j → RangeError com parede e abertura', (extra) => {
    expect(() => resolve(op(36, extra as Partial<Opening>))).toThrow(RangeError);
    expect(() => resolve(op(36, extra as Partial<Opening>))).toThrow(/parede W1, abertura o1/);
  });
});

describe('resolveOpeningHeader — parede portante, pela tabela', () => {
  it('externa: neve e largura de config.building, vão = largura do RO; origem = id da tabela', () => {
    // Kings pela R602.7.5 real (120 mph B): 3' → 1, 6' → 2.
    const ext = { source: 'FAKE-EXT', flat: false, warnings: [] };
    expect(resolve(op(36))).toEqual({ section: '2x6', plies: 2, jackStuds: 1, kingStuds: 1, ...ext });
    expect(resolve(op(72))).toEqual({ section: '2x10', plies: 2, jackStuds: 2, kingStuds: 2, ...ext });
  });

  it('wall.buildingWidth sobrescreve a largura do projeto (casa em L)', () => {
    // 50": coluna A (10') → 2-2x6 até 5'; coluna B (30') → 2-2x6 só até 4', sobe para 2-2x10
    expect(resolve(op(50))).toMatchObject({ section: '2x6' });
    expect(resolve(op(50), { ...wall, buildingWidth: 360 })).toMatchObject({ section: '2x10', jackStuds: 2 });
  });

  it('floorSpan da parede escolhe o grupo; ausente = pior caso', () => {
    const one: Wall = { ...wall, floorsSupported: 1, buildingWidth: 360 };
    expect(resolve(op(36), { ...one, floorSpan: 'center' })).toMatchObject({ section: '2x6', jackStuds: 1 });
    expect(resolve(op(36), { ...one, floorSpan: 'clear' })).toMatchObject({ section: '2x6', jackStuds: 2 });
    expect(resolve(op(36), one)).toMatchObject({ section: '2x6', jackStuds: 2 });
  });

  it('seção da parede vai para a tabela: 9\' cabe em 2x6 (3 plies), não em 2x4', () => {
    expect(resolve(op(108))).toMatchObject({ section: '2x10', plies: 3 });
    expect(() => resolve(op(108), { ...wall, section: '2x4' })).toThrow(
      /parede W1, abertura o1: header fora da tabela \(.*cabem em parede 2x4\).*engenheiro/,
    );
  });

  it('interna: tabela sem neve', () => {
    const interior: Wall = { ...wall, exterior: false, floorsSupported: 1 };
    expect(resolve(op(36), interior)).toEqual({
      section: '2x6',
      plies: 2,
      jackStuds: 1,
      kingStuds: 1,
      source: 'FAKE-INT',
      flat: false,
      warnings: [],
    });
  });

  it('opening.jackStuds abaixo do NJ: painel sai com o pedido e aviso HEADER_JACKS_BELOW_TABLE', () => {
    const r = resolve(op(72, { jackStuds: 1 }));
    expect(r).toMatchObject({ section: '2x10', jackStuds: 1 });
    expect(r.warnings.map((w) => w.code)).toEqual(['HEADER_JACKS_BELOW_TABLE']);
    expect(r.warnings[0]!.message).toMatch(/parede W1, abertura o1: 1 jack.*FAKE-EXT pede 2.*2-2x10/);
  });

  it('opening.jackStuds igual ou acima do NJ: sem aviso', () => {
    expect(resolve(op(72, { jackStuds: 2 }))).toMatchObject({ jackStuds: 2, warnings: [] });
    expect(resolve(op(72, { jackStuds: 3 }))).toMatchObject({ jackStuds: 3, warnings: [] });
  });

  it('fora da tabela → Error com parede, abertura e motivo (nunca header chutado)', () => {
    expect(() => resolve(op(200))).toThrow(/parede W1, abertura o1: header fora da tabela \(vão 200"/);
    expect(() => resolve(op(36), { ...wall, floorsSupported: 2 })).toThrow(/2 pavimento/);
    expect(() => resolve(op(36), { ...wall, buildingWidth: 400 })).toThrow(/largura 400"/);
  });

  it('dado faltando → Error dizendo qual', () => {
    const { building: _b, ...noBuilding } = config;
    const { floorsSupported: _f, ...noFloors } = wall;
    expect(() => resolve(op(36), wall, noBuilding)).toThrow(/parede W1, abertura o1: .*sem config\.building/);
    expect(() => resolve(op(36), noFloors)).toThrow(/parede W1, abertura o1: .*sem wall\.floorsSupported/);
  });

  it('dado inválido da casa → RangeError com parede e abertura', () => {
    expect(() => resolve(op(36), { ...wall, floorsSupported: 1.5 })).toThrow(RangeError);
    expect(() => resolve(op(36), { ...wall, buildingWidth: -1 })).toThrow(/parede W1, abertura o1: buildingWidth/);
  });

  it('header da tabela não é deitado', () => {
    expect(resolve(op(36))).toMatchObject({ flat: false });
  });
});

describe('resolveOpeningHeader — parede não portante (R602.7.4)', () => {
  const nonBearing: Wall = { ...wall, bearing: false };

  it('peça deitada da seção da parede, 1 ply, 1 jack; sem tabela nem dados da casa', () => {
    const { building: _b, ...noBuilding } = config;
    expect(resolveOpeningHeader(op(36), nonBearing, noBuilding, [])).toEqual({
      section: '2x6',
      plies: 1,
      jackStuds: 1,
      kingStuds: 1,
      source: 'R602.7.4',
      flat: true,
      warnings: [expect.objectContaining({ code: 'WIND_SPEED_MISSING' })],
    });
    expect(resolve(op(36), { ...nonBearing, section: '2x4' })).toMatchObject({ section: '2x4', flat: true });
    expect(resolve(op(36, { jackStuds: 2 }), nonBearing)).toMatchObject({ jackStuds: 2 });
  });

  it('vale até RO de 96"; acima, Error pedindo o header da abertura', () => {
    expect(resolve(op(96), nonBearing)).toMatchObject({ flat: true });
    expect(() => resolve(op(96.5), nonBearing)).toThrow(
      /parede W1, abertura o1: parede não portante com RO de 96\.5".*até 96".*header da abertura/,
    );
    expect(resolve(op(120, { header: { section: '2x10', plies: 2 } }), nonBearing)).toMatchObject({
      source: 'project',
      flat: false,
    });
  });
});

describe('resolveOpeningHeader — tabela IRC real', () => {
  it('fixture wall-144-window-irc: 50 psf, 28\', só telhado, RO 36" → 2-2x6 com 2 jacks pela R602.7(1)', () => {
    const w = irc.wall as Wall;
    expect(resolveOpeningHeader(w.openings[0]!, w, irc.config as Config)).toEqual({
      ...irc.expected.header,
      flat: false,
      warnings: [],
    });
  });

  it('fixture wall-120-door-nonbearing: 2x4 deitado pela R602.7.4', () => {
    const w = nonBearingDoor.wall as Wall;
    expect(resolveOpeningHeader(w.openings[0]!, w, nonBearingDoor.config as Config)).toEqual({
      ...nonBearingDoor.expected.header,
      warnings: [],
    });
  });
});

describe('resolveOpeningHeader — kings pela Tabela R602.7.5 (S12)', () => {
  // Header do projeto para não depender da tabela de headers; a tabela de kings é a REAL (120 mph B).
  const H = { section: '2x10', plies: 2 } as const;
  const kings = (o: Opening, w: Wall = wall, c: Config = config) => {
    const r = resolve(o, w, c);
    return { kingStuds: r.kingStuds, codes: r.warnings.map((x) => x.code) };
  };

  it("parede externa sem kingStuds: tabela pelo vão do RO e pelo vento (3' → 1, 6' → 2, 10' → 3)", () => {
    expect(kings(op(36, { header: H }))).toEqual({ kingStuds: 1, codes: [] });
    expect(kings(op(72, { header: H }))).toEqual({ kingStuds: 2, codes: [] });
    expect(kings(op(120, { header: H }))).toEqual({ kingStuds: 3, codes: [] });
  });

  it("exposição C muda a coluna: 110 mph C → coluna de mais vento (6' → 2); 110 mph B → 1", () => {
    const at = (exposure: 'B' | 'C') => ({ ...config, building: { ...config.building!, windSpeed: 110, exposure } });
    expect(kings(op(72, { header: H }), wall, at('C'))).toEqual({ kingStuds: 2, codes: [] });
    expect(kings(op(72, { header: H }), wall, at('B'))).toEqual({ kingStuds: 1, codes: [] });
  });

  it('kingStuds do projeto manda; abaixo da tabela avisa HEADER_KINGS_BELOW_TABLE', () => {
    expect(kings(op(72, { header: H, kingStuds: 3 }))).toEqual({ kingStuds: 3, codes: [] });
    const r = resolve(op(72, { header: H, kingStuds: 1 }));
    expect(r.kingStuds).toBe(1);
    expect(r.warnings.map((w) => w.code)).toEqual(['HEADER_KINGS_BELOW_TABLE']);
    expect(r.warnings[0]!.message).toMatch(/parede W1, abertura o1: 1 king.*R602\.7\.5 pede 2.*72".*120 mph.*B/);
  });

  it('avisos de jacks vêm antes dos de kings', () => {
    const r = resolve(op(72, { jackStuds: 1, kingStuds: 1 }));
    expect(r.warnings.map((w) => w.code)).toEqual(['HEADER_JACKS_BELOW_TABLE', 'HEADER_KINGS_BELOW_TABLE']);
  });

  it('sem windSpeed: 1 king e aviso WIND_SPEED_MISSING; com kingStuds do projeto, nem aviso', () => {
    const { windSpeed: _w, ...noWind } = config.building!;
    const c = { ...config, building: noWind };
    expect(kings(op(72, { header: H }), wall, c)).toEqual({ kingStuds: 1, codes: ['WIND_SPEED_MISSING'] });
    expect(kings(op(72, { header: H, kingStuds: 2 }), wall, c)).toEqual({ kingStuds: 2, codes: [] });
    const { building: _b, ...noBuilding } = config;
    expect(kings(op(72, { header: H }), wall, noBuilding)).toEqual({ kingStuds: 1, codes: ['WIND_SPEED_MISSING'] });
  });

  it('parede interna: kingStuds ou 1, sem tabela nem aviso, mesmo sem vento', () => {
    const interior: Wall = { ...wall, exterior: false, floorsSupported: 1 };
    const { building: _b, ...noBuilding } = config;
    expect(kings(op(120, { header: H }), interior, noBuilding)).toEqual({ kingStuds: 1, codes: [] });
    expect(kings(op(120, { header: H, kingStuds: 2 }), interior, noBuilding)).toEqual({ kingStuds: 2, codes: [] });
  });

  it('parede externa não portante também segue a tabela (regra de vento, não de carga)', () => {
    const nonBearing: Wall = { ...wall, bearing: false };
    expect(kings(op(72), nonBearing)).toEqual({ kingStuds: 2, codes: [] });
  });

  it("fora da tabela (vento ≥ 140 B, RO > 18') sem kingStuds → Error; com kingStuds, o projeto manda", () => {
    const windy = { ...config, building: { ...config.building!, windSpeed: 140 } };
    expect(() => resolve(op(36, { header: H }), wall, windy)).toThrow(
      /parede W1, abertura o1: kings fora da tabela \(vento 140 mph.*engenheiro; informe kingStuds/,
    );
    expect(kings(op(36, { header: H, kingStuds: 2 }), wall, windy)).toEqual({ kingStuds: 2, codes: [] });
    expect(() => resolve(op(220, { header: H }))).toThrow(/vão 220" acima da última linha/);
  });

  it('kingStuds ou vento inválidos → RangeError com parede e abertura', () => {
    expect(() => resolve(op(36, { header: H, kingStuds: 0 }))).toThrow(/parede W1, abertura o1: kingStuds/);
    const bad = { ...config, building: { ...config.building!, windSpeed: -5 } };
    expect(() => resolve(op(36, { header: H }), wall, bad)).toThrow(/parede W1, abertura o1: windSpeed/);
  });

  it('tabelas injetadas por { headers, kings }; a lista de headers continua aceita', () => {
    const tiny = {
      id: 'T',
      columns: [{ covers: [{ exposure: 'B' as const, below: 999 }] }],
      rows: [{ maxSpan: 48, kings: [5] }],
    };
    expect(resolveOpeningHeader(op(36), wall, config, { headers: FAKE, kings: tiny })).toMatchObject({
      section: '2x6',
      kingStuds: 5,
    });
    expect(resolveOpeningHeader(op(36), wall, config, { headers: FAKE })).toMatchObject({ kingStuds: 1 });
  });
});
