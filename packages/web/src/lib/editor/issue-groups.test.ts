import { describe, expect, it } from 'vitest';
import type { Notice } from '@/types/panels';
import { dropRepeated, groupIssues, groupKey, groupTitle, needsProjectData } from './issue-groups';
import { draftIssues, issueFromNotice, type IdIndex, type Issue } from './problems';
import { draftFromJson } from './draft';

const ids: IdIndex = {
  walls: ['N1', 'S1', 'S2', 'I1', 'I12-U3', 'W01'],
  openings: new Map([
    ['N1', ['N1-A-1']],
    ['S1', ['S1-A-1']],
    ['S2', ['S2-1-2', 'S2-D1']],
    ['I1', []],
    ['I12-U3', ['I12-U3-1']],
    ['W01', ['P1', 'J1']],
  ]),
};
const problem = (n: Notice): Issue => issueFromNotice(n, 'problem', ids);
const warning = (n: Notice): Issue => issueFromNotice(n, 'warning', ids);

describe('groupIssues', () => {
  it('30 paredes sem altura viram um grupo com título em inglês, 30 ids e a ação de dados do projeto', () => {
    const walls = Array.from({ length: 30 }, (_, i) => ({ id: `W${i + 1}`, start: { x: 0, y: i * 10 }, end: { x: 100, y: i * 10 }, section: '2x6', exterior: true, bearing: true, openings: [] }));
    const load = draftFromJson({ config: { studSpacing: 16, studLength: [92.625] }, walls });
    if (!load.ok) throw new Error('draft should load');
    const draft = load.draft;
    const issues = draftIssues(draft, []);
    expect(issues).toHaveLength(30);
    const groups = groupIssues(issues, { walls: draft.walls.map((w) => w.id), openings: new Map() });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'wall.height', severity: 'problem', title: 'Wall height is missing', count: 30, action: 'projectData' });
    expect(groups[0]!.wallIds).toHaveLength(30);
    expect(groups[0]!.items[0]!.text).toBe('wall W1: height is missing');
    expect(needsProjectData(issues)).toBe(true);
  });

  it('aviso da extração ganha título pelo código (em inglês) e mantém o texto original', () => {
    const w = warning({ source: 'extraction', code: 'OPENING_UNPLACED', message: 'parede S2, abertura S2-D1 (D1): a leitura não achou a cota do eixo', wallId: 'S2', openingId: 'S2-D1', params: { tag: 'D1' } });
    const [g] = groupIssues([w], ids);
    expect(g).toMatchObject({ key: 'OPENING_UNPLACED', severity: 'warning', title: 'Opening position not found in the drawing', count: 1, wallIds: ['S2'], openingIds: ['S2-D1'], action: 'openWall' });
    expect(g!.items[0]!.text).toContain('a leitura não achou');
  });

  it('erros do motor agrupam pelo código, com as paredes de cada um', () => {
    const out = (wallId: string, openingId: string, span: number): Notice => ({ code: 'HEADER_OUT_OF_TABLE', message: `x ${span}`, wallId, openingId, params: { why: 'span', span, table: 'R602.7(1)' } });
    const groups = groupIssues([problem(out('S2', 'S2-D1', 58.5)), problem(out('N1', 'N1-A-1', 58.5)), problem(out('S1', 'S1-A-1', 72))], ids);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'HEADER_OUT_OF_TABLE', count: 3, wallIds: ['S2', 'N1', 'S1'], title: 'Header outside the IRC table — engineer required' });
    expect(groupKey(problem(out('S2', 'S2-D1', 1)))).toBe('HEADER_OUT_OF_TABLE');
  });

  it('dado da casa faltando (HEADER_DATA_MISSING): família do draft, ação de dados do projeto, sem repetir o que o draft já disse', () => {
    const missing = (w: string): Notice => ({ code: 'HEADER_DATA_MISSING', message: `parede ${w}: …`, wallId: w, params: { missing: 'building' } });
    const groups = groupIssues([problem(missing('N1')), problem(missing('S1'))], ids);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'config.building', title: 'Snow load and building width are missing (IRC header table)', count: 2, wallIds: ['N1', 'S1'], action: 'projectData' });
    const own: Issue[] = [{ severity: 'problem', source: 'draft', kind: 'config.building', text: 'wall N1: …', wallId: 'N1' }];
    expect(dropRepeated([problem(missing('N1')), problem(missing('S1'))], own).map((i) => i.wallId)).toEqual(['S1']);
    expect(needsProjectData(groups[0]!.items)).toBe(true);
  });

  it('avisos do motor por painel: título do código, parede do id do painel; código novo vira título humanizado', () => {
    const w = warning({ source: 'engine', panelId: '1-S2-P1', code: 'HEADER_JACKS_BELOW_TABLE', message: 'x', openingId: 'S2-D1' });
    const [g] = groupIssues([w], ids);
    expect(g).toMatchObject({ key: 'HEADER_JACKS_BELOW_TABLE', title: 'Fewer jack studs than the IRC table', wallIds: ['S2'] });
    expect(groupTitle({ severity: 'warning', source: 'engine', code: 'SOME_NEW_CODE', text: 'x' })).toBe('Some new code');
  });

  it('problemas antes de avisos, maiores primeiro; paredes de "se cruzam" contam nas duas', () => {
    const crossing = problem({ source: 'engine', stage: 'plan', code: 'WALLS_CROSS', message: 'paredes N1 e S1 se cruzam', wallId: 'N1', alsoWalls: ['S1'], params: { otherWallId: 'S1', x: 10, y: 20 } });
    const warn: Issue = { severity: 'warning', source: 'extraction', code: 'DEFAULT_HEADER_HEIGHT', text: '3 abertura(s) sem altura' };
    const h1: Issue = { severity: 'problem', source: 'draft', kind: 'wall.height', text: 'wall N1: height is missing', wallId: 'N1' };
    const h2: Issue = { severity: 'problem', source: 'draft', kind: 'wall.height', text: 'wall S1: height is missing', wallId: 'S1' };
    const groups = groupIssues([warn, crossing, h1, h2], ids);
    expect(groups.map((g) => g.key)).toEqual(['wall.height', 'plan.open', 'DEFAULT_HEADER_HEIGHT']);
    expect(groups[1]!.wallIds).toEqual(['N1', 'S1']);
    expect(groups[1]!.action).toBeUndefined();
    expect(needsProjectData([warn, crossing])).toBe(false);
  });
});
