import { describe, expect, it } from 'vitest';
import type { Config, Member, Opening, Wall } from '../../src/types';
import { framingForOpening, openingKingXs, openingStudCounts, openingZone } from '../../src/rules/openings';
import { expectSameMembers } from '../helpers/members';
import window from '../fixtures/wall-144-window.json';
import low from '../fixtures/wall-144-window-82.5.json';
import doorFx from '../fixtures/wall-120-door.json';
import nonBearingDoor from '../fixtures/wall-120-door-nonbearing.json';

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

  it('fixture wall-144-window-82.5: header baixo, cripples acima nas marcas 64 e 80 (studs em 63.25 e 79.25; vão de 2.375)', () => {
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
    expect(xs(byRole(members, 'cripple'))).toEqual([63.25, 79.25]);
  });

  it('stud de marca que invade o jack fica de fora', () => {
    // RO [47.5, 83.5]: jack esquerdo em 46–47.5 → stud da marca 48 (47.25–48.75) invade
    expect(xs(byRole(frame({ ...win, offset: 47.5 }, wall, config), 'cripple'))).toEqual([63.25, 79.25]);
  });

  describe('P13 — marca a até 2" do jack', () => {
    const cripples = (patch: Partial<Opening>, cfg: Config = config) =>
      xs(byRole(frame({ ...win, ...patch }, wall, cfg), 'cripple'));

    it('fixture: stud da marca 80 (79.25–80.75) a 3.25" do jack em 84 continua com cripple', () => {
      expect(cripples({})).toEqual([63.25, 79.25]);
    });

    it('1" do jack esquerdo: sai (vão jack→próximo stud 17 ≤ 24)', () => {
      // RO [46.25, 82.25]: jack esquerdo em 44.75–46.25, stud 47.25 a 1"; stud 79.25 termina em 80.75,
      // a 1.5" do jack direito → sai também
      expect(cripples({ offset: 46.25 })).toEqual([63.25]);
    });

    it('exatamente 2" (limite): sai; 2.5": fica', () => {
      // RO [45.25, 81.25]: stud 47.25 a 2" → sai; stud 79.25 termina em 80.75, a 0.5" → sai
      expect(cripples({ offset: 45.25 })).toEqual([63.25]);
      // RO [44.75, 80.75]: stud 47.25 a 2.5" → fica; stud 79.25 colado ao jack → sai
      expect(cripples({ offset: 44.75 })).toEqual([47.25, 63.25]);
    });

    it('1.5" do jack direito: sai', () => {
      // RO [36, 66.25]: stud 63.25 termina em 64.75; vão 48.75 → 66.25 = 17.5 ≤ 24
      expect(cripples({ offset: 36, roughWidth: 30.25 })).toEqual([47.25]);
    });

    it('24" OC: omitir estouraria 24" de vão → cripple fica', () => {
      // RO [45.25, 81.25]: stud 47.25 a 2"; sem ele, jack→stud 71.25 = 26 > 24
      expect(cripples({ offset: 45.25 }, { ...config, studSpacing: 24 })).toEqual([47.25, 71.25]);
    });

    it('RO estreito sem outra marca: sai (apoio seguinte é o jack oposto)', () => {
      // RO [45.25, 59.25]: stud 47.25 a 2"; vão jack→jack 14 ≤ 24
      expect(cripples({ offset: 45.25, roughWidth: 14 })).toEqual([]);
    });

    it('vale também acima do header', () => {
      // RO [46.25, 82.25], header em 82.5: acima e abaixo com as mesmas marcas
      const members = frame({ ...win, offset: 46.25, headerHeight: 82.5 }, wall, config);
      const above = byRole(members, 'cripple').filter((c) => c.y > 1.5);
      const below = byRole(members, 'cripple').filter((c) => c.y === 1.5);
      expect(xs(above)).toEqual([63.25]);
      expect(xs(below)).toEqual([63.25]);
    });
  });

  it('stud colado ao jack direito fica de fora (RO [36, 64.75]: stud da marca 64 termina em 64.75)', () => {
    const members = frame({ ...win, offset: 36, roughWidth: 28.75 }, wall, config);
    expect(xs(byRole(members, 'cripple'))).toEqual([47.25]);
  });

  it('24" OC usa as marcas de 24 (stud 71.25 dentro do RO [48, 84]; 47.25 começa antes do jack)', () => {
    const members = frame(win, wall, { ...config, studSpacing: 24 });
    expect(xs(byRole(members, 'cripple'))).toEqual([71.25]);
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
    const { building: _b, ...noBuilding } = config;
    expect(() => frame(noHeader, wall, noBuilding)).toThrow(/parede W-window, abertura win1: .*config\.building/);
  });

  it('options.header: usa o header recebido — jacks dele definem zona, kings e comprimento; avisos repassados', () => {
    const { header: _h, ...noHeader } = win;
    const warning = { code: 'HEADER_JACKS_BELOW_TABLE', message: 'x' };
    const { members, warnings } = framingForOpening(noHeader, wall, config, {
      header: { section: '2x6', plies: 2, jackStuds: 2, kingStuds: 1, source: 'R602.7(1)', flat: false, warnings: [warning] },
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

  it('options.header com warnings vazios e flat false: header em pé como sempre', () => {
    const { header: _h, ...noHeader } = win;
    const members = frame(noHeader, wall, config, {
      header: { section: '2x10', plies: 2, jackStuds: 1, kingStuds: 1, source: 'project', flat: false, warnings: [] },
    });
    expectSameMembers(members, expectedOpening);
  });
});

describe('framingForOpening — parede não portante (R602.7.4)', () => {
  const nbWall: Wall = { ...wall, bearing: false };
  const { header: _h, ...noHeader } = win;
  const lowConfig = low.config as Config; // headerHeight 82.5

  it('janela: peça deitada da seção da parede (1.5" de altura) sobre os jacks, sill e cripples abaixo como sempre', () => {
    const members = frame(noHeader, nbWall, lowConfig);
    expect(byRole(members, 'header')[0]).toEqual({
      role: 'header',
      section: '2x6',
      length: 39,
      x: 46.5,
      y: 82.5,
      orientation: 'horizontal',
      plies: 1,
      headerSource: 'R602.7.4',
      flat: true,
    });
    expect(byRole(members, 'jackStud').map((j) => j.length)).toEqual([81, 81]);
    expect(byRole(members, 'sill')[0]).toMatchObject({ y: 33 });
    // 10.125" entre o topo da peça (84) e a top plate (94.125): dentro dos 24", e mesmo assim sem cripples acima
    expect(byRole(members, 'cripple').map((c) => [c.x, c.y, c.length])).toEqual([
      [63.25, 1.5, 31.5],
      [79.25, 1.5, 31.5],
    ]);
  });

  it('sem headerHeight: peça encostada sob a top plate (base em 92.625)', () => {
    const members = frame(noHeader, nbWall, config);
    expect(byRole(members, 'header')[0]).toMatchObject({ y: 92.625, flat: true });
    expect(byRole(members, 'jackStud')[0]?.length).toBe(91.125);
  });

  it('topo da peça a exatamente 24" da top plate passa; a mais, Error pedindo o header do projeto', () => {
    // top plate em 94.125; topo = base + 1.5 → base 68.625 dá 24"
    expect(() => frame({ ...noHeader, roughHeight: 40, headerHeight: 68.625 }, nbWall, config)).not.toThrow();
    expect(() => frame({ ...noHeader, roughHeight: 40, headerHeight: 68.5 }, nbWall, config)).toThrow(
      /parede W-window, abertura win1: peça deitada \(R602\.7\.4\) com topo em 70".*24\.125" da top plate.*header da abertura/,
    );
    // com header do projeto a mesma abertura passa, em pé e com cripples acima
    const members = frame({ ...win, roughHeight: 40, headerHeight: 68.5 }, nbWall, config);
    expect(byRole(members, 'header')[0]).toMatchObject({ y: 68.5, section: '2x10' });
    expect(byRole(members, 'cripple').some((c) => c.y > 1.5)).toBe(true);
  });

  it('RO acima de 96" em parede não portante: Error pedindo o header do projeto', () => {
    const big = { ...noHeader, offset: 20, roughWidth: 100 };
    expect(() => frame(big, { ...nbWall, length: 192 }, lowConfig)).toThrow(/até 96"/);
  });

  it('porta: fixture wall-120-door-nonbearing (14 peças, sem cripples acima, corte na obra)', () => {
    const w = nonBearingDoor.wall as Wall;
    const { members, fieldCuts, warnings } = framingForOpening(w.openings[0]!, w, nonBearingDoor.config as Config);
    const expected = (nonBearingDoor.expected.members as Member[]).filter((m) => OPENING_ROLES.has(m.role));
    expectSameMembers(members, expected);
    expect(byRole(members, 'cripple')).toEqual([]);
    expect(byRole(members, 'header')[0]).toMatchObject({ flat: true, plies: 1 });
    expect(fieldCuts).toEqual(nonBearingDoor.expected.fieldCuts);
    expect(warnings).toEqual([]);
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

describe('framingForOpening — sill dupla (S12, config.doubleSillOver)', () => {
  const lowConfig: Config = { ...config, headerHeight: 82.5 };
  const wide = (roughWidth: number, over?: number) =>
    framingForOpening({ ...win, offset: 24, roughWidth }, { ...wall, length: 192 }, {
      ...lowConfig,
      ...(over === undefined ? {} : { doubleSillOver: over }),
    }).members;

  it('RO 84" > 72": duas peças de sill (33 e 31.5), cripples abaixo de 30" em vez de 31.5"', () => {
    const members = wide(84, 72);
    expect(byRole(members, 'sill').map((s) => [s.x, s.y, s.length])).toEqual([
      [24, 33, 84],
      [24, 31.5, 84],
    ]);
    const below = byRole(members, 'cripple').filter((c) => c.y === 1.5);
    expect(below.map((c) => c.length)).toEqual(below.map(() => 30));
    expect(below.map((c) => c.x)).toEqual([31.25, 47.25, 63.25, 79.25, 95.25]);
  });

  it('RO igual ao limite (72") ou abaixo: sill simples; sem doubleSillOver: simples sempre', () => {
    expect(byRole(wide(72, 72), 'sill')).toHaveLength(1);
    expect(byRole(wide(84), 'sill')).toHaveLength(1);
    expect(byRole(wide(84), 'cripple').filter((c) => c.y === 1.5).every((c) => c.length === 31.5)).toBe(true);
  });

  it('porta não tem sill, dupla ou simples', () => {
    const dWall = doorFx.wall as Wall;
    const members = framingForOpening({ ...dWall.openings[0]!, roughWidth: 84 }, { ...dWall, length: 192 }, {
      ...(doorFx.config as Config),
      doubleSillOver: 72,
    }).members;
    expect(byRole(members, 'sill')).toEqual([]);
  });

  it('segunda peça sem espaço sobre a bottom plate: RangeError "sill duplo"', () => {
    // base do RO em 3.5: sill em 2, a segunda ficaria em 0.5 (< 1.5)
    const run = () =>
      framingForOpening({ ...win, offset: 24, roughWidth: 84, roughHeight: 79 }, { ...wall, length: 192 }, {
        ...lowConfig,
        doubleSillOver: 72,
      });
    expect(run).toThrow(/sill duplo sobre a bottom plate/);
  });

  it('doubleSillOver inválido lança RangeError', () => {
    expect(() => wide(84, 0)).toThrow(/config\.doubleSillOver inválido/);
    expect(() => wide(84, NaN)).toThrow(RangeError);
  });
});
