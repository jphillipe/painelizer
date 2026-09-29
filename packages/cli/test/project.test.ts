import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { measure, parseProject, ProjectError, projectFrom } from '../src/project';

const EXAMPLE = new URL('../examples/casa-exemplo.json', import.meta.url);

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    config: { studSpacing: 16, studThickness: 1.5, plateThickness: 1.5, studLength: 92.625 },
    walls: [
      { id: 'W01', length: 144, height: 97.125, section: '2x6', exterior: true, bearing: true, openings: [] },
    ],
    ...overrides,
  };
}

describe('parseProject', () => {
  it('lê o exemplo e converte medidas em pés-pol para polegadas decimais', () => {
    const p = parseProject(readFileSync(EXAMPLE, 'utf8'), 'casa-exemplo.json');
    expect(p.name).toBe('casa-exemplo');
    expect(p.config.studLength).toBe(92.625);
    expect(p.walls.map((w) => [w.id, w.length, w.height])).toEqual([
      ['W01', 144, 97.125],
      ['W02', 192, 97.125],
      ['W03', 120, 97.125],
      ['W04', 129.5, 97.125],
    ]);
    expect(p.stockLengths).toBeUndefined();
  });

  it('JSON inválido vira ProjectError com o nome do arquivo', () => {
    expect(() => parseProject('{ oops', 'x.json')).toThrow(ProjectError);
    expect(() => parseProject('{ oops', 'x.json')).toThrow(/x\.json: JSON inválido/);
  });

  it('nome ausente usa o nome do arquivo; studThickness e plateThickness têm default 1.5', () => {
    const p = projectFrom(
      valid({ config: { studSpacing: 24, studLength: 92.625 } }),
      'casa.json',
    );
    expect(p.name).toBe('casa.json');
    expect(p.config).toEqual({ studSpacing: 24, studThickness: 1.5, plateThickness: 1.5, studLength: 92.625 });
  });

  it('config opcional: headerHeight, defaultHeaderSection e defaultHeaderPlies', () => {
    const p = projectFrom(
      valid({
        config: {
          studSpacing: 16,
          studLength: 92.625,
          headerHeight: `6'-10 1/2"`,
          defaultHeaderSection: '2x10',
          defaultHeaderPlies: 2,
        },
      }),
    );
    expect(p.config.headerHeight).toBe(82.5);
    expect(p.config.defaultHeaderSection).toBe('2x10');
    expect(p.config.defaultHeaderPlies).toBe(2);
    expect(() => projectFrom(valid({ config: { studSpacing: 16, studLength: 1, defaultHeaderPlies: 0 } }))).toThrow(
      /defaultHeaderPlies/,
    );
  });

  it('aberturas são lidas com offset em pés-pol', () => {
    const p = projectFrom(
      valid({
        walls: [
          {
            id: 'W',
            length: 144,
            height: 97.125,
            section: '2x6',
            exterior: true,
            bearing: true,
            openings: [{ id: 'J1', type: 'window', offset: `4'`, roughWidth: 36, roughHeight: 48 }],
          },
        ],
      }),
    );
    expect(p.walls[0]?.openings).toEqual([
      { id: 'J1', type: 'window', offset: 48, roughWidth: 36, roughHeight: 48 },
    ]);
  });

  it.each([
    [valid({ walls: [] }), /walls: nenhuma parede/],
    [valid({ walls: 'x' }), /walls: esperado array/],
    [valid({ config: undefined }), /config: esperado objeto/],
    [{ ...valid(), walls: [{ ...(valid().walls as object[])[0], section: '2x8' }] }, /walls\[0\]\.section: esperado um de 2x4, 2x6/],
    [{ ...valid(), walls: [{ ...(valid().walls as object[])[0], length: '12 feet' }] }, /walls\[0\]\.length: medida inválida "12 feet"/],
    [{ ...valid(), walls: [{ ...(valid().walls as object[])[0], length: 0 }] }, /walls\[0\]\.length: esperado medida > 0/],
    [{ ...valid(), walls: [{ ...(valid().walls as object[])[0], exterior: 'sim' }] }, /walls\[0\]\.exterior: esperado true\/false/],
    [{ ...valid(), walls: [{ ...(valid().walls as object[])[0], id: '' }] }, /walls\[0\]\.id: esperado texto não vazio/],
    [valid({ walls: [(valid().walls as object[])[0], (valid().walls as object[])[0]] }), /id duplicado "W01"/],
    [valid({ stockLengths: [] }), /stockLengths: esperado array não vazio/],
    [valid({ stockLengths: [96, -1] }), /stockLengths\[1\]/],
  ])('rejeita entrada inválida com o caminho do campo (%#)', (raw, message) => {
    expect(() => projectFrom(raw, 'projeto')).toThrow(ProjectError);
    expect(() => projectFrom(raw, 'projeto')).toThrow(message);
  });

  it('stockLengths aceita pés-pol e é repassado', () => {
    const p = projectFrom(valid({ stockLengths: [`8'`, 120, `16'`] }));
    expect(p.stockLengths).toEqual([96, 120, 192]);
  });
});

describe('measure', () => {
  it('aceita número ≥ 0 e string pés-pol-fração', () => {
    expect(measure(0, 'p')).toBe(0);
    expect(measure(92.625, 'p')).toBe(92.625);
    expect(measure(`8'-1 1/8"`, 'p')).toBe(97.125);
    expect(measure('36"', 'p')).toBe(36);
  });

  it('rejeita negativo, não finito, texto inválido e outros tipos', () => {
    expect(() => measure(-1, 'p')).toThrow(/p: medida inválida -1/);
    expect(() => measure(Number.NaN, 'p')).toThrow(ProjectError);
    expect(() => measure('abc', 'p')).toThrow(/p: medida inválida "abc"/);
    expect(() => measure(true, 'p')).toThrow(/p: esperado medida/);
    expect(() => measure(undefined, 'p')).toThrow(/recebido nada/);
  });
});
