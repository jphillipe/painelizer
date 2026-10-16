import { describe, expect, it } from 'vitest';
import type { Opening } from '../../src/types';
import { MAX_NUDGE, nudgeOpenings } from '../../src/rules/nudge';

// 1 king + 1 jack por lado (3" de cada lado do RO), stud de 1.5
const w = (id: string, offset: number, roughWidth = 32): Opening => ({
  id,
  type: 'door',
  offset,
  roughWidth,
  roughHeight: 82.5,
  jackStuds: 1,
  kingStuds: 1,
});
const tee = (lo: number, hi: number, wallId = 'I13') => ({ lo, hi, wallId });

describe('nudgeOpenings (hipótese P40)', () => {
  it('sem conflito: nada muda', () => {
    const r = nudgeOpenings([w('a', 20)], 120, [], 1.5);
    expect(r.nudges).toEqual([]);
    expect(r.openings[0]!.offset).toBe(20);
  });

  it('zona 3/8" além do fim da parede (I12-U3-1 do Ringgold): volta 3/8"', () => {
    // RO [245.375, 277.375] → zona até 280.375 numa parede de 280
    const r = nudgeOpenings([w('U3', 245.375)], 280, [], 1.5);
    expect(r.nudges).toEqual([{ openingId: 'U3', from: 245.375, to: 245, reason: 'o fim da parede' }]);
    expect(r.openings[0]!.offset).toBe(245);
  });

  it('zona antes do início da parede: avança o que falta', () => {
    const r = nudgeOpenings([w('a', 2)], 120, [], 1.5);
    expect(r.nudges).toEqual([{ openingId: 'a', from: 2, to: 3, reason: 'o início da parede' }]);
  });

  it('T dentro do RO por 1 1/4" (S2-1-2 do Ringgold): o RO termina no início da faixa', () => {
    // RO [171.75, 209.75], faixa do T 208.5–212 → RO passa a [170.5, 208.5]
    const r = nudgeOpenings([w('S2-1-2', 171.75, 38)], 500, [tee(208.5, 212)], 1.5);
    expect(r.nudges).toEqual([{ openingId: 'S2-1-2', from: 171.75, to: 170.5, reason: 'a parede I13 em T' }]);
  });

  it('T dentro do RO pelo lado esquerdo: o RO começa no fim da faixa', () => {
    const r = nudgeOpenings([w('a', 100)], 300, [tee(98, 101.5)], 1.5);
    expect(r.nudges[0]).toMatchObject({ from: 100, to: 101.5 });
  });

  it(`conflito maior que ${MAX_NUDGE}": não mexe (o erro de sempre aparece depois)`, () => {
    const r = nudgeOpenings([w('a', 100)], 300, [tee(120, 123.5)], 1.5);
    expect(r.nudges).toEqual([]);
    expect(r.openings[0]!.offset).toBe(100);
  });

  it('não desloca se ficaria a menos de jack + king + jack de uma vizinha', () => {
    // a termina em 277.375 (3/8" fora); b em [236, 240]: a em 245.375 está a 5.375 de b; voltando 3/8" fica a 5,
    // ainda ≥ 4.5 → desloca. Com b em [236, 241], ficaria a 4 → não desloca.
    expect(nudgeOpenings([w('b', 208, 32), w('U3', 245.375)], 280, [], 1.5).nudges).toHaveLength(1);
    expect(nudgeOpenings([w('b', 209, 32), w('U3', 245.375)], 280, [], 1.5).nudges).toEqual([]);
  });

  it('não desloca se o lugar novo também conflita', () => {
    // fim da parede pede −3/8", mas aí o RO encosta num T em 244–245.2
    const r = nudgeOpenings([w('U3', 245.375)], 280, [tee(244, 245.2)], 1.5);
    expect(r.nudges).toEqual([]);
  });

  it('devolve na ordem recebida e não altera a entrada', () => {
    const input = [w('z', 245.375), w('a', 20)];
    const r = nudgeOpenings(input, 280, [], 1.5);
    expect(r.openings.map((o) => [o.id, o.offset])).toEqual([
      ['z', 245],
      ['a', 20],
    ]);
    expect(input[0]!.offset).toBe(245.375);
  });
});
