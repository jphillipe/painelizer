import { describe, expect, it } from 'vitest';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { ENGINEERED_PCF, POUNDS_PER_FOOT, memberWeightLb, panelWeight, poundsPerFoot } from '../../src/rules/weight';
import plainJson from '../fixtures/wall-144-plain.json';
import { wallFixture } from '../helpers/fixtures';

const plain = wallFixture(plainJson);

describe('peso da madeira (hipótese P8)', () => {
  it('tabela lb/pé por seção (SPF ~35 pcf) e densidade de LVL/PSL', () => {
    // Posts (S37, P45): a mesma densidade de 35 pcf sobre a seção real (12.25, 19.25 e 30.25 in²).
    expect(POUNDS_PER_FOOT).toEqual({
      '2x4': 1.28,
      '2x6': 2.0,
      '2x8': 2.64,
      '2x10': 3.37,
      '2x12': 4.1,
      '4x4': 2.98,
      '4x6': 4.68,
      '6x6': 7.35,
    });
    for (const [section, area] of [['4x4', 12.25], ['4x6', 19.25], ['6x6', 30.25]] as const) {
      expect(poundsPerFoot(section)).toBeCloseTo((area / 144) * 35, 2);
    }
    expect(ENGINEERED_PCF).toBe(42);
    expect(poundsPerFoot('2x6')).toBe(2.0);
    // LVL 1 3/4 × 9 1/4 = 16.1875 in² → 16.1875 / 144 × 42
    expect(poundsPerFoot('LVL 1.75x9.25')).toBeCloseTo(4.7214, 4);
    expect(() => poundsPerFoot('2x14' as never)).toThrow(RangeError);
  });

  it('member: comprimento em pés × lb/pé × plies', () => {
    expect(memberWeightLb({ section: '2x6', length: 92.625 })).toBeCloseTo(15.4375, 9);
    expect(memberWeightLb({ section: '2x10', length: 39, plies: 2 })).toBeCloseTo(21.905, 9);
    expect(() => memberWeightLb({ section: '2x6', length: -1 })).toThrow(RangeError);
  });

  it('wall-144-plain: 3 plates de 12\' (72 lb) + 10 studs (154.375 lb) = 226.4 lb, arredondado a 0.1', () => {
    const panel = panelizeWall(plain.wall, plain.config);
    expect(panelWeight(panel)).toBe(226.4);
    expect(panelWeight({ members: [] })).toBe(0);
  });
});
