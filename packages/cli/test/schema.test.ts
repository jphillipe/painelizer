import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProjectError, projectFrom } from '../src/project';
import { configShape, projectFileSchema, readField } from '../src/schema';
import { EXAMPLES } from '../src/examples';

const loose = { id: 'W01', length: 144, height: 97.125, section: '2x6', exterior: true, bearing: true, openings: [] };
const opening = { id: 'J1', type: 'window', offset: 48, roughWidth: 36, roughHeight: 48 };

function project(overrides: Record<string, unknown> = {}, wall: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    config: { studSpacing: 16, studLength: 92.625 },
    walls: [{ ...loose, ...wall }],
    ...overrides,
  };
}

describe('schema strict (S28.2)', () => {
  it.each([
    [project({ nome: 'x' }), /^projeto\.nome: unknown key/],
    [
      project({ config: { studSpacing: 16, studLength: 92.625, studSpace: 16 } }),
      /^projeto\.config\.studSpace: unknown key/,
    ],
    [
      project({
        config: {
          studSpacing: 16,
          studLength: 92.625,
          building: { groundSnowLoad: 30, buildingWidth: 300, wind: 120 },
        },
      }),
      /^projeto\.config\.building\.wind: unknown key/,
    ],
    [
      project({ config: { studSpacing: 16, studLength: 92.625, panel: { maxLenght: 200 } } }),
      /^projeto\.config\.panel\.maxLenght: unknown key/,
    ],
    [project({}, { heigth: 97.125 }), /^projeto\.walls\[0\]\.heigth: unknown key/],
    [
      project({}, { openings: [{ ...opening, doubleSilOver: true }] }),
      /^projeto\.walls\[0\]\.openings\[0\]\.doubleSilOver: unknown key/,
    ],
    [
      project({}, { openings: [{ ...opening, header: { section: '2x10', plies: 2, kings: 2 } }] }),
      /header\.kings: unknown key/,
    ],
    [project({}, { extraStuds: [{ x: 40, n: 2 }] }), /^projeto\.walls\[0\]\.extraStuds\[0\]\.n: unknown key/],
  ])('unknown key é erro com o caminho dela (%#)', (raw, message) => {
    expect(() => projectFrom(raw, 'projeto')).toThrow(ProjectError);
    expect(() => projectFrom(raw, 'projeto')).toThrow(message);
  });

  it('unknown key vem antes do campo que ela deveria ser (erro de grafia aponta a grafia)', () => {
    const { height: _h, ...noHeight } = loose;
    expect(() => projectFrom({ ...project(), walls: [{ ...noHeight, heigth: 97.125 }] }, 'p')).toThrow(
      /^p\.walls\[0\]\.heigth: unknown key/,
    );
  });

  it('chaves com $ passam em qualquer nível e não chegam ao projeto; wallType chega à Wall (S35)', () => {
    const p = projectFrom(
      project(
        { $comment: 'raiz', $panelizer: { version: 1 }, config: { studSpacing: 16, studLength: 92.625, $note: 'c' } },
        {
          $reviewed: true,
          wallType: '1B',
          openings: [{ ...opening, $comment: 'abertura', header: { section: '2x10', plies: 2, $x: 1 } }],
        },
      ),
    );
    expect(p).not.toHaveProperty('$comment');
    expect(p.config).not.toHaveProperty('$note');
    expect(p.walls[0]).not.toHaveProperty('$reviewed');
    // Tag fora do catálogo numa parede completa: só rótulo, e a parede sai igual ao que era sem a tag.
    expect(p.walls[0]).toEqual({ ...loose, wallType: '1B', openings: [{ ...opening, header: { section: '2x10', plies: 2 } }] });
    expect(p.walls[0]!.openings[0]).toEqual({ ...opening, header: { section: '2x10', plies: 2 } });
  });

  it('a issue traz a regra e o valor recebido (o web formata em inglês sem ler o português)', () => {
    try {
      projectFrom(project({}, { length: '9 ft' }), 'p');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectError);
      expect((e as ProjectError).field).toEqual({ rule: 'measure', received: '9 ft' });
    }
    expect(readField(configShape.studSpacing, `16'`)).toEqual({
      ok: false,
      issues: [
        {
          path: [],
          message: `expected 16 or 24 (inches), got "16'"`,
          params: { rule: 'studSpacing', received: `16'` },
        },
      ],
    });
    expect(readField(configShape.studLength, [92.625, 'x'])).toMatchObject({
      ok: false,
      issues: [{ path: [1], params: { rule: 'measure' } }],
    });
  });

  it('formato: união loose | plan, discriminada por format', () => {
    const l = projectFileSchema.parse(project());
    expect(l.format).toBe('loose');
    const plan = projectFileSchema.parse({
      ...project(),
      walls: [{ ...loose, length: undefined, start: { x: 0, y: 0 }, end: { x: 144, y: 0 } }],
      northAngle: 30,
    });
    expect(plan).toMatchObject({ format: 'plan', northAngle: 30 });
  });

  it('os 3 exemplos passam no strict', () => {
    for (const ex of EXAMPLES) expect(projectFileSchema.safeParse(JSON.parse(ex.text)).success).toBe(true);
  });
});

describe('locale legado (S34; P51: folhas sempre em inglês)', () => {
  it('pt ou en na raiz ainda é aceito e ignorado', () => {
    expect(projectFrom(project({ locale: 'en' }), 'p')).toEqual(projectFrom(project(), 'p'));
    expect(projectFrom(project({ locale: 'pt' }), 'p')).toEqual(projectFrom(project(), 'p'));
    expect(projectFrom(project({ locale: 'pt' }), 'p')).not.toHaveProperty('locale');
  });

  it('outro valor é erro oneOf com os aceitos', () => {
    expect(() => projectFrom(project({ locale: 'es' }), 'p')).toThrow(/^p.locale: expected one of pt, en, got "es"/);
    const r = projectFileSchema.safeParse(project({ locale: 'EN' }));
    expect(r.success).toBe(false);
    expect((r.error!.issues[0] as { params?: unknown }).params).toEqual({ rule: 'oneOf', received: 'EN', allowed: ['pt', 'en'] });
  });
});

describe('fireBlockAt e prices (S31)', () => {
  const cfg = (extra: Record<string, unknown>) => project({ config: { studSpacing: 16, studLength: 92.625, ...extra } });

  it('fireBlockAt: medida > 0, aceita pés-pol', () => {
    expect(projectFrom(cfg({ fireBlockAt: "10'" }), 'p').config.fireBlockAt).toBe(120);
    expect(() => projectFrom(cfg({ fireBlockAt: 0 }), 'p')).toThrow(/^p\.config\.fireBlockAt/);
  });

  it('prices: por peça (comprimento em pés-pol) ou por pé; seção engenheirada em objeto vira texto', () => {
    const p = projectFrom(
      cfg({
        prices: [
          { section: '2x4', length: "8'", price: 3.98 },
          { section: '2x4', length: '92 5/8"', price: 3.75 },
          { section: '2x6', perFoot: 0.85 },
          { section: { material: 'LVL', width: 1.75, depth: 9.25 }, perFoot: 9.5 },
        ],
      }),
      'p',
    );
    expect(p.config.prices).toEqual([
      { section: '2x4', length: 96, price: 3.98 },
      { section: '2x4', length: 92.625, price: 3.75 },
      { section: '2x6', perFoot: 0.85 },
      { section: 'LVL 1.75x9.25', perFoot: 9.5 },
    ]);
  });

  it.each([
    [{ prices: [{ section: '2x4', length: 96, price: -1 }] }, 'p.config.prices[0].price: expected a price'],
    [{ prices: [{ section: '2x4', price: 1 }] }, 'p.config.prices[0].length'],
    [{ prices: [{ section: '2x4', perFoot: 1, length: 96 }] }, 'p.config.prices[0].length: unknown key'],
    [{ prices: [{ section: '2x5', perFoot: 1 }] }, 'p.config.prices[0].section'],
    [
      { prices: [{ section: '2x4', length: 96, price: 1 }, { section: '2x4', length: "8'", price: 2 }] },
      'p.config.prices[1]: duplicate price',
    ],
    [{ prices: { '2x4': 1 } }, 'p.config.prices: expected an array'],
  ])('prices inválido aponta o campo (%#)', (extra, message) => {
    expect(() => projectFrom(cfg(extra), 'p')).toThrow(message);
  });
});

describe('tipos de parede (S35)', () => {
  const wallTypes = {
    'WT-1S': { section: '2x6', exterior: true, bearing: true, description: '2x6 exterior bearing' },
    X1: { section: '2x4', exterior: false },
  };
  const cfg = { studSpacing: 16, studLength: 92.625, wallTypes };
  const bare = { id: 'W01', length: 144, height: 97.125, openings: [] };

  it('config.wallTypes entra no Config como veio; linha vazia e linha parcial valem', () => {
    const p = projectFrom(project({ config: { ...cfg, wallTypes: { ...wallTypes, EMPTY: {} } } }), 'p');
    expect(p.config.wallTypes).toEqual({ ...wallTypes, EMPTY: {} });
  });

  it('parede só com a tag sai completa pelo tipo; o campo da parede vale sobre o do tipo', () => {
    const p = projectFrom({ config: cfg, walls: [{ ...bare, wallType: 'WT-1S' }, { ...bare, id: 'W02', wallType: 'X1', bearing: false, section: '2x6' }] }, 'p');
    expect(p.walls[0]).toEqual({ ...bare, wallType: 'WT-1S', section: '2x6', exterior: true, bearing: true });
    expect(p.walls[1]).toEqual({ ...bare, id: 'W02', wallType: 'X1', section: '2x6', exterior: false, bearing: false });
  });

  it('em planta também: a HouseWall sai com os campos do tipo e a tag', () => {
    const p = projectFrom({ config: cfg, walls: [{ id: 'N', start: { x: 0, y: 0 }, end: { x: 144, y: 0 }, height: 97.125, wallType: 'WT-1S' }] }, 'p');
    expect(p.house!.walls[0]).toMatchObject({ id: 'N', wallType: 'WT-1S', section: '2x6', exterior: true, bearing: true });
  });

  it('sem wallType, seção, posição e carga continuam obrigatórias, com a frase de antes no campo', () => {
    expect(() => projectFrom({ config: cfg, walls: [{ ...bare, exterior: true, bearing: true }] }, 'p')).toThrow(
      /^p\.walls\[0\]\.section: expected one of 2x4, 2x6, got nothing$/,
    );
    expect(() => projectFrom({ config: cfg, walls: [{ ...bare, section: '2x4', bearing: true }] }, 'p')).toThrow(
      /^p\.walls\[0\]\.exterior: expected true\/false, got nothing$/,
    );
    expect(() => projectFrom({ config: cfg, walls: [{ ...bare, section: '2x4', exterior: true }] }, 'p')).toThrow(
      /^p\.walls\[0\]\.bearing: expected true\/false, got nothing$/,
    );
  });

  it('com wallType, o que faltar é erro do motor com código: tag fora do catálogo e campo que o tipo não dá', () => {
    const fail = (wall: Record<string, unknown>): ProjectError => {
      try {
        projectFrom({ config: cfg, walls: [{ ...bare, ...wall }] }, 'p');
      } catch (e) {
        return e as ProjectError;
      }
      throw new Error('expected a ProjectError');
    };
    const unknown = fail({ wallType: 'NOPE', section: '2x4' });
    expect(unknown).toBeInstanceOf(ProjectError);
    expect(unknown.path).toBe('p.walls[0]');
    expect(unknown.engine?.code).toBe('WALL_TYPE_UNKNOWN');
    expect(unknown.engine?.wallId).toBe('W01');
    expect(unknown.message).toBe(
      'p.walls[0]: Wall W01: wall type "NOPE" is not in config.wallTypes and the wall does not give exterior/interior, bearing/non-bearing',
    );
    const partial = fail({ wallType: 'X1' });
    expect(partial.engine?.code).toBe('WALL_FIELD_MISSING');
    expect(partial.engine?.params).toEqual({ fields: ['bearing'], wallType: 'X1' });
  });

  it.each([
    [{ ...cfg, wallTypes: { A: { section: '2x8' } } }, /^p\.config\.wallTypes\.A\.section: expected one of 2x4, 2x6/],
    [{ ...cfg, wallTypes: { A: { exterior: 'yes' } } }, /^p\.config\.wallTypes\.A\.exterior: expected true\/false/],
    [{ ...cfg, wallTypes: { A: { sheathing: true } } }, /^p\.config\.wallTypes\.A\.sheathing: unknown key/],
    [{ ...cfg, wallTypes: { '': {} } }, /^p\.config\.wallTypes: empty key/],
    [{ ...cfg, wallTypes: [] }, /^p\.config\.wallTypes: expected an object/],
  ])('catálogo inválido aponta o campo (%#)', (config, message) => {
    expect(() => projectFrom(project({ config }), 'p')).toThrow(message);
  });

  it('wallType vazio é erro de texto, como as outras tags', () => {
    expect(() => projectFrom(project({}, { wallType: '' }), 'p')).toThrow(/^p\.walls\[0\]\.wallType: expected non-empty text/);
  });
});

describe('fixtures do core passam pelo schema', () => {
  const dir = new URL('../../core/test/fixtures/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('são 16 (S31: wall-144-fireblock e house-cross; S35: house-walltypes; S36: wall-144-kitchen)', () => expect(files).toHaveLength(16));

  it.each(files)('%s: config e paredes válidas no strict; config sai igual ao fixture', (file) => {
    const fx = JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as Record<string, unknown> & {
      config: Record<string, unknown>;
      wall?: unknown;
      house?: { walls: unknown[]; northAngle?: number };
    };
    const raw =
      fx.house === undefined
        ? { config: fx.config, walls: [fx.wall] }
        : { config: fx.config, walls: fx.house.walls, northAngle: fx.house.northAngle };
    const p = projectFrom(raw, file);
    expect(p.config).toEqual(fx.config);
  });
});

describe('blocking por altura (S36)', () => {
  const cfg = { studSpacing: 16, studLength: 92.625 };

  it('presets e fileiras na parede (medidas pés-pol); presets do projeto no config', () => {
    const p = projectFrom(
      project(
        { config: { ...cfg, blockingPresets: { hood: { y: "5'-6\"", label: 'Range hood' }, grab: { y: 34 } } } },
        { blocking: ['kitchen-base', 'hood', { y: '3\'-0"', from: 12, to: "4'", label: 'Rail' }] },
      ),
      'p',
    );
    expect(p.config.blockingPresets).toEqual({ hood: { y: 66, label: 'Range hood' }, grab: { y: 34 } });
    expect(p.walls[0]!.blocking).toEqual(['kitchen-base', 'hood', { y: 36, from: 12, to: 48, label: 'Rail' }]);
  });

  it('o tipo de parede dá o blocking da parede que não tem; a parede manda', () => {
    const wallTypes = { 'WT-4': { section: '2x4', exterior: false, bearing: false, blocking: ['kitchen-base', { y: 54 }] } };
    const bare = { id: 'W01', length: 144, height: 97.125, openings: [], wallType: 'WT-4' };
    const p = projectFrom({ config: { ...cfg, wallTypes }, walls: [bare, { ...bare, id: 'W02', blocking: [] }] }, 'p');
    expect(p.walls[0]!.blocking).toEqual(['kitchen-base', { y: 54 }]);
    expect(p.walls[1]!.blocking).toEqual([]);
  });

  it('preset desconhecido: erro de projeto no item, com o código do motor', () => {
    const fail = (raw: Record<string, unknown>): ProjectError => {
      try {
        projectFrom(raw, 'p');
      } catch (e) {
        return e as ProjectError;
      }
      throw new Error('expected a ProjectError');
    };
    const onWall = fail(project({}, { blocking: ['kitchen-base', 'kitchen-sink'] }));
    expect(onWall.path).toBe('p.walls[0].blocking[1]');
    expect(onWall.engine?.code).toBe('BLOCKING_PRESET_UNKNOWN');
    expect(onWall.message).toMatch(/blocking\[1\]: no blocking preset "kitchen-sink" — use one of bath-paper/);
    const onType = fail({
      config: { ...cfg, wallTypes: { T: { section: '2x4', exterior: false, bearing: false, blocking: ['nope'] } } },
      walls: [{ id: 'W01', length: 144, height: 97.125, openings: [], wallType: 'T' }],
    });
    expect(onType.path).toBe('p.config.wallTypes.T.blocking[0]');
  });

  it.each([
    [project({}, { blocking: 'kitchen-base' }), /^p\.walls\[0\]\.blocking: expected an array/],
    [project({}, { blocking: [36] }), /^p\.walls\[0\]\.blocking\[0\]: /],
    [project({}, { blocking: [''] }), /^p\.walls\[0\]\.blocking\[0\]: expected non-empty text/],
    [project({}, { blocking: [{ y: 36, height: 2 }] }), /^p\.walls\[0\]\.blocking\[0\]\.height: unknown key/],
    [project({}, { blocking: [{ from: 2 }] }), /^p\.walls\[0\]\.blocking\[0\]\.y: /],
    [project({}, { blocking: [{ y: -3 }] }), /^p\.walls\[0\]\.blocking\[0\]\.y: /],
    [project({ config: { ...cfg, blockingPresets: { a: { y: 30, use: 'x' } } } }), /^p\.config\.blockingPresets\.a\.use: unknown key/],
  ])('entrada inválida aponta o campo (%#)', (raw, message) => {
    expect(() => projectFrom(raw, 'p')).toThrow(message);
  });
});
