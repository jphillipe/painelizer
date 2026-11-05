import { describe, expect, it } from 'vitest';
import type { Config, Wall } from '../../src/types';
import { EngineError } from '../../src/messages';
import { panelizeHouse } from '../../src/house/panelizeHouse';
import { frameWalls } from '../../src/house/frame';
import { housePlanSvg } from '../../src/output/planSvg';
import { panelSvg } from '../../src/output/svg';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { splitWall } from '../../src/panelize/splitWall';
import {
  WALL_TYPE_FIELDS,
  resolveWallType,
  wallTypeMismatches,
  wallTypeOf,
  wallTypeWarnings,
} from '../../src/rules/wallTypes';
import { projectFrom } from '../../../cli/src/project';
import cornerLJson from '../fixtures/house-corner-L.json';
import wallTypesJson from '../fixtures/house-walltypes.json';
import plainJson from '../fixtures/wall-144-plain.json';
import { houseFixture, wallFixture } from '../helpers/fixtures';
import { expectSameMembers, type MemberKeyFields } from '../helpers/members';

const base: Config = { studSpacing: 16, studThickness: 1.5, plateThickness: 1.5, studLength: [92.625] };

const catalog: Config = {
  ...base,
  wallTypes: {
    'WT-1S': { section: '2x6', exterior: true, bearing: true, description: '2x6 exterior bearing wall, sheathed' },
    'WT-2': { section: '2x4', exterior: false, bearing: false },
    // Como a leitura da IA monta: seção e posição da folha de partition types, sem carga.
    X1: { section: '2x6', exterior: true, description: 'architect type' },
    EMPTY: {},
  },
};

/** O erro que `f` lança, exigindo que seja `EngineError`. */
function engineError(f: () => unknown): EngineError {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    return e as EngineError;
  }
  throw new Error('expected an EngineError');
}

describe('resolveWallType — o tipo dá o que a parede não disser', () => {
  it('parede só com a tag: seção, posição e carga vêm do tipo; a tag e os outros campos ficam', () => {
    const r = resolveWallType({ id: 'W1', wallType: 'WT-1S', height: 97.125 }, catalog);
    expect(r).toEqual({ id: 'W1', wallType: 'WT-1S', height: 97.125, section: '2x6', exterior: true, bearing: true });
  });

  it('campo da parede vale sobre o do tipo (inclusive `false`)', () => {
    const r = resolveWallType({ id: 'W1', wallType: 'WT-1S', section: '2x4', bearing: false }, catalog);
    expect(r).toMatchObject({ section: '2x4', exterior: true, bearing: false });
  });

  it('tipo parcial (sem carga): a parede completa o que falta', () => {
    expect(resolveWallType({ id: 'W1', wallType: 'X1', bearing: true }, catalog)).toMatchObject({
      section: '2x6',
      exterior: true,
      bearing: true,
    });
  });

  it('parede sem tag e completa volta igual; não muda o objeto de entrada', () => {
    const wall = { id: 'W1', section: '2x4' as const, exterior: false, bearing: false };
    const r = resolveWallType(wall, catalog);
    expect(r).toEqual(wall);
    expect(r).not.toBe(wall);
    expect(wall).toEqual({ id: 'W1', section: '2x4', exterior: false, bearing: false });
  });

  it('tag fora do catálogo com a parede completa é só rótulo (o que a leitura da IA já escrevia)', () => {
    const wall = { id: 'W1', wallType: '1B', section: '2x4' as const, exterior: false, bearing: false };
    expect(resolveWallType(wall, catalog)).toEqual(wall);
    expect(resolveWallType(wall, base)).toEqual(wall);
  });

  it('tag fora do catálogo com dado faltando: WALL_TYPE_UNKNOWN com a tag e os campos', () => {
    const e = engineError(() => resolveWallType({ id: 'W7', wallType: 'ZZ', section: '2x4' }, catalog));
    expect(e.code).toBe('WALL_TYPE_UNKNOWN');
    expect(e.wallId).toBe('W7');
    expect(e.params).toEqual({ tag: 'ZZ', fields: ['exterior', 'bearing'] });
    expect(e.message).toBe('Wall W7: wall type "ZZ" is not in config.wallTypes and the wall does not give exterior/interior, bearing/non-bearing');
    // Sem catálogo nenhum é o mesmo erro.
    expect(engineError(() => resolveWallType({ id: 'W7', wallType: 'ZZ' }, base)).code).toBe('WALL_TYPE_UNKNOWN');
  });

  it('campo que nem a parede nem o tipo dão: WALL_FIELD_MISSING', () => {
    const typed = engineError(() => resolveWallType({ id: 'W2', wallType: 'X1' }, catalog));
    expect(typed.code).toBe('WALL_FIELD_MISSING');
    expect(typed.params).toEqual({ fields: ['bearing'], wallType: 'X1' });
    expect(typed.message).toBe('Wall W2: bearing/non-bearing missing — wall type "X1" does not give it; set it on the wall or on the type');

    const untyped = engineError(() => resolveWallType({ id: 'W3', exterior: true }, catalog));
    expect(untyped.code).toBe('WALL_FIELD_MISSING');
    expect(untyped.params).toEqual({ fields: ['section', 'bearing'] });
    expect(untyped.message).toBe('Wall W3: section, bearing/non-bearing missing — set it on the wall or give the wall a type from config.wallTypes');

    expect(engineError(() => resolveWallType({ wallType: 'EMPTY' }, catalog)).params).toEqual({
      fields: [...WALL_TYPE_FIELDS],
      wallType: 'EMPTY',
    });
  });

  it('tag com nome de propriedade de Object não acha linha no protótipo', () => {
    expect(wallTypeOf({ wallType: 'constructor' }, catalog)).toBeUndefined();
    expect(wallTypeOf({ wallType: 'toString' }, { wallTypes: {} })).toBeUndefined();
    expect(engineError(() => resolveWallType({ id: 'W1', wallType: 'constructor' }, catalog)).code).toBe('WALL_TYPE_UNKNOWN');
  });
});

describe('WALL_TYPE_MISMATCH — a parede manda, com aviso', () => {
  it('nenhum aviso sem tag, com tag fora do catálogo, ou quando a parede repete o tipo', () => {
    expect(wallTypeMismatches({ id: 'W1', section: '2x4', exterior: false, bearing: false }, catalog)).toEqual([]);
    expect(wallTypeMismatches({ id: 'W1', wallType: 'ZZ', section: '2x4', exterior: false, bearing: false }, catalog)).toEqual([]);
    expect(wallTypeMismatches({ id: 'W1', wallType: 'WT-1S', section: '2x6', exterior: true, bearing: true }, catalog)).toEqual([]);
    // O tipo parcial não contradiz o campo que ele não dá.
    expect(wallTypeMismatches({ id: 'W1', wallType: 'X1', section: '2x6', exterior: true, bearing: false }, catalog)).toEqual([]);
  });

  it('um aviso por campo diferente, na ordem seção, posição, carga, com os dois valores', () => {
    const wall = { id: 'W1', wallType: 'WT-1S', section: '2x4' as const, exterior: true, bearing: false };
    expect(wallTypeMismatches(wall, catalog)).toEqual([
      { field: 'section', wall: '2x4', type: '2x6' },
      { field: 'bearing', wall: false, type: true },
    ]);
    const warnings = wallTypeWarnings(wall, catalog);
    expect(warnings.map((w) => w.code)).toEqual(['WALL_TYPE_MISMATCH', 'WALL_TYPE_MISMATCH']);
    expect(warnings[0]).toMatchObject({ wallId: 'W1', params: { wallType: 'WT-1S', field: 'section', wall: '2x4', type: '2x6' } });
    expect(warnings[0]!.message).toBe(
      'Wall W1: section 2x4, but wall type "WT-1S" is 2x6 — the panel follows the wall; fix the wall or the type',
    );
    expect(warnings[1]!.message).toBe(
      'Wall W1: non-bearing wall, but wall type "WT-1S" is bearing — the panel follows the wall; fix the wall or the type',
    );
    expect(wallTypeWarnings({ id: 'W2', wallType: 'WT-2', section: '2x4', exterior: true, bearing: false }, catalog)[0]!.message).toBe(
      'Wall W2: exterior wall, but wall type "WT-2" is interior — the panel follows the wall; fix the wall or the type',
    );
  });

  it('o painel sai com a seção da parede, o aviso e a tag; em parede dividida, em cada painel', () => {
    const plain = wallFixture(plainJson);
    const wall: Wall = { ...plain.wall, wallType: 'WT-2' };
    const config: Config = { ...plain.config, wallTypes: catalog.wallTypes! };
    const reference = panelizeWall(plain.wall, plain.config);
    const panel = panelizeWall(wall, config);
    // A parede manda: as peças são as do fixture, sem mudar nada.
    expectSameMembers(panel.members, reference.members);
    expect(panel.section).toBe(plain.wall.section);
    expect(panel.wallType).toBe('WT-2');
    const codes = panel.warnings.map((w) => w.code);
    expect(codes.filter((c) => c === 'WALL_TYPE_MISMATCH')).toHaveLength(wallTypeMismatches(wall, config).length);
    expect(codes.filter((c) => c !== 'WALL_TYPE_MISMATCH')).toEqual(reference.warnings.map((w) => w.code));
    expect(wallTypeMismatches(wall, config).length).toBeGreaterThan(0);

    const long = splitWall({ ...wall, length: 480 }, config);
    expect(long.length).toBeGreaterThan(1);
    for (const p of long) {
      expect(p.wallType, p.id).toBe('WT-2');
      expect(p.warnings.some((w) => w.code === 'WALL_TYPE_MISMATCH'), p.id).toBe(true);
    }
  });

  it('parede sem tipo: painel sem `wallType` e sem aviso (o que já existia não muda)', () => {
    const plain = wallFixture(plainJson);
    const panel = panelizeWall(plain.wall, { ...plain.config, wallTypes: catalog.wallTypes! });
    expect(panel).not.toHaveProperty('wallType');
    expect(panel).toEqual(panelizeWall(plain.wall, plain.config));
  });
});

describe('fixture house-walltypes — o house-corner-L com seção, posição e carga vindas do tipo', () => {
  const fx = houseFixture(wallTypesJson);
  const original = houseFixture(cornerLJson);
  const { panels, warnings } = panelizeHouse(fx.house, fx.config);
  const originalPanels = panelizeHouse(original.house, original.config).panels;

  it('o fixture é revisável: avisa no $comment que o humano não confirmou', () => {
    expect(wallTypesJson.$comment).toContain('not confirmed by the human — review');
    expect(fx.expected.sameMembersAs).toBe('house-corner-L');
  });

  it('as paredes saem do arquivo com os campos do tipo e a tag', () => {
    const expected = fx.expected.walls as Record<string, { wallType: string; section: string; exterior: boolean; bearing: boolean }>;
    expect(fx.house.walls.map((w) => w.id)).toEqual(Object.keys(expected));
    for (const w of fx.house.walls) expect(w, w.id).toMatchObject(expected[w.id]!);
  });

  it('members idênticos aos do house-corner-L (expectedMembers do fixture original e os painéis de hoje)', () => {
    expect(panels.map((p) => p.id)).toEqual(fx.expected.panelIds);
    expect(panels.map((p) => p.id)).toEqual(original.expected.panelIds);
    const originalExpected = original.expected.panels as Record<string, { expectedMembers: MemberKeyFields[] }>;
    panels.forEach((p, i) => {
      expectSameMembers(p.members, originalExpected[p.id]!.expectedMembers);
      // Nada além da tag muda no painel: mesmas peças (com `flat`), plan, face, peso, origem.
      const { wallType, ...rest } = p;
      expect(wallType, p.id).toBeDefined();
      expect(rest, p.id).toEqual(originalPanels[i]);
    });
    expect(frameWalls(fx.house).map((f) => ({ ...f, wall: { ...f.wall, wallType: undefined } }))).toEqual(
      frameWalls(original.house).map((f) => ({ ...f, wall: { ...f.wall, wallType: undefined } })),
    );
  });

  it('cada painel leva a tag, os campos resolvidos e nenhum aviso', () => {
    const expected = fx.expected.panels as Record<
      string,
      { wallId: string; wallType: string; section: string; exterior: boolean; bearing: boolean; members: number; warnings: string[]; infoLine: string }
    >;
    expect(warnings).toEqual([]);
    for (const p of panels) {
      const e = expected[p.id]!;
      expect({ wallId: p.wallId, wallType: p.wallType, section: p.section, exterior: p.exterior, bearing: p.bearing }, p.id).toEqual({
        wallId: e.wallId,
        wallType: e.wallType,
        section: e.section,
        exterior: e.exterior,
        bearing: e.bearing,
      });
      expect(p.members, p.id).toHaveLength(e.members);
      expect(p.warnings.map((w) => w.code), p.id).toEqual(e.warnings);
    }
  });

  it('folha: o tipo entra na linha de dados; sem tipo a linha é a de antes', () => {
    const expected = fx.expected.panels as Record<string, { infoLine: string }>;
    const escaped = (t: string): string => t.replaceAll('"', '&quot;');
    panels.forEach((p, i) => {
      const sheet = panelSvg(p, { project: 'house-walltypes' });
      expect(sheet, p.id).toContain(`<text class="info" x="24" y="58" font-size="12" fill="#333">${escaped(expected[p.id]!.infoLine)}</text>`);
      // Tirando a tag (linha de dados e "Wall content", S39) e o nome do projeto, a folha é a do house-corner-L.
      const plain = sheet.replaceAll(` · type ${p.wallType}`, '').replace('house-walltypes', 'house-corner-L');
      expect(plain, p.id).toBe(panelSvg(originalPanels[i]!, { project: 'house-corner-L' }));
    });
  });

  it('planta: rótulo `W1 · WT-1S` e o tipo no <title>; sem tipo, só o id', () => {
    const plan = housePlanSvg(fx.house, panels);
    for (const label of fx.expected.planLabels) expect(plan).toContain(`>${label}</text>`);
    expect(plan).toContain(`<title>W1 2x6 · type WT-1S · plate 12'-2 3/4&quot; · 1 panel</title>`);
    const before = housePlanSvg(original.house, originalPanels);
    expect(before).toContain('>W1</text>');
    expect(before).not.toContain(' · type ');
    // Tirando os rótulos e a legenda (que com tipos ganha as linhas deles, S39), a planta é a do house-corner-L.
    const body = (svg: string): string => svg.slice(svg.indexOf('<text'), svg.indexOf('<g class="legend"'));
    expect(body(plan.replace('>W1 · WT-1S<', '>W1<').replace('>W2 · X1<', '>W2<').replaceAll(/ · type [^ ]+/g, ''))).toBe(body(before));
    // Legenda (S39): como ler o rótulo e uma linha por tipo usado, com as paredes; a descrição vem do catálogo.
    expect(before).not.toContain('class="legend-type"');
    expect(plan).toContain('>W01 · WT-1 = wall · wall type</text>');
    expect(plan).toContain('>WT-1S (W1)</text>');
    expect(plan).toContain('>X1 (W2)</text>');
    const described = housePlanSvg(fx.house, panels, { wallTypes: fx.config.wallTypes! });
    expect(described).toContain('>WT-1S — 2x6 exterior bearing wall, sheathed (W1)</text>');
  });

  it('pelo arquivo: tag fora do catálogo com dado faltando é erro de projeto com o código do motor', () => {
    const walls = [{ id: 'W1', length: 144, height: 97.125, wallType: 'NOPE', exterior: true, openings: [] }];
    try {
      projectFrom({ config: fx.config, walls }, 'fixture');
      throw new Error('expected a ProjectError');
    } catch (e) {
      const err = e as { path?: string; engine?: EngineError };
      expect(err.path).toBe('fixture.walls[0]');
      expect(err.engine?.code).toBe('WALL_TYPE_UNKNOWN');
      expect(err.engine?.params).toEqual({ tag: 'NOPE', fields: ['section', 'bearing'] });
    }
  });
});
