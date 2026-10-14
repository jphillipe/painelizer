import { describe, expect, it } from 'vitest';
import type { Opening } from '../../src/types';
import type { House, HouseWall } from '../../src/house/types';
import { frameWalls, type WallFrame } from '../../src/house/frame';
import cornerL from '../fixtures/house-corner-L.json';
import tee from '../fixtures/house-tee.json';
import house28x40 from '../fixtures/house-28x40.json';

/** O que os fixtures registram de cada frame (tudo menos a `Wall` inteira). */
function summary(f: WallFrame) {
  return {
    wallId: f.wallId,
    plateStart: f.plateStart,
    plateEnd: f.plateEnd,
    length: f.wall.length,
    layoutOrigin: f.layoutOrigin,
    connections: f.connections,
    openingOffsets: Object.fromEntries(f.wall.openings.map((o) => [o.id, o.offset])),
  };
}

const base = { height: 97.125, section: '2x6' as const, exterior: true, bearing: true, openings: [] as Opening[] };
function wall(
  id: string,
  start: [number, number],
  end: [number, number],
  extra: Partial<HouseWall> = {},
): HouseWall {
  return { ...base, id, start: { x: start[0], y: start[1] }, end: { x: end[0], y: end[1] }, ...extra };
}

describe('frameWalls — fixtures', () => {
  it.each([
    ['house-corner-L', cornerL],
    ['house-tee', tee],
    ['house-28x40', house28x40],
  ])('%s: plates, origem de layout, ligações e offsets convertidos', (_name, fx) => {
    const frames = frameWalls(fx.house as House);
    expect(frames.map(summary)).toEqual(fx.expected.frames);
  });

  it('a Wall derivada não leva os campos da planta e mantém layoutOrigin', () => {
    const [w1, w2] = frameWalls(cornerL.house as House);
    expect(w1!.wall).toEqual({
      id: 'W1',
      length: 146.75,
      height: 97.125,
      section: '2x6',
      exterior: true,
      bearing: true,
      floorsSupported: 0,
      openings: [],
      layoutOrigin: 0,
      joints: { start: { kind: 'corner', through: true, otherThickness: 5.5, wallId: 'W2' } },
    });
    expect(w2!.wall.layoutOrigin).toBe(-5.5);
    expect(w2!.wall.joints).toEqual({ start: { kind: 'corner', through: false, otherThickness: 5.5, wallId: 'W1' } });
    expect('start' in w2!.wall).toBe(false);
  });
});

describe('frameWalls — conversões', () => {
  it('studs extras e aberturas são medidos do start e convertidos pelo deslocamento da plate', () => {
    // W2 encosta em W1 (2x6): plate começa 2.75 depois do start.
    const house: House = {
      walls: [
        wall('W1', [0, 0], [144, 0]),
        wall('W2', [0, 0], [0, 120], {
          openings: [{ id: 'j', type: 'window', offset: 40, roughWidth: 36, roughHeight: 48, header: { section: '2x10', plies: 2 } }],
          extraStuds: [{ x: 100, count: 2, label: 'HD' }],
        }),
      ],
    };
    const [, w2] = frameWalls(house);
    expect(w2!.wall.openings[0]!.offset).toBe(37.25);
    expect(w2!.wall.extraStuds).toEqual([{ x: 97.25, count: 2, label: 'HD' }]);
  });

  it('parede que atravessa: offsets crescem (plate começa antes do start)', () => {
    const house: House = {
      walls: [
        wall('W1', [0, 0], [144, 0], {
          openings: [{ id: 'j', type: 'window', offset: 40, roughWidth: 36, roughHeight: 48, header: { section: '2x10', plies: 2 } }],
        }),
        wall('W2', [0, 0], [0, 120]),
      ],
    };
    expect(frameWalls(house)[0]!.wall.openings[0]!.offset).toBe(42.75);
  });

  it('T: a plate da parede que encosta para na face; o x do tee na outra é do painel dela', () => {
    // W1 atravessa um canto com W0 no start (plate começa em −2.75), e W2 encosta em T em x=96.
    const house: House = {
      walls: [wall('W0', [0, 0], [0, 100]), wall('W1', [0, 0], [192, 0]), wall('W2', [96, 0], [96, 120], { section: '2x4' })],
    };
    const [, w1, w2] = frameWalls(house);
    expect(w1!.connections.tees).toEqual([{ x: 98.75, wallId: 'W2', width: 3.5 }]);
    expect(w2!.plateStart).toEqual({ x: 96, y: 2.75 });
    expect(w2!.wall.length).toBe(117.25);
    expect(w2!.layoutOrigin).toBe(0);
  });

  it('ponta cotada na face em vez de no eixo dá a mesma plate', () => {
    const exact = frameWalls({ walls: [wall('W1', [0, 0], [144, 0]), wall('W2', [0, 0], [0, 120])] });
    const atFace = frameWalls({ walls: [wall('W1', [0, 0], [144, 0]), wall('W2', [0, 2.75], [0, 120])] });
    expect(atFace.map(summary)).toEqual(exact.map(summary));
  });

  it('origem de layout: −t só quando o start encosta num canto; T, livre e atravessa dão 0', () => {
    const [s, e, n, w] = frameWalls({
      walls: [
        wall('S', [0, 0], [480, 0]),
        wall('E', [480, 0], [480, 336], { section: '2x4' }),
        wall('N', [480, 336], [0, 336]),
        wall('W', [0, 336], [0, 0]),
      ],
    });
    expect([s!.layoutOrigin, e!.layoutOrigin, n!.layoutOrigin, w!.layoutOrigin]).toEqual([0, -5.5, 0, -5.5]);
    // Parede 2x4 encostando: a plate começa a 2.75 (meia 2x6) e acaba 2.75 antes; a que atravessa ganha 1.75.
    expect(e!.wall.length).toBe(330.5);
    expect(s!.wall.length).toBe(480 + 2.75 + 1.75);
    expect(s!.plateEnd).toEqual({ x: 481.75, y: 0 });
  });
});

describe('frameWalls — erros', () => {
  it('RO fora da plate (abertura sobre o canto)', () => {
    const house: House = {
      walls: [
        wall('W1', [0, 0], [144, 0]),
        wall('W2', [0, 0], [0, 120], {
          openings: [{ id: 'j', type: 'window', offset: 1, roughWidth: 36, roughHeight: 48, header: { section: '2x10', plies: 2 } }],
        }),
      ],
    };
    expect(() => frameWalls(house)).toThrow(/parede W2, abertura j: RO de 1" a 37" do start não cabe na plate \(de 2.75" a 120"/);
  });

  it('plate sem comprimento (parede curta entre duas que atravessam)', () => {
    const house: House = {
      walls: [
        wall('A', [0, 0], [0, 100], { ends: { start: 'through' } }),
        wall('B', [5, 0], [5, 100], { ends: { start: 'through' } }),
        wall('C', [0, 0], [5, 0], { section: '2x4' }),
      ],
    };
    expect(() => frameWalls(house)).toThrow(/parede C: plate sem comprimento/);
  });

  it('propaga os erros de findConnections', () => {
    expect(() => frameWalls({ walls: [wall('A', [0, 0], [200, 0]), wall('B', [100, -50], [100, 50])] })).toThrow(/se cruzam/);
  });
});

describe('frameWalls — lado da face externa (S17)', () => {
  it('casa 28x40 (laço anti-horário): fora à direita de start→end em todas as externas; interna sem outside', () => {
    const frames = frameWalls(house28x40.house as House);
    expect(frames.map((f) => f.outside)).toEqual(['right', 'right', 'right', 'right', undefined]);
  });

  it('L: W1 (fora em −y) à direita; W2 sobe com a casa a +x, fora à esquerda; invertendo o sentido o lado troca', () => {
    const frames = frameWalls(cornerL.house as House);
    expect(frames.map((f) => f.outside)).toEqual(['right', 'left']);
    const [w1, w2] = cornerL.house.walls as HouseWall[];
    const flipped = frameWalls({ walls: [w1!, { ...w2!, start: w2!.end, end: w2!.start }] });
    expect(flipped[1]!.outside).toBe('right');
  });

  it('parede única: o eixo passa pelo centro, lado indecidível', () => {
    const w1 = cornerL.house.walls[0] as HouseWall;
    expect(frameWalls({ walls: [w1] })[0]!.outside).toBeUndefined();
  });
});
