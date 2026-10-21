import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { draftFromText } from './draft';
import { DEFAULT_ELEVATION_HEIGHT, elevationOf } from './elevation';

const load = (text: string) => {
  const r = draftFromText(text);
  if (!r.ok) throw new Error('fixture não abre');
  return r.draft;
};

describe('elevação esquemática (M5)', () => {
  it('Ringgold (solto): comprimento, altura do draft e os RO como o motor os resolve', () => {
    const d = load(EXAMPLES[2]!.text);
    const s2 = d.walls.find((w) => w.id === 'S2')!;
    const e = elevationOf(d, s2);
    expect(e.length).toBe(144);
    expect(e.heightKnown).toBe(true);
    expect(e.openings.map((o) => o.id)).toEqual(s2.openings.map((o) => o.id));
    const door = e.openings.find((o) => o.type === 'door')!;
    expect(door.bottom).toBe(0);
    expect(door.top).toBeGreaterThan(70);
    expect(door.width).toBe(38);
    const win = e.openings.find((o) => o.type === 'window')!;
    expect(win.top - win.bottom).toBeCloseTo(win.top - win.bottom, 6);
    expect(win.bottom).toBeGreaterThan(0);
    expect(win.bottom).toBeLessThan(win.top);
    expect(e.unplaced).toEqual([]);
  });

  it('28x40 (planta): comprimento pelo eixo; parede sem altura nem pré-corte usa a altura default marcada como palpite', () => {
    const d = load(EXAMPLES[1]!.text);
    const w01 = d.walls[0]!;
    expect(elevationOf(d, w01).length).toBe(480);
    const { height: _h, ...bare } = w01;
    const { studLength: _precut, ...cfg } = d.config;
    const noPrecut = { ...d, config: cfg };
    const e = elevationOf(noPrecut, bare);
    expect(e.height).toBe(DEFAULT_ELEVATION_HEIGHT);
    expect(e.heightKnown).toBe(false);
  });

  it('abertura sem posição vai para `unplaced`; sem catálogo desenha o RO digitado', () => {
    const d = load(EXAMPLES[2]!.text);
    const w = { id: 'X', length: 120, height: 97.125, openings: [{ id: 'A', type: 'window' as const, roughWidth: 36, roughHeight: 48, offset: 40 }, { id: 'B', type: 'door' as const, roughWidth: 38 }] };
    const { openingTypes: _types, ...cfg } = d.config;
    const e = elevationOf({ ...d, config: cfg }, w);
    expect(e.openings.map((o) => o.id)).toEqual(['A']);
    expect(e.openings[0]).toMatchObject({ x: 40, width: 36 });
    expect(e.openings[0]!.top - e.openings[0]!.bottom).toBe(48);
    expect(e.unplaced).toEqual(['B']);
  });
});
