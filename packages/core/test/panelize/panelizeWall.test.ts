import { describe, expect, it } from 'vitest';
import type { Config, Member, Wall } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { expectSameMembers } from '../helpers/members';
import plain from '../fixtures/wall-144-plain.json';
import window from '../fixtures/wall-144-window.json';

const wall = plain.wall as Wall;
const config = plain.config as Config;

describe('panelizeWall — parede sem abertura', () => {
  it('fixture wall-144-plain passa exatamente (members por role, section, length, x, y)', () => {
    const panel = panelizeWall(wall, config);
    expectSameMembers(panel.members, plain.expected.members as Member[]);
    expect(panel.warnings).toEqual(plain.expected.warnings);
  });

  it('orientação: plates horizontais, studs verticais', () => {
    const panel = panelizeWall(wall, config);
    for (const m of panel.members) {
      expect(m.orientation).toBe(m.role === 'stud' ? 'vertical' : 'horizontal');
    }
  });

  it('metadados do painel vêm da parede', () => {
    const panel = panelizeWall(wall, config);
    expect(panel).toMatchObject({
      id: 'W-plain',
      wallId: 'W-plain',
      length: 144,
      height: 97.125,
      section: '2x6',
    });
    expect(panel.members).toHaveLength(13);
  });

  it('24" OC reduz os studs', () => {
    const panel = panelizeWall(wall, { ...config, studSpacing: 24 });
    const xs = panel.members.filter((m) => m.role === 'stud').map((m) => m.x);
    expect(xs).toEqual([0, 24, 48, 72, 96, 120, 142.5]);
  });

  it('altura fora do pré-corte: stud segue a altura e sai aviso STUD_LENGTH_MISMATCH', () => {
    const panel = panelizeWall({ ...wall, height: 109.125 }, config);
    const studs = panel.members.filter((m) => m.role === 'stud');
    expect(studs).toHaveLength(10);
    for (const s of studs) expect(s.length).toBe(104.625);
    expect(panel.warnings.map((w) => w.code)).toEqual(['STUD_LENGTH_MISMATCH']);
  });

  it('parede com abertura ainda não é suportada (S7)', () => {
    expect(() => panelizeWall(window.wall as Wall, window.config as Config)).toThrow(/S7/);
  });

  it('altura que não comporta stud lança RangeError', () => {
    expect(() => panelizeWall({ ...wall, height: 4.5 }, config)).toThrow(RangeError);
  });
});
