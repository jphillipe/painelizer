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
    expect(p.config.studLength).toEqual([92.625, 104.625]);
    expect(p.config.headerHeight).toBe(82.5);
    expect(p.walls.map((w) => [w.id, w.length, w.height])).toEqual([
      ['W01', 144, 97.125],
      ['W02', 192, 97.125],
      ['W03', 120, 97.125],
      ['W04', 126, 97.125],
      ['W05', 144, 97.125],
      ['W06', 120, 109.125],
      ['W07', 144, 97.125],
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
    expect(p.config).toEqual({ studSpacing: 24, studThickness: 1.5, plateThickness: 1.5, studLength: [92.625] });
  });

  it('config opcional: headerHeight; defaultHeader* foi removido e é rejeitado com explicação', () => {
    const p = projectFrom(valid({ config: { studSpacing: 16, studLength: 92.625, headerHeight: `6'-10 1/2"` } }));
    expect(p.config.headerHeight).toBe(82.5);
    expect(() =>
      projectFrom(valid({ config: { studSpacing: 16, studLength: 1, defaultHeaderSection: '2x10' } }), 'projeto'),
    ).toThrow(/projeto\.config\.defaultHeaderSection: campo removido .*openings\[\]\.header/);
    expect(() => projectFrom(valid({ config: { studSpacing: 16, studLength: 1, defaultHeaderPlies: 2 } }))).toThrow(
      /defaultHeaderPlies: campo removido/,
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

  it('studLength: lista de pré-cortes em pés-pol; uma medida só vira lista de um', () => {
    const cfg = (studLength: unknown) => valid({ config: { studSpacing: 16, studLength } });
    expect(projectFrom(cfg([`92 5/8"`, 104.625])).config.studLength).toEqual([92.625, 104.625]);
    expect(projectFrom(cfg(`92 5/8"`)).config.studLength).toEqual([92.625]);
    expect(() => projectFrom(cfg([]), 'projeto')).toThrow(/projeto\.config\.studLength: esperado ao menos um pré-corte/);
    expect(() => projectFrom(cfg([92.625, 0]), 'projeto')).toThrow(/config\.studLength\[1\]: esperado medida > 0/);
    expect(() => projectFrom(cfg(undefined), 'projeto')).toThrow(/config\.studLength/);
  });

  it('headerHeight opcional por abertura, em pés-pol', () => {
    const withOpening = (extra: Record<string, unknown>) =>
      valid({
        walls: [
          {
            ...(valid().walls as object[])[0],
            openings: [{ id: 'J1', type: 'window', offset: 48, roughWidth: 36, roughHeight: 48, ...extra }],
          },
        ],
      });
    expect(projectFrom(withOpening({ headerHeight: `7'-6"` })).walls[0]?.openings[0]?.headerHeight).toBe(90);
    expect(projectFrom(withOpening({})).walls[0]?.openings[0]).not.toHaveProperty('headerHeight');
    expect(() => projectFrom(withOpening({ headerHeight: 0 }), 'projeto')).toThrow(
      /openings\[0\]\.headerHeight: esperado medida > 0/,
    );
  });

  it('exemplo: building em pés-pol, floorsSupported nas externas portantes, header do projeto na W07', () => {
    const p = parseProject(readFileSync(EXAMPLE, 'utf8'), 'casa-exemplo.json');
    expect(p.config.building).toEqual({ groundSnowLoad: 50, buildingWidth: 336 });
    expect(p.walls.map((w) => w.floorsSupported)).toEqual([0, 0, undefined, undefined, 0, 0, 0]);
    expect(p.walls[4]?.openings[0]).not.toHaveProperty('header');
    expect(p.walls[6]?.openings.map((o) => o.header)).toEqual([
      { section: '2x10', plies: 2 },
      { section: '2x10', plies: 2 },
    ]);
  });

  it('config.building: neve em psf (número) e largura como medida', () => {
    const cfg = (building: unknown) => valid({ config: { studSpacing: 16, studLength: 92.625, building } });
    expect(projectFrom(cfg({ groundSnowLoad: 0, buildingWidth: 336 })).config.building).toEqual({
      groundSnowLoad: 0,
      buildingWidth: 336,
    });
    expect(() => projectFrom(cfg({ groundSnowLoad: '50', buildingWidth: `28'` }), 'projeto')).toThrow(
      /projeto\.config\.building\.groundSnowLoad: esperado carga em psf/,
    );
    expect(() => projectFrom(cfg({ groundSnowLoad: -1, buildingWidth: `28'` }))).toThrow(/groundSnowLoad/);
    expect(() => projectFrom(cfg({ groundSnowLoad: 50 }), 'projeto')).toThrow(/config\.building\.buildingWidth/);
    expect(() => projectFrom(cfg({ groundSnowLoad: 50, buildingWidth: 0 }))).toThrow(/buildingWidth: esperado medida > 0/);
    expect(() => projectFrom(cfg('28'), 'projeto')).toThrow(/projeto\.config\.building: esperado objeto/);
  });

  it('parede: buildingWidth, floorsSupported e floorSpan opcionais', () => {
    const withWall = (extra: Record<string, unknown>) =>
      valid({ walls: [{ ...(valid().walls as object[])[0], ...extra }] });
    const w = projectFrom(withWall({ buildingWidth: `24'`, floorsSupported: 1, floorSpan: 'clear' })).walls[0];
    expect(w).toMatchObject({ buildingWidth: 288, floorsSupported: 1, floorSpan: 'clear' });
    expect(projectFrom(withWall({ floorsSupported: 0 })).walls[0]?.floorsSupported).toBe(0);
    const plain = projectFrom(withWall({})).walls[0];
    for (const key of ['buildingWidth', 'floorsSupported', 'floorSpan']) expect(plain).not.toHaveProperty(key);
    expect(() => projectFrom(withWall({ floorsSupported: -1 }), 'projeto')).toThrow(
      /projeto\.walls\[0\]\.floorsSupported: esperado inteiro ≥ 0/,
    );
    expect(() => projectFrom(withWall({ floorsSupported: 1.5 }))).toThrow(/floorsSupported/);
    expect(() => projectFrom(withWall({ floorSpan: 'centre' }))).toThrow(/floorSpan: esperado um de center, clear/);
    expect(() => projectFrom(withWall({ buildingWidth: 0 }))).toThrow(/walls\[0\]\.buildingWidth/);
  });

  it('abertura: header do projeto { section, plies, jackStuds? }', () => {
    const withHeader = (header: unknown) =>
      valid({
        walls: [
          {
            ...(valid().walls as object[])[0],
            openings: [{ id: 'J1', type: 'window', offset: 48, roughWidth: 36, roughHeight: 48, header }],
          },
        ],
      });
    const header = (h: unknown) => projectFrom(withHeader(h), 'projeto').walls[0]?.openings[0]?.header;
    expect(header({ section: '2x12', plies: 3 })).toEqual({ section: '2x12', plies: 3 });
    expect(header({ section: '2x10', plies: 2, jackStuds: 2 })).toEqual({ section: '2x10', plies: 2, jackStuds: 2 });
    expect(() => header({ section: 'LVL', plies: 2 })).toThrow(
      /projeto\.walls\[0\]\.openings\[0\]\.header\.section: esperado um de 2x4, 2x6, 2x8, 2x10, 2x12/,
    );
    expect(() => header({ section: '2x10' })).toThrow(/header\.plies: esperado inteiro ≥ 1/);
    expect(() => header({ section: '2x10', plies: 2, jackStuds: 0 })).toThrow(/header\.jackStuds/);
    expect(() => header('2-2x10')).toThrow(/openings\[0\]\.header: esperado objeto/);
  });

  it('kingStuds e jackStuds opcionais por abertura, inteiros ≥ 1', () => {
    const withOpening = (extra: Record<string, unknown>) =>
      valid({
        walls: [
          {
            ...(valid().walls as object[])[0],
            openings: [{ id: 'J1', type: 'window', offset: 48, roughWidth: 60, roughHeight: 48, ...extra }],
          },
        ],
      });
    const p = projectFrom(withOpening({ kingStuds: 2, jackStuds: 2 }));
    expect(p.walls[0]?.openings[0]).toMatchObject({ kingStuds: 2, jackStuds: 2 });
    expect(() => projectFrom(withOpening({ kingStuds: 0 }), 'projeto')).toThrow(
      /projeto\.walls\[0\]\.openings\[0\]\.kingStuds: esperado inteiro ≥ 1/,
    );
    expect(() => projectFrom(withOpening({ jackStuds: '2' }), 'projeto')).toThrow(/jackStuds/);
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
