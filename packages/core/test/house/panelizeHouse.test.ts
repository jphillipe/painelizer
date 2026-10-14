import { describe, expect, it } from 'vitest';
import type { Config, Panel } from '../../src/types';
import type { House, HouseWall } from '../../src/house/types';
import { panelizeHouse } from '../../src/house/panelizeHouse';
import { splitWall } from '../../src/panelize/splitWall';
import { loadHeaderTables } from '../../src/rules/headers';
import { fakeHeaderJson } from '../helpers/fakeHeaderTables';
import { expectSameMembers, type MemberKeyFields } from '../helpers/members';
import cornerL from '../fixtures/house-corner-L.json';
import tee from '../fixtures/house-tee.json';
import house28x40 from '../fixtures/house-28x40.json';

/** Studs em pé (o stud flat do canto California é listado à parte em `expected.flat`). */
const studXs = (p: Panel) => p.members.filter((m) => m.role === 'stud' && m.flat !== true).map((m) => m.x).sort((a, b) => a - b);
const flatXs = (p: Panel) => p.members.filter((m) => m.role === 'stud' && m.flat === true).map((m) => m.x).sort((a, b) => a - b);

interface ExpectedPanel {
  members: number;
  studs: number[];
  flat: number[];
  warnings: string[];
  expectedMembers?: MemberKeyFields[];
  /** Parede dividida (S15): id da parede, início do painel na parede, comprimento, origem e peso. */
  wallId?: string;
  wallOffset?: number;
  length?: number;
  layoutOrigin?: number;
  weightLb?: number;
}

describe('panelizeHouse — fixtures', () => {
  it.each([
    ['house-corner-L', cornerL],
    ['house-tee', tee],
    ['house-28x40', house28x40],
  ])('%s: painéis por parede, peças, studs e avisos como no fixture', (_name, fx) => {
    const { panels, frames, warnings } = panelizeHouse(fx.house as House, fx.config as Config);
    const expected = fx.expected.panels as Record<string, ExpectedPanel>;
    expect(panels.map((p) => p.id)).toEqual(Object.keys(expected));
    const wallIds = [...new Set(Object.entries(expected).map(([id, e]) => e.wallId ?? id))];
    expect(frames.map((f) => f.wallId)).toEqual(wallIds);
    for (const p of panels) {
      const e = expected[p.id]!;
      const frame = frames.find((f) => f.wallId === p.wallId)!;
      expect(p.wallId, p.id).toBe(e.wallId ?? p.id);
      expect(p.members, p.id).toHaveLength(e.members);
      expect(studXs(p), p.id).toEqual(e.studs);
      expect(flatXs(p), p.id).toEqual(e.flat);
      expect(p.warnings.map((w) => w.code), p.id).toEqual(e.warnings);
      if (e.expectedMembers !== undefined) expectSameMembers(p.members, e.expectedMembers);
      expect(p.length, p.id).toBe(e.length ?? frame.wall.length);
      expect(p.wallOffset, p.id).toBe(e.wallOffset ?? 0);
      expect(p.layoutOrigin, p.id).toBe(e.layoutOrigin ?? frame.layoutOrigin);
      if (e.weightLb !== undefined) expect(p.weightLb, p.id).toBe(e.weightLb);
    }
    // Os painéis de cada parede cobrem a plate inteira, em sequência.
    for (const f of frames) {
      const own = panels.filter((p) => p.wallId === f.wallId);
      expect(own.map((p) => p.wallOffset)).toEqual(own.map((_, i) => own.slice(0, i).reduce((s, p) => s + p.length, 0)));
      expect(own.reduce((s, p) => s + p.length, 0)).toBeCloseTo(f.wall.length, 9);
    }
    expect(warnings).toEqual(panels.flatMap((p) => p.warnings.map((warning) => ({ panelId: p.id, warning }))));
  });

  it('os painéis de cada parede são exatamente o splitWall da Wall derivada (S15)', () => {
    const { panels, frames } = panelizeHouse(house28x40.house as House, house28x40.config as Config);
    expect(panels).toEqual(frames.flatMap((f) => splitWall(f.wall, house28x40.config as Config)));
    expect(panels.map((p) => p.id)).toEqual([
      'W01-P1', 'W01-P2', 'W01-P3', 'W02-P1', 'W02-P2', 'W03-P1', 'W03-P2', 'W03-P3', 'W04-P1', 'W04-P2', 'W05-P1', 'W05-P2',
    ]);
  });
});

describe('panelizeHouse — T e aberturas', () => {
  const base = { height: 97.125, section: '2x6', exterior: true, bearing: true, floorsSupported: 0 } as const;
  const config = tee.config as Config;
  const H = { section: '2x10', plies: 2 } as const;
  const houseWith = (offset: number, teeX = 96): House => ({
    walls: [
      {
        ...base,
        id: 'W1',
        start: { x: 0, y: 0 },
        end: { x: 192, y: 0 },
        openings: [{ id: 'J1', type: 'window', offset, roughWidth: 36, roughHeight: 48, header: H }],
      },
      { ...base, id: 'W2', section: '2x4', exterior: false, bearing: false, start: { x: teeX, y: 0 }, end: { x: teeX, y: 120 }, openings: [] } as HouseWall,
    ],
  });

  it('faixa do T na zona (kings/jacks) avisa OPENING_AT_TEE no painel da parede atravessada', () => {
    const { panels } = panelizeHouse(houseWith(100), config);
    expect(panels[0]!.warnings.map((w) => w.code)).toEqual(['OPENING_AT_TEE']);
    expect(panels[0]!.warnings[0]!.message).toMatch(/parede W1: a parede W2 encosta em T em x=96 \(faixa 94.25–97.75\), na zona da\(s\) abertura\(s\) J1 \[97, 139\]/);
    expect(panels[1]!.warnings).toEqual([]);
  });

  it('faixa do T dentro do RO é erro', () => {
    expect(() => panelizeHouse(houseWith(90), config)).toThrow(/parede W1, abertura J1: a parede W2 encosta em T em x=96 \(faixa 94.25–97.75\), dentro do RO \[90, 126\]/);
  });

  it('faixa do T fora da zona não avisa; encostar na zona não conta', () => {
    expect(panelizeHouse(houseWith(120), config).panels[0]!.warnings).toEqual([]);
    // Zona começa em 97.75 exatamente quando o RO está em 100.75: faixa 94.25–97.75 só encosta.
    expect(panelizeHouse(houseWith(100.75), config).panels[0]!.warnings).toEqual([]);
  });

  it('T na zona: aviso e nenhum bloco; T fora da zona com stud de layout na faixa: blocos divididos (S14)', () => {
    const inZone = panelizeHouse(houseWith(100), config).panels[0]!;
    expect(inZone.members.filter((m) => m.role === 'block')).toEqual([]);
    // T em 96 com a janela longe: faixa 94.25–97.75 contém o stud 95.25–96.75 → dois blocos por altura,
    // 80.75–95.25 e 96.75–111.25? Não: a zona da janela em 120 começa em 117.75 e o stud 111.25 fica.
    const clear = panelizeHouse(houseWith(120), config).panels[0]!;
    const blocks = clear.members.filter((m) => m.role === 'block');
    expect(blocks).toHaveLength(6);
    expect(blocks.filter((b) => b.y === 23.25).map((b) => [b.x, b.length])).toEqual([
      [80.75, 14.5],
      [96.75, 14.5],
    ]);
    // A parede que encosta avança a double top 5.5 (t da W1 2x6) sobre a atravessada.
    expect(clear.members.filter((m) => m.role === 'doubleTopPlate').map((m) => [m.x, m.length])).toEqual([
      [0, 94.25],
      [97.75, 94.25],
    ]);
    const w2 = panelizeHouse(houseWith(120), config).panels[1]!;
    expect(w2.members.filter((m) => m.role === 'doubleTopPlate')).toEqual([
      { role: 'doubleTopPlate', section: '2x4', length: 122.75, x: -5.5, y: 95.625, orientation: 'horizontal' },
    ]);
  });

  it('tabelas injetadas passam para panelizeWall', () => {
    const house: House = {
      walls: [
        { ...base, id: 'W1', start: { x: 0, y: 0 }, end: { x: 192, y: 0 }, openings: [{ id: 'J1', type: 'window', offset: 100, roughWidth: 36, roughHeight: 48 }] },
      ],
    };
    const tables = loadHeaderTables(fakeHeaderJson());
    const { panels } = panelizeHouse(house, { ...config, building: { groundSnowLoad: 30, buildingWidth: 288, windSpeed: 120 } }, tables);
    expect(panels[0]!.members.find((m) => m.role === 'header')?.headerSource).toBe('FAKE-EXT');
  });

  it('erros da planta sobem como RangeError com os ids', () => {
    expect(() => panelizeHouse({ walls: [{ ...base, id: 'A', start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, openings: [] }] }, config)).toThrow(/parede A: fora dos eixos/);
  });
});
