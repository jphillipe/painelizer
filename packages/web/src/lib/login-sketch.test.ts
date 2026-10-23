import { describe, expect, it } from 'vitest';
import { SKETCH, sketchPieces, toSvg } from './login-sketch';

describe('login-sketch (S22 login)', () => {
  const pieces = sketchPieces();

  it('monta uma parede de 18\' com janela: plates, studs, kings, jacks, header, sill e cripples, em ordem', () => {
    const count = (k: string) => pieces.filter((p) => p.kind === k).length;
    expect(count('plate')).toBe(6);
    expect(count('stud')).toBe(13);
    expect(count('king')).toBe(2);
    expect(count('jack')).toBe(2);
    expect(count('header')).toBe(1);
    expect(count('sill')).toBe(1);
    expect(count('cripple')).toBe(6);
    expect(pieces.map((p) => p.i)).toEqual(pieces.map((_, n) => n));
  });

  it('toda peça cabe na parede e o lado da quebra segue a posição', () => {
    for (const p of pieces) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(SKETCH.length + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y + p.h).toBeLessThanOrEqual(SKETCH.height + 1e-9);
      expect(p.half).toBe(p.x + p.w / 2 < SKETCH.breakAt ? 'left' : 'right');
    }
    // A double top plate da direita começa antes da quebra: é o lap sobre o painel vizinho.
    const lapPlate = pieces.find((p) => p.kind === 'plate' && p.half === 'right' && p.x < SKETCH.breakAt);
    expect(lapPlate?.x).toBe(SKETCH.breakAt - SKETCH.lap);
  });

  it('converte para o SVG com y para baixo', () => {
    expect(toSvg({ x: 0, y: 0, w: 216, h: 1.5 })).toEqual({ x: 0, y: 277.5, width: 648, height: 4.5 });
    expect(toSvg({ x: 86.5, y: 80, w: 51, h: 9.25 })).toEqual({ x: 259.5, y: 14.25, width: 153, height: 27.75 });
  });
});
