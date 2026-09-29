import { describe, expect, it } from 'vitest';
import { panelizeWall, type Config, type Wall } from 'core';
import plain from '../../core/test/fixtures/wall-144-plain.json';
import { bomCsv, csvCell, cutListCsv, projectBom, toCsv } from '../src/csv';

const panel = panelizeWall(plain.wall as Wall, plain.config as Config);

describe('csvCell / toCsv', () => {
  it('só põe aspas quando há vírgula, aspas ou quebra de linha; aspas internas duplicam', () => {
    expect(csvCell('W01')).toBe('W01');
    expect(csvCell(92.625)).toBe('92.625');
    expect(csvCell('92 5/8"')).toBe('"92 5/8"""');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('linhas separadas por \\n, com \\n final', () => {
    expect(toCsv([['a', 'b'], [1, 2]])).toBe('a,b\n1,2\n');
  });
});

describe('cutListCsv', () => {
  it('fixture plain: cabeçalho + 3 plates + 10 studs, com comprimento decimal e formatado', () => {
    expect(cutListCsv([panel])).toBe(
      'panel,role,section,length_in,length,qty\n' +
        'W-plain,plates,2x6,144,"144""",3\n' +
        'W-plain,stud,2x6,92.625,"92 5/8""",10\n',
    );
  });

  it('vários painéis saem em sequência, cada linha com o id do painel', () => {
    const second = { ...panel, id: 'W-2' };
    const lines = cutListCsv([panel, second]).trimEnd().split('\n');
    expect(lines).toHaveLength(5);
    expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual(['W-plain', 'W-plain', 'W-2', 'W-2']);
  });
});

describe('bomCsv', () => {
  it('fixture plain: 10 studs em 8\' e 3 plates em 12\'', () => {
    expect(bomCsv(projectBom([panel]))).toBe(
      'section,stock_length_in,stock_length,qty,cut_total_in,waste_in,waste_percent\n' +
        `2x6,96,"8'-0""",10,926.25,33.75,3.5\n` +
        `2x6,144,"12'-0""",3,432,0,0\n`,
    );
  });

  it('stockLengths do projeto substituem o default do core', () => {
    const csv = bomCsv(projectBom([panel], [144]));
    expect(csv.trimEnd().split('\n')).toHaveLength(2);
    expect(csv).toContain(`2x6,144,"12'-0""",13,`);
  });
});
