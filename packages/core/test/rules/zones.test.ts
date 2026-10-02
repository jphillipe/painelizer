import { describe, expect, it } from 'vitest';
import type { Opening } from '../../src/types';
import { mergeOpeningZones } from '../../src/rules/zones';
import windowDoor from '../fixtures/wall-144-window-door.json';

const [win, door] = windowDoor.wall.openings as [Opening, Opening];

const w = (id: string, offset: number, roughWidth = 24, extra: Partial<Opening> = {}): Opening => ({
  id,
  type: 'window',
  offset,
  roughWidth,
  roughHeight: 48,
  ...extra,
});

describe('mergeOpeningZones', () => {
  it('sem aberturas: nada', () => {
    expect(mergeOpeningZones([], 1.5)).toEqual({ zones: [], kings: [] });
  });

  it('abertura isolada: zona própria e kings nas bordas', () => {
    expect(mergeOpeningZones([w('a', 20)], 1.5)).toEqual({
      zones: [{ start: 17, end: 47, openingIds: ['a'] }],
      kings: [17, 45.5],
    });
  });

  it('zonas separadas continuam separadas, em ordem de x mesmo com entrada fora de ordem', () => {
    const plan = mergeOpeningZones([w('b', 100, 36), w('a', 20)], 1.5);
    expect(plan.zones).toEqual([
      { start: 17, end: 47, openingIds: ['a'] },
      { start: 97, end: 139, openingIds: ['b'] },
    ]);
    expect(plan.kings).toEqual([17, 45.5, 97, 137.5]);
  });

  it('fixture wall-144-window-door: 4.5" entre os RO → king compartilhado em 61.5', () => {
    expect(mergeOpeningZones([win, door], 1.5)).toEqual({
      zones: [{ start: 21, end: 105.5, openingIds: ['win1', 'door1'] }],
      kings: [21, 61.5, 104],
    });
  });

  it('folga entre 4.5" e 6": king colado ao jack da esquerda, folga à direita', () => {
    // RO a [20, 44] e [49, 73]: jack 44–45.5, king 45.5–47, folga 47–47.5, jack 47.5–49
    const plan = mergeOpeningZones([w('a', 20), w('b', 49)], 1.5);
    expect(plan.zones).toEqual([{ start: 17, end: 76, openingIds: ['a', 'b'] }]);
    expect(plan.kings).toEqual([17, 45.5, 74.5]);
  });

  it('zonas que só se tocam (6" entre os RO) também fundem: um king só', () => {
    const plan = mergeOpeningZones([w('a', 20), w('b', 50)], 1.5);
    expect(plan.zones).toEqual([{ start: 17, end: 77, openingIds: ['a', 'b'] }]);
    expect(plan.kings).toEqual([17, 45.5, 75.5]);
  });

  it('6" + 1/64 entre os RO: zonas separadas, cada uma com seus kings', () => {
    const plan = mergeOpeningZones([w('a', 20), w('b', 50 + 1 / 64)], 1.5);
    expect(plan.zones).toHaveLength(2);
    expect(plan.kings).toHaveLength(4);
  });

  it('três aberturas em sequência viram uma zona com dois kings compartilhados', () => {
    const plan = mergeOpeningZones([w('a', 20), w('b', 48.5), w('c', 77)], 1.5);
    expect(plan.zones).toEqual([{ start: 17, end: 104, openingIds: ['a', 'b', 'c'] }]);
    expect(plan.kings).toEqual([17, 45.5, 74, 102.5]);
  });

  it('kings compartilhados = o maior número das duas aberturas; jacks de cada uma ficam', () => {
    // a: 2 kings, 1 jack; b: 1 king, 2 jacks → entre os RO: 1 jack + 2 kings + 2 jacks = 7.5"
    const a = w('a', 20, 24, { kingStuds: 2 });
    const b = w('b', 51.5, 24, { jackStuds: 2 });
    const plan = mergeOpeningZones([a, b], 1.5);
    expect(plan.kings).toEqual([15.5, 17, 45.5, 47, 78.5]);
    expect(plan.zones).toEqual([{ start: 15.5, end: 80, openingIds: ['a', 'b'] }]);
    expect(() => mergeOpeningZones([a, { ...b, offset: 51 }], 1.5)).toThrow(RangeError);
  });

  it.each([
    ['4" (plano original: king não cabe)', 48],
    ['RO encostados', 44],
    ['RO sobrepostos', 40],
  ])('RO vizinhos sem espaço para jack + king + jack: %s → RangeError', (_label, offset) => {
    expect(() => mergeOpeningZones([w('a', 20), w('b', offset)], 1.5)).toThrow(
      /aberturas a e b: .*\(mínimo 4\.5"\)/,
    );
  });

  it('abertura inválida é rejeitada (validação de openingZone)', () => {
    expect(() => mergeOpeningZones([w('a', 20, 0)], 1.5)).toThrow(RangeError);
  });
});
