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
    // Exemplo em planta (S13): `walls` fica vazio e a casa vai em `house`.
    expect(p.walls).toEqual([]);
    expect(p.house!.walls.map((w) => [w.id, w.start, w.end, w.height])).toEqual([
      ['W01', { x: 0, y: 0 }, { x: 144, y: 0 }, 97.125],
      ['W02', { x: 0, y: 0 }, { x: 0, y: 192 }, 97.125],
      ['W03', { x: 0, y: 96 }, { x: 120, y: 96 }, 97.125],
      ['W04', { x: 0, y: 300 }, { x: 126, y: 300 }, 97.125],
      ['W05', { x: 156, y: 300 }, { x: 300, y: 300 }, 97.125],
      ['W06', { x: 324, y: 300 }, { x: 444, y: 300 }, 109.125],
      ['W07', { x: 0, y: 420 }, { x: 144, y: 420 }, 97.125],
    ]);
    expect(p.house!.walls[0]!.ends).toEqual({ start: 'through' });
    expect(p.house!.walls[1]).not.toHaveProperty('ends');
    expect(p.stockLengths).toBeUndefined();
  });

  describe('casa em planta (S13)', () => {
    const plan = (wall: Record<string, unknown>, more: Record<string, unknown>[] = []) =>
      valid({
        walls: [
          { id: 'W01', start: { x: 0, y: 0 }, end: { x: 144, y: 0 }, height: 97.125, section: '2x6', exterior: true, bearing: true, openings: [], ...wall },
          ...more,
        ],
      });

    it('start/end aceitam pés-pol e sinal; ends e level opcionais', () => {
      const p = projectFrom(
        plan({ start: { x: `-2'-6"`, y: '0' }, end: { x: `12'`, y: 0 }, ends: { start: 'butt', end: 'through' }, level: 2 }),
      );
      expect(p.walls).toEqual([]);
      expect(p.house!.walls[0]).toMatchObject({
        id: 'W01',
        start: { x: -30, y: 0 },
        end: { x: 144, y: 0 },
        ends: { start: 'butt', end: 'through' },
        level: 2,
      });
      expect(p.house!.walls[0]).not.toHaveProperty('length');
    });

    it('offsets, center e extraStuds ficam como medidos do start (o core converte)', () => {
      const p = projectFrom(
        plan({
          openings: [{ id: 'J1', type: 'window', center: 60, roughWidth: 36, roughHeight: 48 }],
          extraStuds: [{ x: `8'` }],
        }),
      );
      expect(p.house!.walls[0]!.openings[0]!.offset).toBe(42);
      expect(p.house!.walls[0]!.extraStuds).toEqual([{ x: 96 }]);
    });

    it.each([
      [{ length: 144 }, /projeto\.walls\[0\]\.length: parede em planta não leva length/],
      [{ layoutOrigin: -5.5 }, /projeto\.walls\[0\]\.layoutOrigin: parede em planta não leva layoutOrigin/],
      [{ start: { x: 0 } }, /projeto\.walls\[0\]\.start\.y: esperado medida/],
      [{ end: [144, 0] }, /projeto\.walls\[0\]\.end: esperado objeto/],
      [{ start: { x: '12 feet', y: 0 } }, /projeto\.walls\[0\]\.start\.x: medida inválida/],
      [{ ends: { start: 'thru' } }, /projeto\.walls\[0\]\.ends\.start: esperado um de through, butt/],
      [{ ends: 'through' }, /projeto\.walls\[0\]\.ends: esperado objeto/],
      [{ level: 0 }, /projeto\.walls\[0\]\.level: esperado inteiro ≥ 1/],
    ])('parede em planta inválida %j', (wall, re) => {
      expect(() => projectFrom(plan(wall), 'projeto')).toThrow(re);
    });

    it('misturar paredes em planta e soltas no mesmo arquivo é erro, apontando a minoria', () => {
      const loose = { id: 'W02', length: 120, height: 97.125, section: '2x4', exterior: false, bearing: false, openings: [] };
      expect(() => projectFrom(plan({}, [loose]), 'projeto')).toThrow(
        /projeto\.walls\[0\]: paredes em planta \(start\/end\) e soltas \(length\) no mesmo arquivo/,
      );
      const loose3 = { ...loose, id: 'W03' };
      expect(() => projectFrom(plan({}, [loose, loose3]), 'projeto')).toThrow(/projeto\.walls\[0\]: paredes em planta/);
      const planB = { id: 'W02', start: { x: 0, y: 0 }, end: { x: 0, y: 120 }, height: 97.125, section: '2x6', exterior: true, bearing: true, openings: [] };
      expect(() => projectFrom(valid({ walls: [loose, planB, { ...loose, id: 'W03' }] }), 'projeto')).toThrow(
        /projeto\.walls\[1\]: paredes em planta/,
      );
    });

    it('id duplicado também na planta', () => {
      expect(() => projectFrom(plan({}, [{ id: 'W01', start: { x: 0, y: 50 }, end: { x: 144, y: 50 }, height: 97.125, section: '2x6', exterior: true, bearing: true, openings: [] }]))).toThrow(
        /id duplicado "W01"/,
      );
    });
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
    expect(p.config.building).toEqual({ groundSnowLoad: 50, buildingWidth: 336, windSpeed: 120, exposure: 'B' });
    expect(p.config.doubleSillOver).toBe(72);
    const walls = p.house!.walls;
    expect(walls.map((w) => w.floorsSupported)).toEqual([0, 0, undefined, undefined, 0, 0, 0]);
    expect(walls[4]?.openings[0]).not.toHaveProperty('header');
    // W05 e W04 por tag + center (S12.5): mesma Opening de antes (offset medido do start da parede)
    expect(walls[4]?.openings[0]).toMatchObject({ type: 'window', offset: 48, roughWidth: 36, roughHeight: 48 });
    expect(walls[3]?.openings[0]).toMatchObject({ type: 'door', offset: 40, roughWidth: 32, roughHeight: 82.5 });
    // W07 por headerMark HDR1: seção, plies e jacks do schedule; kings do schedule viram kingStuds
    expect(walls[6]?.openings.map((o) => [o.header, o.kingStuds])).toEqual([
      [{ section: '2x10', plies: 2, jackStuds: 1 }, 1],
      [{ section: '2x10', plies: 2, jackStuds: 1 }, 1],
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

  it('header.section aceita LVL/PSL em texto ou objeto com medidas em pés-pol (S12.5)', () => {
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
    expect(header({ section: 'LVL 1.75x9.25', plies: 2, jackStuds: 2 })).toEqual({
      section: 'LVL 1.75x9.25',
      plies: 2,
      jackStuds: 2,
    });
    expect(header({ section: { material: 'PSL', width: '5 1/4"', depth: '7"' }, plies: 1 })).toEqual({
      section: 'PSL 5.25x7',
      plies: 1,
    });
    expect(() => header({ section: { material: 'GLULAM', width: 3, depth: 9 }, plies: 1 })).toThrow(
      /header\.section\.material: esperado um de LVL, PSL/,
    );
    expect(() => header({ section: { material: 'LVL', width: 0, depth: 9 }, plies: 1 })).toThrow(/header\.section\.width/);
  });

  it('catálogo (S12.5): openingTypes + headerSchedule resolvem tag, center e headerMark em Opening', () => {
    const p = projectFrom(
      valid({
        config: {
          ...(valid().config as object),
          building: { groundSnowLoad: 30, buildingWidth: "29'", windSpeed: 130, species: 'Hem-Fir' },
          openingTypes: {
            A: { kind: 'window', width: "2'-5\"", height: "6'-0\"", sillHeight: "2'-0\"", description: 'vent w/ transom' },
            '1': { kind: 'door', width: "3'-0\"", height: "6'-8\"", frame: 'hm' },
          },
          headerSchedule: { HDR2: { section: '2x10', plies: 3, jackStuds: 2, kingStuds: 4, description: '(3) 2x10' } },
        },
        walls: [
          {
            ...(valid().walls as object[])[0],
            openings: [
              { id: 'J1', tag: 'A', center: "8'-7\"", headerMark: 'HDR2' },
              { id: 'P1', tag: '1', center: 60, header: { section: '2x8', plies: 2 }, headerHeight: "6'-10 1/2\"" },
            ],
          },
        ],
      }),
      'projeto',
    );
    expect(p.config.building?.species).toBe('Hem-Fir');
    expect(p.config.openingTypes?.['A']).toEqual({
      kind: 'window',
      width: 29,
      height: 72,
      sillHeight: 24,
      description: 'vent w/ transom',
    });
    expect(p.config.headerSchedule?.['HDR2']).toMatchObject({ section: '2x10', plies: 3, jackStuds: 2, kingStuds: 4 });
    expect(p.walls[0]?.openings).toEqual([
      {
        id: 'J1',
        type: 'window',
        offset: 103 - 29.5 / 2,
        roughWidth: 29.5,
        roughHeight: 72.75,
        header: { section: '2x10', plies: 3, jackStuds: 2 },
        kingStuds: 4,
        headerHeight: 24 + 72.75,
      },
      {
        id: 'P1',
        type: 'door',
        offset: 60 - 40.5 / 2,
        roughWidth: 40.5,
        roughHeight: 83,
        header: { section: '2x8', plies: 2 },
        headerHeight: 82.5,
      },
    ]);
  });

  it.each([
    [{ openingTypes: { A: { kind: 'hatch', width: 29, height: 72 } } }, /openingTypes\.A\.kind: esperado um de window, door/],
    [{ openingTypes: { A: { kind: 'door', width: 36, height: 80, frame: 'steel' } } }, /openingTypes\.A\.frame: esperado um de wood, hm, al/],
    [{ openingTypes: { '': { kind: 'door', width: 36, height: 80 } } }, /openingTypes: chave vazia/],
    [{ headerSchedule: { HDR1: { section: '2x10', plies: 3, jackStuds: 2 } } }, /headerSchedule\.HDR1\.kingStuds: esperado inteiro ≥ 1/],
    [{ headerSchedule: 'x' }, /headerSchedule: esperado objeto/],
    [{ building: { groundSnowLoad: 30, buildingWidth: 300, species: 'Pine' } }, /building\.species: esperado um de SPF, Hem-Fir, DF, SP/],
  ])('catálogo inválido: %j', (extra, re) => {
    expect(() => projectFrom(valid({ config: { ...(valid().config as object), ...extra } }), 'projeto')).toThrow(re);
  });

  it('abertura por tag inexistente ou sem posição: erro de projeto com o caminho da parede', () => {
    const withOpening = (opening: unknown) =>
      valid({ walls: [{ ...(valid().walls as object[])[0], openings: [opening] }] });
    expect(() => projectFrom(withOpening({ id: 'J1', tag: 'W9', center: 10 }), 'projeto')).toThrow(
      /projeto\.walls\[0\]\.openings: parede W01, abertura J1: tag "W9" não está em config\.openingTypes/,
    );
    expect(() => projectFrom(withOpening({ id: 'J1', type: 'window', roughWidth: 36, roughHeight: 48 }), 'projeto')).toThrow(
      /sem offset nem center/,
    );
    expect(() => projectFrom(withOpening({ id: 'J1', type: 'window', offset: 10 }), 'projeto')).toThrow(
      /sem roughWidth\/roughHeight e sem tag/,
    );
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

describe('projectFrom — dados do estrutural (S12)', () => {
  it('config.building: windSpeed em mph (número > 0) e exposure B/C/D', () => {
    const cfg = (building: unknown) => valid({ config: { studSpacing: 16, studLength: 92.625, building } });
    expect(
      projectFrom(cfg({ groundSnowLoad: 50, buildingWidth: 336, windSpeed: 130, exposure: 'C' })).config.building,
    ).toEqual({ groundSnowLoad: 50, buildingWidth: 336, windSpeed: 130, exposure: 'C' });
    expect(() => projectFrom(cfg({ groundSnowLoad: 50, buildingWidth: 336, windSpeed: '130' }), 'projeto')).toThrow(
      /projeto\.config\.building\.windSpeed: esperado velocidade de vento em mph/,
    );
    expect(() => projectFrom(cfg({ groundSnowLoad: 50, buildingWidth: 336, windSpeed: 0 }))).toThrow(/windSpeed/);
    expect(() => projectFrom(cfg({ groundSnowLoad: 50, buildingWidth: 336, exposure: 'A' }), 'projeto')).toThrow(
      /projeto\.config\.building\.exposure: esperado um de B, C, D/,
    );
  });

  it('config.doubleSillOver: medida > 0, em pés-pol ou polegadas', () => {
    const cfg = (doubleSillOver: unknown) => valid({ config: { studSpacing: 16, studLength: 92.625, doubleSillOver } });
    expect(projectFrom(cfg(`6'`)).config.doubleSillOver).toBe(72);
    expect(projectFrom(cfg(60)).config.doubleSillOver).toBe(60);
    expect(projectFrom(valid()).config).not.toHaveProperty('doubleSillOver');
    expect(() => projectFrom(cfg(0), 'projeto')).toThrow(/projeto\.config\.doubleSillOver: esperado medida > 0/);
  });

it("config.corner ('california' | 'three-stud') e config.tee ('ladder' | 'backer') — S14", () => {
    const cfg = (extra: object) => valid({ config: { studSpacing: 16, studLength: 92.625, ...extra } });
    expect(projectFrom(cfg({ corner: 'three-stud', tee: 'backer' })).config).toMatchObject({ corner: 'three-stud', tee: 'backer' });
    expect(projectFrom(valid()).config).not.toHaveProperty('corner');
    expect(projectFrom(valid()).config).not.toHaveProperty('tee');
    expect(() => projectFrom(cfg({ corner: 'two-stud' }), 'projeto')).toThrow(/projeto\.config\.corner: esperado um de california, three-stud/);
    expect(() => projectFrom(cfg({ tee: 'blocks' }), 'projeto')).toThrow(/projeto\.config\.tee: esperado um de ladder, backer/);
  });

  it('wall.extraStuds: x como medida, count inteiro ≥ 1, label texto', () => {
    const withExtras = (extraStuds: unknown) => valid({ walls: [{ ...(valid().walls as object[])[0], extraStuds }] });
    expect(projectFrom(withExtras([{ x: `3'-4"` }, { x: 60, count: 2, label: 'HDU2 post' }])).walls[0]?.extraStuds).toEqual([
      { x: 40 },
      { x: 60, count: 2, label: 'HDU2 post' },
    ]);
    expect(projectFrom(valid()).walls[0]).not.toHaveProperty('extraStuds');
    expect(() => projectFrom(withExtras({ x: 40 }), 'projeto')).toThrow(/projeto\.walls\[0\]\.extraStuds: esperado array/);
    expect(() => projectFrom(withExtras([{}]), 'projeto')).toThrow(/walls\[0\]\.extraStuds\[0\]\.x: esperado medida/);
    expect(() => projectFrom(withExtras([{ x: 40, count: 0 }]), 'projeto')).toThrow(/extraStuds\[0\]\.count: esperado inteiro ≥ 1/);
    expect(() => projectFrom(withExtras([{ x: 40, label: '' }]), 'projeto')).toThrow(/extraStuds\[0\]\.label: esperado texto não vazio/);
  });
});
