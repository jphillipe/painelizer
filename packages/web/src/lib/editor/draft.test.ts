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
  readFileSync('C:/Users/Phillipe/Desktop/painelizer/packages/extract/test/fixtures/ringgold-output.json', 'utf8'),
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
    expect(draft.extra?.['$comment']).toMatch(/^Exemplo de entrada/);
    const json = jsonFromDraft(draft);
    expect(Object.keys(json)).toEqual(['name', 'date', 'revision', 'northAngle', 'config', 'walls', '$comment']);
    const ringgold = load(EXAMPLES[2]!.text);
    expect(ringgold.walls[0]?.extra?.['$comment']).toMatch(/^Parede norte/);
    expect((jsonFromDraft(ringgold)['walls'] as Record<string, unknown>[])[0]!['$comment']).toMatch(/^Parede norte/);
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
