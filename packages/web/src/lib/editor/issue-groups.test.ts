import { describe, expect, it } from 'vitest';
import { dropRepeated, groupIssues, groupKey, groupTitle, needsProjectData, normalizeText } from './issue-groups';
import { draftIssues, parseProblem, parseWarning, type IdIndex, type Issue } from './problems';
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

  it('aviso da extração ganha título pelo código e mantém o texto original', () => {
    const w = parseWarning('extração ABERTURA_SEM_POSICAO: parede S2, abertura S2-D1 (D1): a leitura não achou a cota do eixo — os painéis da parede saem sem esta abertura', ids);
    const [g] = groupIssues([w], ids);
    expect(g).toMatchObject({ key: 'ABERTURA_SEM_POSICAO', severity: 'warning', title: 'Opening position not found in the drawing', count: 1, wallIds: ['S2'], openingIds: ['S2-D1'], action: 'openWall' });
    expect(g!.items[0]!.text).toContain('a leitura não achou');
  });

  it('problemas do motor que só diferem no id agrupam; que diferem num número, não', () => {
    const a = parseProblem('parede S2: header fora da tabela R602.7(1) para a abertura S2-D1 (vão 58.5")', ids);
    const b = parseProblem('parede N1: header fora da tabela R602.7(1) para a abertura N1-A-1 (vão 58.5")', ids);
    const c = parseProblem('parede S1: header fora da tabela R602.7(1) para a abertura S1-A-1 (vão 72")', ids);
    expect(groupKey(a, ids)).toBe(groupKey(b, ids));
    expect(groupKey(a, ids)).not.toBe(groupKey(c, ids));
    const groups = groupIssues([a, b, c], ids);
    expect(groups.map((g) => g.count)).toEqual([2, 1]);
    expect(groups[0]!.wallIds).toEqual(['S2', 'N1']);
    expect(groups[0]!.title).toBe('Header outside the IRC table — engineer required');
    expect(groupTitle(parseProblem('parede S2: algo novo com a abertura S2-D1 (vão 58.5")', ids), ids)).toBe('Algo novo com a abertura ▢ (vão 58.5")');
  });

  it('problema do motor sem código mas conhecido pelo texto: título em inglês e ação de dados do projeto', () => {
    const text = (w: string) => `parede ${w}: parede portante sem header no projeto e sem config.building (neve e largura da edificação) — não dá para escolher o header pela tabela; informe o dado ou o header da abertura`;
    const groups = groupIssues([parseProblem(text('N1'), ids), parseProblem(text('S1'), ids)], ids);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'config.building', title: 'Snow load and building width are missing (IRC header table)', count: 2, wallIds: ['N1', 'S1'], action: 'projectData' });
    const own: Issue[] = [{ severity: 'problem', source: 'draft', kind: 'config.building', text: 'wall N1: …', wallId: 'N1' }];
    expect(dropRepeated([parseProblem(text('N1'), ids), parseProblem(text('S1'), ids)], own).map((i) => i.wallId)).toEqual(['S1']);
    expect(needsProjectData(groups[0]!.items)).toBe(true);
  });

  it('avisos do motor por painel: título do código, parede do id do painel', () => {
    const w = parseWarning('1-S2-P1 HEADER_JACKS_BELOW_TABLE: parede S2, abertura S2-D1: 1 jack por lado em vez de 2 — só 3" até o fim', ids);
    const [g] = groupIssues([w], ids);
    expect(g).toMatchObject({ key: 'HEADER_JACKS_BELOW_TABLE', title: 'Fewer jack studs than the IRC table', wallIds: ['S2'] });
    expect(groupTitle({ severity: 'warning', source: 'engine', code: 'SOME_NEW_CODE', text: 'x' }, ids)).toBe('Some new code');
  });

  it('problemas antes de avisos, maiores primeiro; paredes de "se cruzam" contam nas duas', () => {
    const crossing = parseProblem('planta: paredes N1 e S1 se cruzam em (10, 20) — divida uma delas', ids);
    const warn: Issue = { severity: 'warning', source: 'extraction', code: 'ALTURA_PADRAO', text: 'extração ALTURA_PADRAO: 3 abertura(s) sem altura' };
    const h1: Issue = { severity: 'problem', source: 'draft', kind: 'wall.height', text: 'wall N1: height is missing', wallId: 'N1' };
    const h2: Issue = { severity: 'problem', source: 'draft', kind: 'wall.height', text: 'wall S1: height is missing', wallId: 'S1' };
    const groups = groupIssues([warn, crossing, h1, h2], ids);
    expect(groups.map((g) => g.key)).toEqual(['wall.height', 'plan.open', 'ALTURA_PADRAO']);
    expect(groups[1]!.wallIds).toEqual(['N1', 'S1']);
    expect(groups[1]!.action).toBeUndefined();
    expect(needsProjectData([warn, crossing])).toBe(false);
  });

  it('normalizeText tira o prefixo e troca ids de parede, abertura e painel', () => {
    expect(normalizeText('motor: parede I12-U3, abertura I12-U3-1: algo com 12"', ids)).toBe('parede ▢, abertura ▢: algo com 12"');
    expect(normalizeText('1-S2-P1 PANEL_OVERWEIGHT: painel 1-S2-P1: peso 300 lb', ids)).toBe('painel ▢: peso 300 lb');
  });
});
