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
    [project({ nome: 'x' }), /^projeto\.nome: chave desconhecida/],
    [
      project({ config: { studSpacing: 16, studLength: 92.625, studSpace: 16 } }),
      /^projeto\.config\.studSpace: chave desconhecida/,
    ],
    [
      project({
        config: {
          studSpacing: 16,
          studLength: 92.625,
          building: { groundSnowLoad: 30, buildingWidth: 300, wind: 120 },
        },
      }),
      /^projeto\.config\.building\.wind: chave desconhecida/,
    ],
    [
      project({ config: { studSpacing: 16, studLength: 92.625, panel: { maxLenght: 200 } } }),
      /^projeto\.config\.panel\.maxLenght: chave desconhecida/,
    ],
    [project({}, { heigth: 97.125 }), /^projeto\.walls\[0\]\.heigth: chave desconhecida/],
    [
      project({}, { openings: [{ ...opening, doubleSilOver: true }] }),
      /^projeto\.walls\[0\]\.openings\[0\]\.doubleSilOver: chave desconhecida/,
    ],
    [
      project({}, { openings: [{ ...opening, header: { section: '2x10', plies: 2, kings: 2 } }] }),
      /header\.kings: chave desconhecida/,
    ],
    [project({}, { extraStuds: [{ x: 40, n: 2 }] }), /^projeto\.walls\[0\]\.extraStuds\[0\]\.n: chave desconhecida/],
  ])('chave desconhecida é erro com o caminho dela (%#)', (raw, message) => {
    expect(() => projectFrom(raw, 'projeto')).toThrow(ProjectError);
    expect(() => projectFrom(raw, 'projeto')).toThrow(message);
  });

  it('chave desconhecida vem antes do campo que ela deveria ser (erro de grafia aponta a grafia)', () => {
    const { height: _h, ...noHeight } = loose;
    expect(() => projectFrom({ ...project(), walls: [{ ...noHeight, heigth: 97.125 }] }, 'p')).toThrow(
      /^p\.walls\[0\]\.heigth: chave desconhecida/,
    );
  });

  it('chaves com $ passam em qualquer nível e não chegam ao projeto; wallType é conhecida e não chega à Wall', () => {
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
    expect(p.walls[0]).not.toHaveProperty('wallType');
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
          message: `esperado 16 ou 24 (polegadas), recebido "16'"`,
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

describe('fixtures do core passam pelo schema', () => {
  const dir = new URL('../../core/test/fixtures/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('são 12', () => expect(files).toHaveLength(12));

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
