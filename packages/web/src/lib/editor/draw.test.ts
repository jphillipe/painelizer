import { describe, expect, it } from 'vitest';
import { snapDrawPoint } from './draw';

const walls = [
  { start: { x: 0, y: 0 }, end: { x: 480, y: 0 } },
  { start: { x: 480, y: 0 }, end: { x: 480, y: 336 } },
];

describe('S30: snap do "Draw wall"', () => {
  it('sem âncora: ponta de parede vizinha primeiro, senão x/y alinhados a pontas e eixos, senão 1"', () => {
    expect(snapDrawPoint({ x: 478, y: 3 }, walls, 6)).toEqual({ point: { x: 480, y: 0 }, kind: 'end' });
    expect(snapDrawPoint({ x: 477, y: 100 }, walls, 6)).toEqual({
      point: { x: 480, y: 100 },
      kind: 'axis',
      ref: { x: 480, y: 0 },
    });
    expect(snapDrawPoint({ x: 300.4, y: 100.2 }, walls, 6)).toEqual({ point: { x: 300, y: 100 }, kind: 'grid' });
  });

  it('com âncora: ortogonal pelo eixo dominante; a coordenada livre gruda em ponta/eixo', () => {
    expect(snapDrawPoint({ x: 200.3, y: 30 }, walls, 6, { x: 0, y: 0 })).toEqual({
      point: { x: 200, y: 0 },
      kind: 'grid',
    });
    expect(snapDrawPoint({ x: 478, y: 10 }, walls, 6, { x: 0, y: 0 })).toEqual({
      point: { x: 480, y: 0 },
      kind: 'end',
    });
    // Divisória em T: sai da W01 e para no eixo da linha y = 336 (fim da W02).
    expect(snapDrawPoint({ x: 270, y: 333 }, walls, 6, { x: 264, y: 0 })).toEqual({
      point: { x: 264, y: 336 },
      kind: 'axis',
      ref: { x: 480, y: 336 },
    });
  });

  it('sem paredes: só a grade', () => {
    expect(snapDrawPoint({ x: 10.6, y: -3.2 }, [], 6)).toEqual({ point: { x: 11, y: -3 }, kind: 'grid' });
  });
});
