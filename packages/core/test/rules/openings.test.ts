import { describe, expect, it } from 'vitest';
import type { Config, Member, Opening, Wall } from '../../src/types';
import { framingForOpening, openingKingXs, openingStudCounts, openingZone } from '../../src/rules/openings';
import { expectSameMembers } from '../helpers/members';
import window from '../fixtures/wall-144-window.json';
import low from '../fixtures/wall-144-window-82.5.json';
import doorFx from '../fixtures/wall-120-door.json';

const wall = window.wall as Wall;
const config = window.config as Config;
const win = wall.openings[0] as Opening;

const OPENING_ROLES = new Set(['kingStud', 'jackStud', 'header', 'sill', 'cripple']);
const expectedOpening = (window.expected.members as Member[]).filter((m) => OPENING_ROLES.has(m.role));
const expectedLowOpening = (low.expected.members as Member[]).filter((m) => OPENING_ROLES.has(m.role));

/** Só as peças — a maioria dos testes de janela não olha cortes nem avisos. */
const frame = (...args: Parameters<typeof framingForOpening>) => framingForOpening(...args).members;

const byRole = (members: Member[], role: Member['role']) => members.filter((m) => m.role === role);
const xs = (members: Member[]) => members.map((m) => m.x).sort((a, b) => a - b);

describe('openingZone', () => {
  it('1 king + 1 jack: RO ± 3 (fixture: [45, 87])', () => {
    expect(openingZone(win, 1.5)).toEqual({ start: 45, end: 87 });
  });

  it('2 kings + 1 jack: RO ± 4.5', () => {
    expect(openingZone({ ...win, kingStuds: 2 }, 1.5)).toEqual({ start: 43.5, end: 88.5 });
  });

  it('2 kings + 2 jacks: RO ± 6', () => {
    expect(openingZone({ ...win, kingStuds: 2, jackStuds: 2 }, 1.5)).toEqual({ start: 42, end: 90 });
  });

  it.each([
    [{ kingStuds: 0 }],
    [{ jackStuds: 1.5 }],
    [{ roughWidth: 0 }],
    [{ roughHeight: -1 }],
    [{ offset: Number.NaN }],
  ])('rejeita %j', (patch) => {
    expect(() => openingZone({ ...win, ...patch }, 1.5)).toThrow(RangeError);
  });
});

describe('openingStudCounts', () => {
  it('ausente = 1 e 1', () => {
    expect(openingStudCounts(win)).toEqual({ kings: 1, jacks: 1 });
    expect(openingStudCounts({ ...win, kingStuds: 2, jackStuds: 3 })).toEqual({ kings: 2, jacks: 3 });
  });
});

describe('framingForOpening — janela', () => {
  it('fixture wall-144-window: kings, jacks, header, sill e cripples do exemplo resolvido', () => {
    expectSameMembers(frame(win, wall, config), expectedOpening);
  });

  it('header leva seção, plies e origem do header resolvido (aqui, o do projeto); orientação por papel', () => {
    const members = frame(win, wall, config);
    const [header] = byRole(members, 'header');
    expect(header).toMatchObject({ section: '2x10', plies: 2, orientation: 'horizontal', headerSource: 'project' });
    expect(byRole(members, 'sill')[0]?.orientation).toBe('horizontal');
    for (const role of ['kingStud', 'jackStud', 'cripple'] as const) {
      for (const m of byRole(members, role)) expect(m.orientation).toBe('vertical');
    }
  });

  it('fixture wall-144-window-82.5: header baixo, cripples acima nas marcas 64 e 80 (vão de 2.375)', () => {
    const members = frame(
      low.wall.openings[0] as Opening,
      low.wall as Wall,
      low.config as Config,
    );
    expectSameMembers(members, expectedLowOpening);
  });

  it('Opening.headerHeight sem config.headerHeight dá o mesmo resultado do fixture 82.5', () => {
    const members = frame({ ...win, headerHeight: 82.5 }, wall, config);
    expectSameMembers(members, expectedLowOpening);
  });

  it('Opening.headerHeight sobrescreve config.headerHeight (o projeto manda, P2)', () => {
    const lowConfig = low.config as Config;
    const members = frame({ ...win, headerHeight: 80 }, wall, lowConfig);
    expect(byRole(members, 'header')[0]?.y).toBe(80);
    expect(byRole(members, 'jackStud').map((j) => j.length)).toEqual([78.5, 78.5]);
    // base do RO 32, sill em 30.5
    expect(byRole(members, 'sill')[0]?.y).toBe(30.5);
    // topo do header 89.25 → cripples acima de 4.875
    expect(byRole(members, 'cripple').filter((c) => c.y > 1.5).map((c) => c.length)).toEqual([4.875, 4.875]);
    // sem headerHeight na abertura, vale o config
    expect(byRole(frame(win, wall, lowConfig), 'header')[0]?.y).toBe(82.5);
  });

  it('Opening.headerHeight também é validado (header invadindo a top plate)', () => {
    expect(() => frame({ ...win, headerHeight: 90 }, wall, low.config as Config)).toThrow(
      RangeError,
    );
  });

  it('vão acima do header < 1.5: sem cripples acima', () => {
    // header 2x10 com base em 84 → topo 93.25; vão 0.875
    const members = frame(win, wall, { ...config, headerHeight: 84 });
    expect(byRole(members, 'cripple').every((c) => c.y === 1.5)).toBe(true);
  });

  it('vão de exatamente 1.5 acima do header: cripples entram', () => {
    const members = frame(win, wall, { ...config, headerHeight: 83.375 });
    const above = byRole(members, 'cripple').filter((c) => c.y > 1.5);
    expect(above.map((c) => c.length)).toEqual([1.5, 1.5]);
  });

  it('2 kings + 2 jacks: kings nas bordas da zona, jacks no RO, header apoia nos 4 jacks', () => {
    const members = frame({ ...win, kingStuds: 2, jackStuds: 2 }, wall, config);
    expect(xs(byRole(members, 'kingStud'))).toEqual([42, 43.5, 87, 88.5]);
    expect(xs(byRole(members, 'jackStud'))).toEqual([45, 46.5, 84, 85.5]);
    expect(byRole(members, 'header')[0]).toMatchObject({ x: 45, length: 42 });
    expect(xs(byRole(members, 'cripple'))).toEqual([64, 80]);
  });

  it('marca que invade o jack fica de fora; marca afastada do jack entra', () => {
    // RO [49, 85]: jack esquerdo em 47.5–49 → marca 48 invade
    expect(xs(byRole(frame({ ...win, offset: 49 }, wall, config), 'cripple'))).toEqual([64, 80]);
    // RO [47, 83]: jack esquerdo em 45.5–47 → marca 48 fica a 1" do jack e entra
    expect(xs(byRole(frame({ ...win, offset: 47 }, wall, config), 'cripple'))).toEqual([48, 64, 80]);
  });

  it('marca colada ao jack direito fica de fora (RO [36, 65.5]: stud da marca 64 termina em 65.5)', () => {
    const members = frame({ ...win, offset: 36, roughWidth: 29.5 }, wall, config);
    expect(xs(byRole(members, 'cripple'))).toEqual([48]);
  });

  it('24" OC usa as marcas de 24', () => {
    const members = frame(win, wall, { ...config, studSpacing: 24 });
    expect(xs(byRole(members, 'cripple'))).toEqual([72]);
  });

  it('vão abaixo do sill < 1.5: sill sem cripples', () => {
    // RO 81 de altura: base em 3.875, sill em 2.375, vão 0.875
    const members = frame({ ...win, roughHeight: 81 }, wall, config);
    expect(byRole(members, 'sill')[0]?.y).toBe(2.375);
    expect(byRole(members, 'cripple')).toEqual([]);
  });

  it('janela não gera corte na obra nem aviso', () => {
    const { fieldCuts, warnings } = framingForOpening(win, wall, config);
    expect(fieldCuts).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('{ kings: false } omite só os kings (vêm da fusão de zonas)', () => {
    const all = frame(win, wall, config);
    const noKings = frame(win, wall, config, { kings: false });
    expectSameMembers(noKings, all.filter((m) => m.role !== 'kingStud'));
  });

  it('sem header possível (parede portante, sem header do projeto nem dados da casa): erro, nenhuma peça', () => {
    const { header: _h, ...noHeader } = win;
    expect(() => frame(noHeader, wall, config)).toThrow(/parede W-window, abertura win1: .*config\.building/);
  });

  it('options.header: usa o header recebido — jacks dele definem zona, kings e comprimento; avisos repassados', () => {
    const { header: _h, ...noHeader } = win;
    const warning = { code: 'HEADER_JACKS_BELOW_TABLE', message: 'x' };
    const { members, warnings } = framingForOpening(noHeader, wall, config, {
      header: { section: '2x6', plies: 2, jackStuds: 2, source: 'R602.7(1)', warnings: [warning] },
    });
    expect(xs(byRole(members, 'kingStud'))).toEqual([43.5, 87]);
    expect(xs(byRole(members, 'jackStud'))).toEqual([45, 46.5, 84, 85.5]);
    expect(byRole(members, 'header')[0]).toMatchObject({
      section: '2x6',
      plies: 2,
      x: 45,
      length: 42,
      headerSource: 'R602.7(1)',
    });
    expect(warnings).toEqual([warning]);
  });

  it('parede não portante sem header do projeto: padrão do config, origem default', () => {
    const { header: _h, ...noHeader } = win;
    const members = frame(noHeader, { ...wall, bearing: false }, config);
    expect(byRole(members, 'header')[0]).toMatchObject({ section: '2x10', plies: 2, headerSource: 'default' });
  });

  it.each([
    ['zona sai pela esquerda', { offset: 2 }, {}],
    ['zona sai pela direita', { offset: 110 }, {}],
    ['header invade a top plate', {}, { headerHeight: 90 }],
    ['sill abaixo da bottom plate', { roughHeight: 84 }, {}],
  ])('%s → RangeError', (_label, openingPatch, configPatch) => {
    expect(() =>
      frame({ ...win, ...openingPatch }, wall, { ...config, ...configPatch }),
    ).toThrow(RangeError);
  });

  it('zona encostada nas pontas da parede é válida', () => {
    expect(() => frame({ ...win, offset: 3 }, wall, config)).not.toThrow();
    expect(() => frame({ ...win, offset: 105 }, wall, config)).not.toThrow();
  });
});

describe('openingKingXs', () => {
  it('1 king: bordas da zona', () => {
    expect(openingKingXs(win, 1.5)).toEqual({ left: [45], right: [85.5] });
  });

  it('2 kings: em ordem crescente de x dos dois lados', () => {
    expect(openingKingXs({ ...win, kingStuds: 2 }, 1.5)).toEqual({ left: [43.5, 45], right: [85.5, 87] });
  });
});

describe('framingForOpening — porta', () => {
  const dWall = doorFx.wall as Wall;
  const dConfig = doorFx.config as Config;
  const door = dWall.openings[0] as Opening;
  const expectedDoor = (doorFx.expected.members as Member[]).filter((m) => OPENING_ROLES.has(m.role));

  it('fixture wall-120-door: kings, jacks de 81, header e cripples só acima; sem sill', () => {
    const { members, fieldCuts, warnings } = framingForOpening(door, dWall, dConfig);
    expectSameMembers(members, expectedDoor);
    expect(byRole(members, 'sill')).toEqual([]);
    expect(byRole(members, 'cripple').every((c) => c.y === 91.75)).toBe(true);
    expect(fieldCuts).toEqual(doorFx.expected.fieldCuts);
    expect(warnings).toEqual([]);
  });

  it('bottom plate cortada na obra no vão inteiro do RO (P4)', () => {
    const { fieldCuts } = framingForOpening({ ...door, offset: 50, roughWidth: 32 }, dWall, dConfig);
    expect(fieldCuts).toEqual([{ role: 'bottomPlate', openingId: 'door1', x: 50, length: 32 }]);
  });

  it('roughHeight diferente da base do header: aviso DOOR_RO_HEIGHT_MISMATCH, geometria não muda', () => {
    const { members, warnings } = framingForOpening({ ...door, roughHeight: 80 }, dWall, dConfig);
    expectSameMembers(members, expectedDoor);
    expect(warnings.map((w) => w.code)).toEqual(['DOOR_RO_HEIGHT_MISMATCH']);
    expect(warnings[0]!.message).toMatch(/door1.*80".*82\.5"/);
  });

  it('diferença abaixo de 1/64" não avisa; a partir de 1/64" avisa', () => {
    const warn = (roughHeight: number) =>
      framingForOpening({ ...door, roughHeight }, dWall, dConfig).warnings.length;
    expect(warn(82.5 + 1 / 128)).toBe(0);
    expect(warn(82.5 + 1 / 64)).toBe(1);
  });

  it('Opening.headerHeight manda também na porta; roughHeight acompanhando = sem aviso', () => {
    const { members, warnings } = framingForOpening(
      { ...door, roughHeight: 84, headerHeight: 84 },
      dWall,
      dConfig,
    );
    expect(byRole(members, 'jackStud').map((j) => j.length)).toEqual([82.5, 82.5]);
    expect(byRole(members, 'header')[0]?.y).toBe(84);
    expect(warnings).toEqual([]);
  });

  it('sem headerHeight em lugar nenhum: header encostado na top plate e RO 82.5 avisa', () => {
    const { headerHeight: _h, ...noHeight } = dConfig;
    const { members, warnings } = framingForOpening(door, dWall, noHeight);
    expect(byRole(members, 'header')[0]?.y).toBe(84.875);
    expect(byRole(members, 'cripple')).toEqual([]);
    expect(warnings.map((w) => w.code)).toEqual(['DOOR_RO_HEIGHT_MISMATCH']);
  });

  it('header de porta sem espaço para jack → RangeError', () => {
    expect(() => framingForOpening({ ...door, headerHeight: 1.5 }, dWall, dConfig)).toThrow(RangeError);
  });
});
