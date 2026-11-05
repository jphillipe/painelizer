import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { parseProject } from 'cli/project';
import { toProject } from 'extract';
import {
  draftFormat,
  draftFromJson,
  draftFromText,
  isIdFree,
  jsonFromDraft,
  nextOpeningId,
  nextWallId,
  openingCount,
  textFromDraft,
  type ProjectDraft,
} from './draft';

const ringgoldOutput = JSON.parse(
  readFileSync(new URL('../../../../extract/test/fixtures/ringgold-output.json', import.meta.url), 'utf8'),
) as Parameters<typeof toProject>[0];

function load(text: string): ProjectDraft {
  const r = draftFromText(text);
  if (!r.ok) throw new Error(r.problems.map((p) => p.text).join('; '));
  if (r.problems.length > 0) throw new Error(r.problems.map((p) => `${p.path}: ${p.text}`).join('; '));
  return r.draft;
}

describe('ida e volta pelo parser do CLI', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id}: parseProject(textFromDraft(draft)) == parseProject(original)`, () => {
      const draft = load(ex.text);
      expect(parseProject(textFromDraft(draft), 'p')).toEqual(parseProject(ex.text, 'p'));
      // Segunda passada: estável.
      expect(textFromDraft(load(textFromDraft(draft)))).toBe(textFromDraft(draft));
    });
  }

  it('S31: fireBlockAt e prices passam pelo draft e voltam iguais', () => {
    const raw = JSON.parse(EXAMPLES[0]!.text) as { config: Record<string, unknown> };
    raw.config['fireBlockAt'] = "10'";
    raw.config['prices'] = [
      { section: '2x6', length: '92 5/8"', price: 5.1 },
      { section: { material: 'LVL', width: 1.75, depth: 9.25 }, perFoot: 9.5 },
    ];
    const text = JSON.stringify(raw);
    const draft = load(text);
    expect(draft.config.fireBlockAt).toBe(120);
    expect(draft.config.prices).toEqual([
      { section: '2x6', length: 92.625, price: 5.1 },
      { section: 'LVL 1.75x9.25', perFoot: 9.5 },
    ]);
    expect(parseProject(textFromDraft(draft), 'p')).toEqual(parseProject(text, 'p'));
  });

  it('S39: nailing (pregação das ligações, P48) passa pelo draft e volta igual; não vai para extra', () => {
    const raw = JSON.parse(EXAMPLES[0]!.text) as { config: Record<string, unknown> };
    raw.config['nailing'] = { wallJoint: { count: 4, fastener: '16d nails', spacing: '8"' } };
    const text = JSON.stringify(raw);
    const draft = load(text);
    expect(draft.config.nailing).toEqual({ wallJoint: { count: 4, fastener: '16d nails', spacing: 8 } });
    expect(draft.config.extra?.['nailing']).toBeUndefined();
    expect(parseProject(textFromDraft(draft), 'p')).toEqual(parseProject(text, 'p'));
  });

  it('leitura real do Ringgold (toProject do extract) abre sem problems e volta igual', () => {
    const project = toProject(ringgoldOutput, { wallHeight: `9'-1 1/8"`, floorsSupported: 2, building: { groundSnowLoad: 30, buildingWidth: `29'` } });
    const text = JSON.stringify(project, null, 2);
    const draft = load(text);
    expect(parseProject(textFromDraft(draft), 'p')).toEqual(parseProject(text, 'p'));
    expect(draft.walls[0]?.wallType).toBeDefined();
    expect(draft.walls.some((w) => w.openings.some((o) => o.tag !== undefined && o.center !== undefined))).toBe(true);
  });

  it('medidas viram número; $comment e chaves desconhecidas voltam, depois das conhecidas', () => {
    const draft = load(EXAMPLES[0]!.text);
    expect(draft.config.studLength).toEqual([92.625, 104.625]);
    expect(draft.config.headerHeight).toBe(82.5);
    expect(draft.extra?.['$comment']).toMatch(/^CLI input example/);
    const json = jsonFromDraft(draft);
    expect(Object.keys(json)).toEqual(['name', 'date', 'revision', 'northAngle', 'config', 'walls', '$comment']);
    const ringgold = load(EXAMPLES[2]!.text);
    expect(ringgold.walls[0]?.extra?.['$comment']).toMatch(/^North wall/);
    expect((jsonFromDraft(ringgold)['walls'] as Record<string, unknown>[])[0]!['$comment']).toMatch(/^North wall/);
  });

  it('chave desconhecida numa abertura e wallType na parede sobrevivem', () => {
    const text = JSON.stringify({
      name: 'x',
      config: { studSpacing: 16, studLength: 92.625 },
      walls: [{ id: 'W1', length: 96, height: 97.125, section: '2x4', exterior: false, bearing: false, wallType: '1B', openings: [{ id: 'D', type: 'door', offset: 10, roughWidth: 38, roughHeight: 82.5, confidence: 0.4 }] }],
    });
    const draft = load(text);
    expect(draft.config.studLength).toEqual([92.625]);
    expect(draft.walls[0]?.wallType).toBe('1B');
    expect(draft.walls[0]?.openings[0]?.extra).toEqual({ confidence: 0.4 });
    const back = JSON.parse(textFromDraft(draft)) as { walls: { wallType: string; openings: { confidence: number }[] }[] };
    expect(back.walls[0]?.wallType).toBe('1B');
    expect(back.walls[0]?.openings[0]?.confidence).toBe(0.4);
  });
});

describe('leitura tolerante', () => {
  const base = { name: 'x', config: { studSpacing: 16, studLength: [92.625] } };

  it('locale legado (S34; P51: folhas sempre em inglês): o arquivo abre sem problem e a chave não volta', () => {
    for (const locale of ['pt', 'en', 'es']) {
      const ok = draftFromJson({ ...base, revision: 'B', locale, walls: [] });
      if (!ok.ok) throw new Error('should open');
      expect(ok.problems).toEqual([]);
      expect(ok.draft).not.toHaveProperty('locale');
      expect(Object.keys(jsonFromDraft(ok.draft))).toEqual(['name', 'revision', 'config', 'walls']);
    }
    const withWall = load(JSON.stringify({ ...JSON.parse(EXAMPLES[0]!.text), locale: 'pt' }));
    expect(textFromDraft(withWall)).toBe(textFromDraft(load(EXAMPLES[0]!.text)));
  });

  it('JSON inválido ou walls que não é lista: não abre', () => {
    expect(draftFromText('{')).toMatchObject({ ok: false });
    expect(draftFromJson({ ...base, walls: 'nope' })).toMatchObject({ ok: false, problems: [{ path: 'walls' }] });
    expect(draftFromJson(null)).toMatchObject({ ok: false });
  });

  it('medida malformada, booleano errado, altura ausente: abre com problems no caminho', () => {
    const r = draftFromJson({
      ...base,
      walls: [{ id: 'W1', length: '9 ft', section: '2x8', exterior: 'yes', bearing: true, openings: [{ id: 'J', type: 'window', offset: -3, roughWidth: 36, roughHeight: 48 }] }],
    });
    if (!r.ok) throw new Error('should open');
    expect(r.problems.map((p) => p.path)).toEqual(['walls[0].openings[0].offset', 'walls[0].length', 'walls[0].section', 'walls[0].exterior']);
    expect(r.draft.walls[0]).toMatchObject({ id: 'W1', bearing: true });
    expect(r.draft.walls[0]?.length).toBeUndefined();
    expect(r.draft.walls[0]?.exterior).toBeUndefined();
    expect(r.draft.walls[0]?.openings[0]?.offset).toBeUndefined();
  });

  it('parede e abertura sem id ganham um nome e um problem', () => {
    const r = draftFromJson({ ...base, walls: [{ length: 96, height: 97, section: '2x4', exterior: false, bearing: false, openings: [{ type: 'door' }] }] });
    if (!r.ok) throw new Error('should open');
    expect(r.draft.walls[0]?.id).toBe('wall-1');
    expect(r.draft.walls[0]?.openings[0]?.id).toBe('opening-1');
    expect(r.problems.map((p) => p.path)).toEqual(['walls[0].id', 'walls[0].openings[0].id']);
  });

  it('stockLengths na raiz vai para config; nos dois lugares é problem e config vence', () => {
    const one = draftFromJson({ ...base, stockLengths: [96, "12'"], walls: [] });
    if (!one.ok) throw new Error('should open');
    expect(one.draft.config.stockLengths).toEqual([96, 144]);
    expect(one.problems).toEqual([]);
    expect(Object.keys(jsonFromDraft(one.draft))).not.toContain('stockLengths');
    const both = draftFromJson({ ...base, config: { ...base.config, stockLengths: [120] }, stockLengths: [96], walls: [] });
    if (!both.ok) throw new Error('should open');
    expect(both.draft.config.stockLengths).toEqual([120]);
    expect(both.problems[0]?.path).toBe('stockLengths');
  });

  it('coordenadas com sinal e em pés-pol; ponto incompleto é problem', () => {
    const r = draftFromJson({ ...base, walls: [{ id: 'W1', start: { x: "-12'", y: 0 }, end: { x: 0 }, height: 97, section: '2x6', exterior: true, bearing: true }] });
    if (!r.ok) throw new Error('should open');
    expect(r.draft.walls[0]?.start).toEqual({ x: -144, y: 0 });
    expect(r.draft.walls[0]?.end).toBeUndefined();
    expect(r.problems).toEqual([{ path: 'walls[0].end.y', text: 'Missing coordinate' }]);
  });

  it('mesmo schema do CLI (S28.2): o que o parser recusa vira problem em inglês, pela regra da issue', () => {
    const r = draftFromJson({
      ...base,
      config: { studSpacing: `16'`, studLength: [92.625, 'x'], building: { groundSnowLoad: 30, buildingWidth: 300, windSpeed: 0 } },
      walls: [{ id: 'W1', length: 96, height: 97, section: '2x4', exterior: false, bearing: false, level: 0, openings: [{ id: 'J', header: { section: 'LVL', plies: 1 } }] }],
    });
    if (!r.ok) throw new Error('should open');
    expect(r.problems).toEqual([
      { path: 'config.studSpacing', text: `Expected 16 or 24 (inches), got "16'"` },
      { path: 'config.studLength[1]', text: `Not a measure: "x" (use inches or feet-inches, e.g. 12'-6 1/2")` },
      { path: 'config.building.windSpeed', text: 'Expected a number > 0, got 0' },
      { path: 'walls[0].openings[0].header.section', text: expect.stringMatching(/^Expected 2x4, .*got "LVL"$/) },
      { path: 'walls[0].level', text: 'Expected a whole number ≥ 1, got 0' },
    ]);
    expect(r.draft.config).toMatchObject({ building: { groundSnowLoad: 30, buildingWidth: 300 } });
    expect(r.draft.config.studSpacing).toBeUndefined();
  });

  it('chave desconhecida sem $ fica em extra (o editor não perde) e o CLI strict a recusa', () => {
    const text = JSON.stringify({ ...base, walls: [{ id: 'W1', length: 96, height: 97.125, section: '2x4', exterior: false, bearing: false, heigth: 97, openings: [] }] });
    const draft = load(text);
    expect(draft.walls[0]?.extra).toEqual({ heigth: 97 });
    expect(() => parseProject(textFromDraft(draft), 'p')).toThrow(/^p\.walls\[0\]\.heigth: unknown key/);
  });

  it('seção de header engenheirada em objeto e em texto', () => {
    const r = draftFromJson({
      ...base,
      config: { ...base.config, headerSchedule: { H1: { section: { material: 'LVL', width: '1 3/4"', depth: '9 1/4"' }, plies: 2, jackStuds: 1, kingStuds: 1 }, H2: { section: 'LVL 1.75x9.25', plies: 2, jackStuds: 1, kingStuds: 1 } } },
      walls: [],
    });
    if (!r.ok) throw new Error('should open');
    expect(r.draft.config.headerSchedule?.['H1']?.section).toEqual({ material: 'LVL', width: 1.75, depth: 9.25 });
    expect(r.draft.config.headerSchedule?.['H2']?.section).toBe('LVL 1.75x9.25');
    const json = jsonFromDraft(r.draft) as { config: { headerSchedule: Record<string, { section: unknown }> } };
    expect(json.config.headerSchedule['H1']?.section).toEqual({ material: 'LVL', width: 1.75, depth: 9.25 });
  });
});

describe('consultas', () => {
  it('draftFormat', () => {
    expect(draftFormat(load(EXAMPLES[1]!.text))).toBe('plan');
    expect(draftFormat(load(EXAMPLES[2]!.text))).toBe('loose');
    expect(draftFormat({ config: {}, walls: [] })).toBe('empty');
    expect(draftFormat({ config: {}, walls: [{ id: 'a', length: 1, openings: [] }, { id: 'b', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, openings: [] }] })).toBe('mixed');
  });

  it('nextWallId segue o padrão dominante', () => {
    const w = (id: string) => ({ id, openings: [] });
    expect(nextWallId({ config: {}, walls: ['W01', 'W02', 'W03'].map(w) })).toBe('W04');
    expect(nextWallId({ config: {}, walls: ['W01', 'W02', 'W04'].map(w) })).toBe('W05');
    expect(nextWallId({ config: {}, walls: ['N1', 'S1', 'S2', 'I1'].map(w) })).toBe('S3');
    expect(nextWallId({ config: {}, walls: ['N1', 'S1', 'I1'].map(w) })).toBe('W1');
    expect(nextWallId({ config: {}, walls: ['W1', 'A', 'W9'].map(w) })).toBe('W10');
    expect(nextWallId({ config: {}, walls: [] })).toBe('W1');
  });

  it('nextOpeningId e isIdFree valem para o projeto inteiro', () => {
    const d: ProjectDraft = { config: {}, walls: [{ id: 'W1', openings: [{ id: 'W1-O1' }] }, { id: 'W2', openings: [{ id: 'W2-O1' }, { id: 'W1-O2' }] }] };
    expect(nextOpeningId(d, 'W1')).toBe('W1-O3');
    expect(isIdFree(d, 'W1-O2', 'opening')).toBe(false);
    expect(isIdFree(d, 'W3', 'wall')).toBe(true);
    expect(openingCount(d)).toBe(3);
  });
});

describe('S29: panelBreaks', () => {
  const base = { name: 'x', config: { studSpacing: 16, studLength: [92.625] } };
  const wall = { id: 'W1', length: 480, height: 97.125, section: '2x6', exterior: true, bearing: true, openings: [] };

  it('lê pés-pol, devolve em polegadas depois de extraStuds; o CLI aceita', () => {
    const d = load(JSON.stringify({ ...base, walls: [{ ...wall, panelBreaks: ["13'-4\"", 320] }] }));
    expect(d.walls[0]?.panelBreaks).toEqual([160, 320]);
    const text = textFromDraft(d);
    expect(Object.keys(JSON.parse(text).walls[0])).toEqual(['id', 'length', 'height', 'section', 'exterior', 'bearing', 'panelBreaks', 'openings']);
    expect(parseProject(text).walls[0]?.panelBreaks).toEqual([160, 320]);
  });

  it('valor ruim é problem no caminho e a lista some do draft', () => {
    const r = draftFromText(JSON.stringify({ ...base, walls: [{ ...wall, panelBreaks: [160, 'x'] }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.walls[0]).not.toHaveProperty('panelBreaks');
    expect(r.problems.map((p) => p.path)).toContain('walls[0].panelBreaks[1]');
  });
});

describe('S37: posts', () => {
  const base = { name: 'x', config: { studSpacing: 16, studLength: [92.625] } };
  const wall = { id: 'W1', length: 144, height: 97.125, section: '2x6', exterior: true, bearing: true, openings: [] };

  it('lê pés-pol, devolve em polegadas depois de extraStuds, com os textos do projeto; o CLI aceita', () => {
    const posts = [{ x: "3'-10 1/2\"", section: '4x6', label: 'P-01', base: 'HDU2', top: 'LUS28' }];
    const r = draftFromText(JSON.stringify({ ...base, walls: [{ ...wall, extraStuds: [{ x: 10 }], posts }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.problems).toEqual([]);
    expect(r.draft.walls[0]?.posts).toEqual([{ x: 46.5, section: '4x6', label: 'P-01', base: 'HDU2', top: 'LUS28' }]);
    const text = textFromDraft(r.draft);
    expect(Object.keys(JSON.parse(text).walls[0])).toEqual(['id', 'length', 'height', 'section', 'exterior', 'bearing', 'extraStuds', 'posts', 'openings']);
    expect(parseProject(text).walls[0]?.posts).toEqual([{ x: 46.5, section: '4x6', label: 'P-01', base: 'HDU2', top: 'LUS28' }]);
  });

  it('seção fora de 4x4/4x6/6x6 é problem no caminho; o resto do post fica', () => {
    const r = draftFromText(JSON.stringify({ ...base, walls: [{ ...wall, posts: [{ x: 40, section: '2x6', zz: 1 }] }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.walls[0]?.posts).toEqual([{ x: 40 }]);
    expect(r.problems.map((p) => p.path)).toContain('walls[0].posts[0].section');
  });
});
