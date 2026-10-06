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
  building: { groundSnowLoad: 20, buildingWidth: 120 },
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
      source: 'project',
      flat: false,
      warnings: [],
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
    const ext = { source: 'FAKE-EXT', flat: false, warnings: [] };
    expect(resolve(op(36))).toEqual({ section: '2x6', plies: 2, jackStuds: 1, ...ext });
    expect(resolve(op(72))).toEqual({ section: '2x10', plies: 2, jackStuds: 2, ...ext });
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
      source: 'R602.7.4',
      flat: true,
      warnings: [],
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
