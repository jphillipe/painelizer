import { describe, expect, it } from 'vitest';
import type { Config, Member, Opening, Wall } from '../../src/types';
import { framingForOpening, openingStudCounts, openingZone } from '../../src/rules/openings';
import { expectSameMembers } from '../helpers/members';
import window from '../fixtures/wall-144-window.json';

const wall = window.wall as Wall;
const config = window.config as Config;
const win = wall.openings[0] as Opening;

const OPENING_ROLES = new Set(['kingStud', 'jackStud', 'header', 'sill', 'cripple']);
const expectedOpening = (window.expected.members as Member[]).filter((m) => OPENING_ROLES.has(m.role));

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
    expectSameMembers(framingForOpening(win, wall, config), expectedOpening);
  });

  it('header leva seção e plies do config; orientação por papel', () => {
    const members = framingForOpening(win, wall, config);
    const [header] = byRole(members, 'header');
    expect(header).toMatchObject({ section: '2x10', plies: 2, orientation: 'horizontal' });
    expect(byRole(members, 'sill')[0]?.orientation).toBe('horizontal');
    for (const role of ['kingStud', 'jackStud', 'cripple'] as const) {
      for (const m of byRole(members, role)) expect(m.orientation).toBe('vertical');
    }
  });

  it('headerHeight 82.5: header baixo, cripples acima nas marcas 64 e 80 (vão de 2.375)', () => {
    const members = framingForOpening(win, wall, { ...config, headerHeight: 82.5 });
    expectSameMembers(members, [
      { role: 'kingStud', section: '2x6', length: 92.625, x: 45, y: 1.5 },
      { role: 'kingStud', section: '2x6', length: 92.625, x: 85.5, y: 1.5 },
      { role: 'jackStud', section: '2x6', length: 81, x: 46.5, y: 1.5 },
      { role: 'jackStud', section: '2x6', length: 81, x: 84, y: 1.5 },
      { role: 'header', section: '2x10', length: 39, x: 46.5, y: 82.5 },
      // base do RO = 82.5 − 48 = 34.5; sill em 33
      { role: 'sill', section: '2x6', length: 36, x: 48, y: 33 },
      { role: 'cripple', section: '2x6', length: 31.5, x: 64, y: 1.5 },
      { role: 'cripple', section: '2x6', length: 31.5, x: 80, y: 1.5 },
      // topo do header = 91.75; top plate em 94.125
      { role: 'cripple', section: '2x6', length: 2.375, x: 64, y: 91.75 },
      { role: 'cripple', section: '2x6', length: 2.375, x: 80, y: 91.75 },
    ]);
  });

  it('vão acima do header < 1.5: sem cripples acima', () => {
    // header 2x10 com base em 84 → topo 93.25; vão 0.875
    const members = framingForOpening(win, wall, { ...config, headerHeight: 84 });
    expect(byRole(members, 'cripple').every((c) => c.y === 1.5)).toBe(true);
  });

  it('vão de exatamente 1.5 acima do header: cripples entram', () => {
    const members = framingForOpening(win, wall, { ...config, headerHeight: 83.375 });
    const above = byRole(members, 'cripple').filter((c) => c.y > 1.5);
    expect(above.map((c) => c.length)).toEqual([1.5, 1.5]);
  });

  it('2 kings + 2 jacks: kings nas bordas da zona, jacks no RO, header apoia nos 4 jacks', () => {
    const members = framingForOpening({ ...win, kingStuds: 2, jackStuds: 2 }, wall, config);
    expect(xs(byRole(members, 'kingStud'))).toEqual([42, 43.5, 87, 88.5]);
    expect(xs(byRole(members, 'jackStud'))).toEqual([45, 46.5, 84, 85.5]);
    expect(byRole(members, 'header')[0]).toMatchObject({ x: 45, length: 42 });
    expect(xs(byRole(members, 'cripple'))).toEqual([64, 80]);
  });

  it('marca que invade o jack fica de fora; marca afastada do jack entra', () => {
    // RO [49, 85]: jack esquerdo em 47.5–49 → marca 48 invade
    expect(xs(byRole(framingForOpening({ ...win, offset: 49 }, wall, config), 'cripple'))).toEqual([64, 80]);
    // RO [47, 83]: jack esquerdo em 45.5–47 → marca 48 fica a 1" do jack e entra
    expect(xs(byRole(framingForOpening({ ...win, offset: 47 }, wall, config), 'cripple'))).toEqual([48, 64, 80]);
  });

  it('marca colada ao jack direito fica de fora (RO [36, 65.5]: stud da marca 64 termina em 65.5)', () => {
    const members = framingForOpening({ ...win, offset: 36, roughWidth: 29.5 }, wall, config);
    expect(xs(byRole(members, 'cripple'))).toEqual([48]);
  });

  it('24" OC usa as marcas de 24', () => {
    const members = framingForOpening(win, wall, { ...config, studSpacing: 24 });
    expect(xs(byRole(members, 'cripple'))).toEqual([72]);
  });

  it('vão abaixo do sill < 1.5: sill sem cripples', () => {
    // RO 81 de altura: base em 3.875, sill em 2.375, vão 0.875
    const members = framingForOpening({ ...win, roughHeight: 81 }, wall, config);
    expect(byRole(members, 'sill')[0]?.y).toBe(2.375);
    expect(byRole(members, 'cripple')).toEqual([]);
  });

  it('porta ainda não é suportada (S8)', () => {
    expect(() => framingForOpening({ ...win, type: 'door' }, wall, config)).toThrow(/S8/);
  });

  it('sem seção ou plies de header no config: erro apontando a S9', () => {
    const { defaultHeaderSection: _s, ...noSection } = config;
    const { defaultHeaderPlies: _p, ...noPlies } = config;
    expect(() => framingForOpening(win, wall, noSection)).toThrow(/S9/);
    expect(() => framingForOpening(win, wall, noPlies)).toThrow(/S9/);
  });

  it.each([
    ['zona sai pela esquerda', { offset: 2 }, {}],
    ['zona sai pela direita', { offset: 110 }, {}],
    ['header invade a top plate', {}, { headerHeight: 90 }],
    ['sill abaixo da bottom plate', { roughHeight: 84 }, {}],
  ])('%s → RangeError', (_label, openingPatch, configPatch) => {
    expect(() =>
      framingForOpening({ ...win, ...openingPatch }, wall, { ...config, ...configPatch }),
    ).toThrow(RangeError);
  });

  it('zona encostada nas pontas da parede é válida', () => {
    expect(() => framingForOpening({ ...win, offset: 3 }, wall, config)).not.toThrow();
    expect(() => framingForOpening({ ...win, offset: 105 }, wall, config)).not.toThrow();
  });
});
