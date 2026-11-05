import { describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { parseProject } from 'cli/project';
import { englishMessage } from '@/lib/messages.en';
import { draftFromJson, draftFromText, textFromDraft, type DraftWall, type ProjectDraft } from './draft';
import { planGeometry } from './geometry';
import { groupIssues } from './issue-groups';
import { draftIssues, idIndex, issueFromNotice, issueMessage } from './problems';
import { projectDataNeeds } from './requirements';
import {
  hasUnknownWallType,
  missingWallFields,
  typeOfWall,
  wallFieldNames,
  wallTypeConflicts,
  wallTypeHint,
  wallTypeOptions,
  wallTypeSummary,
  wallTypeUsage,
  withWallType,
} from './wall-types';

// `server-only` lança fora do React Server; nos testes vira módulo vazio.
vi.mock('server-only', () => ({}));
const { check } = await import('@/services/panels.service');

function load(raw: unknown): ProjectDraft {
  const r = typeof raw === 'string' ? draftFromText(raw) : draftFromJson(raw);
  if (!r.ok) throw new Error(r.problems.map((p) => p.text).join('; '));
  if (r.problems.length > 0) throw new Error(r.problems.map((p) => `${p.path}: ${p.text}`).join('; '));
  return r.draft;
}

const wallTypes = {
  'WT-1S': { section: '2x6', exterior: true, bearing: true, description: '2x6 exterior bearing wall, sheathed' },
  X1: { section: '2x4', exterior: false },
};
const config = { studSpacing: 16, studLength: [92.625], wallTypes };
const bare = { id: 'W1', length: 144, height: 97.125, openings: [] };
const project = (walls: Record<string, unknown>[], cfg: Record<string, unknown> = config): Record<string, unknown> => ({ config: cfg, walls });

describe('draft: config.wallTypes entra, volta e não vira "extra" (S35)', () => {
  it('lê o catálogo campo a campo e escreve de volta na ordem das chaves conhecidas', () => {
    const d = load(project([{ ...bare, wallType: 'WT-1S' }]));
    expect(d.config.wallTypes).toEqual(wallTypes);
    expect(d.config.extra).toBeUndefined();
    const back = JSON.parse(textFromDraft(d)) as { config: Record<string, unknown>; walls: Record<string, unknown>[] };
    expect(back.config['wallTypes']).toEqual(wallTypes);
    expect(Object.keys(back.config)).toEqual(['studSpacing', 'studLength', 'wallTypes']);
    // A parede só com a tag volta só com a tag: o editor não grava o que veio do tipo.
    expect(back.walls[0]).toEqual({ id: 'W1', length: 144, height: 97.125, wallType: 'WT-1S', openings: [] });
    expect(parseProject(textFromDraft(d), 'p')).toEqual(parseProject(JSON.stringify(project([{ ...bare, wallType: 'WT-1S' }])), 'p'));
  });

  it('campo inválido numa linha vira problema no caminho; os vizinhos ficam', () => {
    const r = draftFromJson(project([{ ...bare, wallType: 'A' }], { ...config, wallTypes: { A: { section: '2x8', exterior: true, bearing: 'yes' } } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.problems.map((p) => p.path)).toEqual(['config.wallTypes.A.section', 'config.wallTypes.A.bearing']);
    expect(r.draft.config.wallTypes).toEqual({ A: { exterior: true } });
  });

  it('exemplos do CLI abrem sem problems com o catálogo e as tags', () => {
    const casa = load(EXAMPLES.find((e) => e.id === 'casa-exemplo')!.text);
    expect(Object.keys(casa.config.wallTypes ?? {})).toEqual(['WT-1S', 'WT-2']);
    expect(casa.walls.map((w) => w.wallType)).toEqual(['WT-1S', 'WT-1S', 'WT-2', 'WT-2', 'WT-1S', 'WT-1S', 'WT-1S']);
    // W05 só traz a tag; nada falta porque o tipo dá os três campos.
    const w05 = casa.walls.find((w) => w.id === 'W05')!;
    expect([w05.section, w05.exterior, w05.bearing]).toEqual([undefined, undefined, undefined]);
    expect(draftIssues(casa, [])).toEqual([]);
    const ringgold = load(EXAMPLES.find((e) => e.id === 'ringgold-checkpoint')!.text);
    expect(ringgold.walls.map((w) => w.wallType)).toEqual(['X1', 'X1', 'X1', '1']);
    expect(draftIssues(ringgold, [])).toEqual([]);
  });
});

describe('wall-types: o que o tipo dá à parede', () => {
  const d = load(project([{ ...bare, wallType: 'WT-1S' }, { ...bare, id: 'W2', wallType: 'X1', section: '2x6' }, { ...bare, id: 'W3', wallType: 'ZZ', section: '2x4', exterior: false, bearing: false }, { ...bare, id: 'W4', section: '2x4', exterior: false, bearing: false }]));
  const [w1, w2, w3, w4] = d.walls as [DraftWall, DraftWall, DraftWall, DraftWall];

  it('withWallType preenche só o que a parede não diz e não mexe na parede sem tipo', () => {
    expect(withWallType(d.config, w1)).toMatchObject({ section: '2x6', exterior: true, bearing: true });
    expect(withWallType(d.config, w2)).toMatchObject({ section: '2x6', exterior: false });
    expect(withWallType(d.config, w2).bearing).toBeUndefined();
    expect(withWallType(d.config, w3)).toBe(w3);
    expect(withWallType(d.config, w4)).toBe(w4);
    // O draft não muda.
    expect(w1.section).toBeUndefined();
  });

  it('campos que faltam, tag fora do catálogo e conflitos', () => {
    expect(missingWallFields(d.config, w1)).toEqual([]);
    expect(missingWallFields(d.config, w2)).toEqual(['bearing']);
    expect(missingWallFields({}, { id: 'X', openings: [] })).toEqual(['section', 'exterior', 'bearing']);
    expect(hasUnknownWallType(d.config, w3)).toBe(true);
    expect(hasUnknownWallType(d.config, w1)).toBe(false);
    expect(hasUnknownWallType(d.config, w4)).toBe(false);
    expect(wallTypeConflicts(d.config, w2)).toEqual([{ field: 'section', wall: '2x6', type: '2x4' }]);
    expect(wallTypeConflicts(d.config, w1)).toEqual([]);
    expect(typeOfWall(d.config, w3)).toBeUndefined();
  });

  it('resumo, opções do campo, ajuda e uso', () => {
    expect(wallTypeSummary(wallTypes['WT-1S'] as never)).toBe('2x6 · exterior · bearing');
    expect(wallTypeSummary({ section: '2x4', exterior: false })).toBe('2x4 · interior');
    expect(wallTypeSummary({})).toBe('no defaults');
    expect(wallTypeOptions(d.config)).toEqual([
      { tag: 'WT-1S', summary: '2x6 · exterior · bearing' },
      { tag: 'X1', summary: '2x4 · interior' },
    ]);
    expect(wallTypeOptions({})).toEqual([]);
    expect(wallTypeHint(d.config, undefined)).toBe('Pick one from the project wall types, or type a tag');
    expect(wallTypeHint(d.config, 'WT-1S')).toBe('2x6 · exterior · bearing — fills what the wall leaves unset');
    expect(wallTypeHint(d.config, 'ZZ')).toBe('Not in the project wall types: label only');
    expect(wallTypeUsage(d, 'WT-1S')).toBe(1);
    expect(wallTypeUsage(d, 'nope')).toBe(0);
    expect(wallFieldNames(['section', 'bearing'])).toBe('section, bearing / non-bearing');
  });
});

describe('issues do editor com tipos de parede', () => {
  it('parede só com a tag: nada falta; tipo parcial: só o campo que ele não dá', () => {
    expect(draftIssues(load(project([{ ...bare, wallType: 'WT-1S' }])), [])).toEqual([]);
    const partial = draftIssues(load(project([{ ...bare, wallType: 'X1' }])), []);
    expect(partial.map((i) => i.kind)).toEqual(['wall.bearing']);
  });

  it('tag fora do catálogo com campo faltando: uma issue da família wall.wallType, a mesma do erro do parser', () => {
    const d = load(project([{ ...bare, wallType: 'NOPE', exterior: true }]));
    const issues = draftIssues(d, []);
    expect(issues.map((i) => i.kind)).toEqual(['wall.wallType']);
    expect(issues[0]!.text).toBe('wall W1: wall type "NOPE" is not in the project wall types and the wall does not give section, bearing / non-bearing');

    // O que a checagem do editor recebe do serviço (parser do CLI + core).
    const checked = check(textFromDraft(d));
    expect(checked.ok).toBe(false);
    const notice = checked.ok ? undefined : checked.problems[0];
    expect(notice).toMatchObject({ source: 'parser', code: 'WALL_TYPE_UNKNOWN', wallId: 'W1', path: 'walls[0]' });
    const fromParser = issueFromNotice(notice!, 'problem', idIndex(d));
    expect(fromParser).toMatchObject({ kind: 'wall.wallType', wallId: 'W1', code: 'WALL_TYPE_UNKNOWN' });
    expect(issueMessage(fromParser)).toBe('Wall W1: wall type "NOPE" is not in the project wall types and the wall does not give section, bearing / non-bearing.');
    // O grupo é um só (o draft e o parser dizem a mesma coisa).
    const groups = groupIssues([...issues, fromParser], idIndex(d));
    expect(groups.map((g) => [g.key, g.title, g.count])).toEqual([['wall.wallType', 'Wall type is not in the project wall types', 2]]);
  });

  it('tag fora do catálogo com a parede completa não é problema (só rótulo)', () => {
    expect(draftIssues(load(project([{ ...bare, wallType: 'NOPE', section: '2x4', exterior: false, bearing: false }])), [])).toEqual([]);
  });

  it('portante vinda do tipo conta para os dados da tabela IRC', () => {
    const opening = { id: 'J1', type: 'window', offset: 48, roughWidth: 36, roughHeight: 48 };
    const d = load(project([{ ...bare, wallType: 'WT-1S', openings: [opening] }]));
    expect(projectDataNeeds(d).buildingMissing).toBe(true);
    expect(draftIssues(d, []).map((i) => i.kind)).toEqual(['config.building', 'wall.floorsSupported']);
  });

  it('frases em inglês: aviso de parede diferente do tipo e campo que o tipo não dá', () => {
    expect(englishMessage({ code: 'WALL_TYPE_MISMATCH', wallId: 'W1', params: { wallType: 'WT-1S', field: 'section', wall: '2x4', type: '2x6' } })).toBe(
      'Wall W1: section 2x4, but wall type "WT-1S" is 2x6 — the panel follows the wall. Fix the wall or the type.',
    );
    expect(englishMessage({ code: 'WALL_TYPE_MISMATCH', wallId: 'W1', params: { wallType: 'WT-1S', field: 'bearing', wall: false, type: true } })).toBe(
      'Wall W1: non-bearing wall, but wall type "WT-1S" is bearing — the panel follows the wall. Fix the wall or the type.',
    );
    expect(englishMessage({ code: 'WALL_TYPE_MISMATCH', wallId: 'W1', params: { wallType: 'X1', field: 'exterior', wall: true, type: false } })).toBe(
      'Wall W1: exterior wall, but wall type "X1" is interior — the panel follows the wall. Fix the wall or the type.',
    );
    expect(englishMessage({ code: 'WALL_FIELD_MISSING', wallId: 'W2', params: { fields: ['bearing'], wallType: 'X1' } })).toBe(
      'Wall W2: bearing / non-bearing missing — wall type "X1" does not give it. Set it on the wall or on the type.',
    );
    expect(englishMessage({ code: 'WALL_FIELD_MISSING', wallId: 'W2', params: { fields: ['section', 'exterior'] } })).toBe(
      'Wall W2: section, exterior / interior missing — set it on the wall or give the wall a type.',
    );
    // Sem parâmetros (arquivo antigo): a frase genérica, nunca "undefined".
    expect(englishMessage({ code: 'WALL_TYPE_MISMATCH', wallId: 'W1' })).toBe('Wall W1: the wall differs from its wall type; the panel follows the wall.');
  });
});

describe('planta do editor: a espessura vem do tipo quando a parede não diz', () => {
  it('parede em planta só com a tag WT-1S (2x6) sai com 5 1/2" de espessura; sem tipo e sem seção, o padrão 2x4', () => {
    const plan = (wall: Record<string, unknown>): number => {
      const r = draftFromJson(project([{ id: 'N', start: { x: 0, y: 0 }, end: { x: 144, y: 0 }, height: 97.125, openings: [], ...wall }]));
      if (!r.ok) throw new Error('should open');
      return planGeometry(r.draft).walls[0]!.thickness;
    };
    expect(plan({ wallType: 'WT-1S' })).toBe(5.5);
    expect(plan({ wallType: 'X1' })).toBe(3.5);
    expect(plan({})).toBe(3.5);
    expect(plan({ wallType: 'X1', section: '2x6' })).toBe(5.5);
  });
});
