import { describe, expect, it } from 'vitest';
import type { Notice } from '@/types/panels';
import { causeCounts, commonParams, dropRepeated, groupIssues, groupKey, groupTitle, needsProjectData, openingInfo, tierOf, type OpeningInfo } from './issue-groups';
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

  it('S45: aviso do motor numa parede em que o draft aponta um problema próprio não some nem duplica', () => {
    const own: Issue[] = [{ severity: 'problem', source: 'draft', kind: 'wall.floorsSupported', text: 'wall S2: …', wallId: 'S2' }];
    const cripples = warning({ source: 'engine', panelId: '1-S2-P1', code: 'FLAT_HEADER_CRIPPLES', message: 'x', wallId: 'S2', openingId: 'S2-D1' });
    expect(cripples).toMatchObject({ severity: 'warning', wallId: 'S2', openingId: 'S2-D1' });
    expect(dropRepeated([cripples], own)).toEqual([cripples]);
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

/** S46: a lista conta e mostra uma linha por causa, em três níveis, com a frase dos valores em comum. */
describe('issues por causa (S46)', () => {
  const doorIds: IdIndex = {
    walls: ['I1', 'I2', 'I3', 'X1', 'X2'],
    openings: new Map([
      ['I1', ['I1-D']],
      ['I2', ['I2-D']],
      ['I3', ['I3-D']],
      ['X1', ['X1-W']],
      ['X2', ['X2-W']],
    ]),
  };
  const info = new Map<string, OpeningInfo>([
    ['I1-D', { tag: 'C', kind: 'door' }],
    ['I2-D', { tag: 'A', kind: 'door' }],
    ['I3-D', { tag: 'C', kind: 'door' }],
    ['X1-W', { tag: 'E2', kind: 'window' }],
    ['X2-W', { tag: 'F', kind: 'window' }],
  ]);
  const notice = (code: string, wallId: string, openingId: string, params: Record<string, unknown>): Notice => ({ source: 'engine', code, message: 'x', wallId, openingId, params });
  const cripples = (wallId: string): Issue => issueFromNotice(notice('FLAT_HEADER_CRIPPLES', wallId, wallId + '-D', { top: 83, gap: 24.125, topPlate: 107.125, max: 24 }), 'warning', doorIds);
  const mismatch = (wallId: string): Issue => issueFromNotice(notice('DOOR_RO_HEIGHT_MISMATCH', wallId, wallId + '-D', { roughHeight: 82.5, headerBase: 81.5 }), 'warning', doorIds);
  const outOfTable = (wallId: string, params: Record<string, unknown>): Issue => issueFromNotice(notice('HEADER_OUT_OF_TABLE', wallId, wallId + '-W', params), 'problem', doorIds);
  const overlap = (panelId: string): Issue => issueFromNotice({ source: 'engine', code: 'STUDS_OVERLAP', message: 'x', panelId, params: { aRole: 'stud', aX: 143.25, bRole: 'stud', bX: 144.375, overlap: 0.375 } }, 'warning', doorIds);

  it('tierOf: problema é sempre "fix"; aviso é "review", salvo os que a fábrica resolve ("fine")', () => {
    expect(tierOf({ severity: 'problem', code: 'HEADER_OUT_OF_TABLE' })).toBe('fix');
    expect(tierOf({ severity: 'warning', code: 'FLAT_HEADER_CRIPPLES' })).toBe('review');
    expect(tierOf({ severity: 'warning', code: 'STUDS_OVERLAP' })).toBe('fine');
    expect(tierOf({ severity: 'problem', code: 'STUDS_OVERLAP' })).toBe('fix');
    expect(tierOf({ severity: 'problem', kind: 'wall.height' })).toBe('fix');
  });

  it('commonParams: só as chaves com o mesmo valor em todos os itens; item sem params zera', () => {
    const item = (params?: Record<string, unknown>): Issue => ({ severity: 'warning', source: 'engine', code: 'X', text: 'x', ...(params === undefined ? {} : { params }) });
    expect(commonParams([item({ a: 1, b: 2 }), item({ a: 1, b: 3 }), item({ a: 1 })])).toEqual({ a: 1 });
    expect(commonParams([item({ a: 1 }), item()])).toEqual({});
    expect(commonParams([])).toEqual({});
  });

  it('frase-resumo das portas: quantas, de que tipos, e a medida em comum', () => {
    const [g] = groupIssues([cripples('I1'), cripples('I2'), cripples('I3')], doorIds, { openings: info });
    expect(g).toMatchObject({ key: 'FLAT_HEADER_CRIPPLES', tier: 'review', count: 3, tags: ['A', 'C'] });
    expect(g!.summary).toBe('3 doors (types A, C): flat header 24 1/8" below the top plate, over the 24" limit.');
    const [m] = groupIssues([mismatch('I1'), mismatch('I3')], doorIds, { openings: info });
    expect(m!.summary).toBe("2 doors (type C): RO height 6'-10 1/2\", header at 6'-9 1/2\".");
    // sem o contexto do draft: não sabe se é porta nem o tipo
    expect(groupIssues([cripples('I1'), cripples('I2')], doorIds)[0]!.summary).toBe('2 openings: flat header 24 1/8" below the top plate, over the 24" limit.');
  });

  it('frase-resumo do header fora da tabela: usa só o que é comum; sem os valores, não há frase', () => {
    const width = { why: 'width', width: 600, snow: 30, table: 'R602.7(1)' };
    const same = groupIssues([outOfTable('X1', width), outOfTable('X2', width)], doorIds, { openings: info });
    expect(same[0]).toMatchObject({ tier: 'fix', tags: ['E2', 'F'] });
    expect(same[0]!.summary).toBe("The building is 50'-0\" wide, outside IRC table R602.7(1).");
    const twoTables = groupIssues([outOfTable('X1', width), outOfTable('X2', { why: 'width', width: 600, table: 'R602.7(2)' })], doorIds, { openings: info });
    expect(twoTables[0]!.summary).toBe("The building is 50'-0\" wide, outside the IRC header tables.");
    const span = groupIssues([outOfTable('X1', { why: 'span' })], doorIds, { openings: info });
    expect(span[0]!.summary).toBeUndefined();
    const mixed = groupIssues([outOfTable('X1', width), outOfTable('X2', { why: 'span' })], doorIds, { openings: info });
    expect(mixed[0]!.summary).toBeUndefined();
  });

  it('frase-resumo das famílias do editor: contagem de paredes ou de aberturas', () => {
    const heights: Issue[] = ['I1', 'I2'].map((w) => ({ severity: 'problem', source: 'draft', kind: 'wall.height', text: 'wall ' + w + ': height is missing', wallId: w }));
    expect(groupIssues(heights, doorIds)[0]!.summary).toBe('2 walls have no height.');
    expect(groupIssues(heights.slice(0, 1), doorIds)[0]!.summary).toBe('1 wall has no height.');
    const floors: Issue[] = [{ severity: 'problem', source: 'draft', kind: 'wall.floorsSupported', text: 'x', wallId: 'X1' }];
    expect(groupIssues(floors, doorIds)[0]!.summary).toBe('1 bearing wall does not say how many floors it carries.');
    const positions: Issue[] = ['I1', 'I2'].map((w) => ({ severity: 'problem', source: 'draft', kind: 'opening.position', text: 'x', wallId: w, openingId: w + '-D' }));
    expect(groupIssues(positions, doorIds)[0]!.summary).toBe('2 openings have no position.');
  });

  it('ordem por nível (fix, review, fine) e contagem por causa', () => {
    const groups = groupIssues([overlap('1-I1-P1'), overlap('1-I2-P1'), overlap('1-I3-P1'), overlap('1-X1-P1'), cripples('I1'), cripples('I2'), outOfTable('X1', { why: 'span' })], doorIds, { openings: info });
    expect(groups.map((g) => [g.key, g.tier, g.count])).toEqual([
      ['HEADER_OUT_OF_TABLE', 'fix', 1],
      ['FLAT_HEADER_CRIPPLES', 'review', 2],
      ['STUDS_OVERLAP', 'fine', 4],
    ]);
    expect(causeCounts(groups)).toEqual({ fix: 1, review: 1, fine: 1 });
    expect(causeCounts([])).toEqual({ fix: 0, review: 0, fine: 0 });
  });

  it('openingInfo: tipo da abertura pela tag do catálogo ou pelo type da própria abertura', () => {
    const load = draftFromJson({
      config: { studSpacing: 16, studLength: [92.625], openingTypes: { A: { kind: 'door', width: 36, height: 80 } } },
      walls: [
        {
          id: 'W1', length: 240, height: 97.125, section: '2x4', exterior: false, bearing: false,
          openings: [
            { id: 'D1', tag: 'A', center: 60 },
            { id: 'J1', type: 'window', offset: 120, roughWidth: 36, roughHeight: 48 },
          ],
        },
      ],
    });
    if (!load.ok) throw new Error('draft should load');
    const map = openingInfo(load.draft);
    expect(map.get('D1')).toEqual({ tag: 'A', kind: 'door' });
    expect(map.get('J1')).toEqual({ kind: 'window' });
  });
});
