import { describe, expect, it } from 'vitest';
import type { Config, Member, Wall } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { cutList, cutRoleOf, roundLength } from '../../src/output/cutlist';
import plain from '../fixtures/wall-144-plain.json';
import window from '../fixtures/wall-144-window.json';

const plainPanel = panelizeWall(plain.wall as Wall, plain.config as Config);

describe('cutList', () => {
  it('fixture wall-144-plain: 3 plates + 10 studs, exatamente como expected.cutList', () => {
    expect(cutList(plainPanel)).toEqual(plain.expected.cutList);
  });

  it('as três plates colapsam em um único papel "plates"; os demais mantêm o nome', () => {
    expect(cutRoleOf('bottomPlate')).toBe('plates');
    expect(cutRoleOf('topPlate')).toBe('plates');
    expect(cutRoleOf('doubleTopPlate')).toBe('plates');
    expect(cutRoleOf('stud')).toBe('stud');
    expect(cutRoleOf('header')).toBe('header');
  });

  it('members esperados do fixture da janela: ordem plates, stud, king, jack, header, sill, cripple; header de 2 plies conta 2 peças', () => {
    const members = window.expected.members as Member[];
    const lines = cutList({ members });
    expect(lines.map((l) => l.role)).toEqual([
      'plates',
      'stud',
      'kingStud',
      'jackStud',
      'header',
      'sill',
      'cripple',
    ]);
    expect(lines.find((l) => l.role === 'header')).toEqual({
      role: 'header',
      section: '2x10',
      length: 39,
      qty: 2,
    });
    const pieces = lines.reduce((n, l) => n + l.qty, 0);
    expect(pieces).toBe(members.length + 1); // header vale 2 peças
  });

  it('dentro do mesmo papel, comprimento decrescente; empate por seção', () => {
    const members: Member[] = [
      { role: 'cripple', section: '2x6', length: 10, x: 0, y: 0, orientation: 'vertical' },
      { role: 'cripple', section: '2x6', length: 33.875, x: 0, y: 0, orientation: 'vertical' },
      { role: 'cripple', section: '2x4', length: 33.875, x: 0, y: 0, orientation: 'vertical' },
      { role: 'cripple', section: '2x6', length: 20, x: 0, y: 0, orientation: 'vertical' },
    ];
    expect(cutList({ members }).map((l) => [l.section, l.length])).toEqual([
      ['2x4', 33.875],
      ['2x6', 33.875],
      ['2x6', 20],
      ['2x6', 10],
    ]);
  });

  it('agrupa comprimentos que diferem por ruído de ponto flutuante (< 1/64")', () => {
    const members: Member[] = [
      { role: 'stud', section: '2x6', length: 92.625, x: 0, y: 1.5, orientation: 'vertical' },
      { role: 'stud', section: '2x6', length: 97.125 - 3 * 1.5, x: 16, y: 1.5, orientation: 'vertical' },
      { role: 'stud', section: '2x6', length: 92.625 + 1e-9, x: 32, y: 1.5, orientation: 'vertical' },
    ];
    expect(cutList({ members })).toEqual([{ role: 'stud', section: '2x6', length: 92.625, qty: 3 }]);
  });

  it('roundLength arredonda ao 1/64"', () => {
    expect(roundLength(92.625)).toBe(92.625);
    expect(roundLength(33.875 + 0.001)).toBe(33.875);
    expect(roundLength(0.0078125 + 0.004)).toBe(0.015625);
  });

  it('painel sem members devolve lista vazia', () => {
    expect(cutList({ members: [] })).toEqual([]);
  });

  it('plies inválido lança RangeError', () => {
    const bad: Member = {
      role: 'header',
      section: '2x10',
      length: 39,
      x: 0,
      y: 0,
      orientation: 'horizontal',
      plies: 0,
    };
    expect(() => cutList({ members: [bad] })).toThrow(RangeError);
  });
});
