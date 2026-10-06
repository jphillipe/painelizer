import { describe, expect, it } from 'vitest';
import { layoutStuds } from '../../src/rules/studs';

describe('layoutStuds', () => {
  it('parede 144" a 16" OC: primeiro em 0, studs centrados nas marcas 16..128, fechamento 142.5', () => {
    expect(layoutStuds(144, 16)).toEqual([
      0, 15.25, 31.25, 47.25, 63.25, 79.25, 95.25, 111.25, 127.25, 142.5,
    ]);
  });

  it('parede 16": só o stud de ponta e o fechamento (o stud da marca 16 começaria depois)', () => {
    expect(layoutStuds(16, 16)).toEqual([0, 14.5]);
  });

  it('parede 15": stud de ponta e fechamento 13.5', () => {
    expect(layoutStuds(15, 16)).toEqual([0, 13.5]);
  });

  it('parede 143": stud da marca 128 em 127.25 e fechamento 141.5; ambos mantidos', () => {
    expect(layoutStuds(143, 16)).toEqual([
      0, 15.25, 31.25, 47.25, 63.25, 79.25, 95.25, 111.25, 127.25, 141.5,
    ]);
  });

  it('stud da marca coincidindo com o fechamento (128.75 → 127.25): um stud só', () => {
    expect(layoutStuds(128.75, 16)).toEqual([0, 15.25, 31.25, 47.25, 63.25, 79.25, 95.25, 111.25, 127.25]);
  });

  it('stud da marca sobrepondo o fechamento (130 → 127.25 e 128.5): mantém os dois (decisão 2026-09-28)', () => {
    expect(layoutStuds(130, 16)).toEqual([
      0, 15.25, 31.25, 47.25, 63.25, 79.25, 95.25, 111.25, 127.25, 128.5,
    ]);
  });

  it('stud da marca encostado no fechamento sem sobrepor (130.25 → 127.25 e 128.75): mantém os dois', () => {
    expect(layoutStuds(130.25, 16)).toEqual([
      0, 15.25, 31.25, 47.25, 63.25, 79.25, 95.25, 111.25, 127.25, 128.75,
    ]);
  });

  it('24" OC', () => {
    expect(layoutStuds(144, 24)).toEqual([0, 23.25, 47.25, 71.25, 95.25, 119.25, 142.5]);
  });

  it('studThickness explícito (ex.: 1.75): stud centrado com a própria espessura', () => {
    expect(layoutStuds(48, 16, 1.75)).toEqual([0, 15.125, 31.125, 46.25]);
  });

  it('parede com o comprimento exato de um stud: um stud em 0', () => {
    expect(layoutStuds(1.5, 16)).toEqual([0]);
  });

  describe('origin — marca 0 do prédio fora da ponta da parede', () => {
    it('parede que encosta num canto de 2x6 (origin −5.5): marcas 16, 32… da quina caem em 10.5, 26.5…', () => {
      expect(layoutStuds(114.5, 16, 1.5, -5.5)).toEqual([
        0, 9.75, 25.75, 41.75, 57.75, 73.75, 89.75, 105.75, 113,
      ]);
    });

    it('painel que começa no meio da parede (origin −128): a marca 128 é a ponta, 144 cai em 15.25', () => {
      expect(layoutStuds(96, 16, 1.5, -128)).toEqual([0, 15.25, 31.25, 47.25, 63.25, 79.25, 94.5]);
    });

    it('origin positivo (marca 0 dentro da parede): o stud da marca 0 entra se couber depois do stud de ponta', () => {
      expect(layoutStuds(48, 16, 1.5, 5.5)).toEqual([0, 4.75, 20.75, 36.75, 46.5]);
    });

    it('stud da marca sobrepondo o stud de ponta (origin 1 → 0.25): mantido, como no fechamento (validação avisa)', () => {
      expect(layoutStuds(48, 16, 1.5, 1)).toEqual([0, 0.25, 16.25, 32.25, 46.5]);
    });

    it('stud da marca que começaria em 0 ou antes (origin 0.75 ou 0.5): descartado', () => {
      expect(layoutStuds(48, 16, 1.5, 0.75)).toEqual([0, 16, 32, 46.5]);
      expect(layoutStuds(48, 16, 1.5, 0.5)).toEqual([0, 15.75, 31.75, 46.5]);
    });

    it('origin múltiplo do espaçamento dá o mesmo layout de origin 0', () => {
      expect(layoutStuds(144, 16, 1.5, -48)).toEqual(layoutStuds(144, 16));
      expect(layoutStuds(144, 16, 1.5, 32)).toEqual(layoutStuds(144, 16));
    });
  });

  it('primeiro stud em 0, último em length − studThickness, posições crescentes', () => {
    for (const length of [1.5, 3, 10, 47.9, 48, 96, 97.5, 130, 143, 144, 192.25]) {
      for (const origin of [0, -5.5, -128, 3.5]) {
        const xs = layoutStuds(length, 16, 1.5, origin);
        expect(xs[xs.length - 1]).toBe(length - 1.5);
        expect(xs[0]).toBe(0);
        for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]!);
      }
    }
  });

  it.each([
    [1, 16, 1.5, 0],
    [0, 16, 1.5, 0],
    [-10, 16, 1.5, 0],
    [144, 0, 1.5, 0],
    [144, -16, 1.5, 0],
    [144, 16, 0, 0],
    [Number.NaN, 16, 1.5, 0],
    [Number.POSITIVE_INFINITY, 16, 1.5, 0],
    [144, 16, 1.5, Number.NaN],
  ])('rejeita length=%s spacing=%s t=%s origin=%s', (length, spacing, t, origin) => {
    expect(() => layoutStuds(length, spacing, t, origin)).toThrow(RangeError);
  });
});
