import { describe, expect, it } from 'vitest';
import { draftFromJson, textFromDraft, withoutEditorKeys } from './draft';
import type { Issue } from './problems';
import { issueReviewKey, markReviewed, REVIEWED_ISSUES_KEY, reviewedIssueKeys } from './reviewed-issues';
import { editorReducer, initialEditorState } from './state';

const cripples = (over: Partial<Issue> = {}): Issue => ({
  severity: 'warning',
  source: 'engine',
  code: 'FLAT_HEADER_CRIPPLES',
  text: 'x',
  wallId: 'I1',
  openingId: 'I1-D',
  panelId: '1-I1-P1',
  params: { top: 83, gap: 24.125, topPlate: 107.125, max: 24 },
  ...over,
});

/** S50: a marca de "revisado" é por ocorrência — o mesmo aviso, na mesma abertura, com as mesmas medidas. */
describe('issueReviewKey', () => {
  it('a mesma ocorrência dá a mesma chave, com os parâmetros em qualquer ordem', () => {
    const a = issueReviewKey(cripples());
    const b = issueReviewKey(
      cripples({ params: { max: 24, topPlate: 107.125, gap: 24.125, top: 83 }, text: 'outro texto' }),
    );
    expect(a).toBeDefined();
    expect(b).toBe(a);
  });

  it('outra abertura, outra parede ou outra medida: outra chave (o aviso volta a pedir revisão)', () => {
    const base = issueReviewKey(cripples());
    expect(issueReviewKey(cripples({ openingId: 'I1-D2' }))).not.toBe(base);
    expect(issueReviewKey(cripples({ wallId: 'I2' }))).not.toBe(base);
    expect(issueReviewKey(cripples({ params: { top: 82.125, gap: 25, topPlate: 107.125, max: 24 } }))).not.toBe(base);
    expect(issueReviewKey(cripples({ code: 'DOOR_RO_HEIGHT_MISMATCH' }))).not.toBe(base);
  });

  it('aviso de abertura não depende do número do painel; aviso só de painel depende', () => {
    expect(issueReviewKey(cripples({ panelId: '1-I1-P2' }))).toBe(issueReviewKey(cripples()));
    const overlap = (panelId: string): Issue => ({
      severity: 'warning',
      source: 'engine',
      code: 'STUDS_OVERLAP',
      text: 'x',
      wallId: 'I1',
      panelId,
      params: { overlap: 0.375 },
    });
    expect(issueReviewKey(overlap('1-I1-P1'))).not.toBe(issueReviewKey(overlap('1-I1-P2')));
  });

  it('problema nunca tem chave; aviso sem código nem família também não', () => {
    expect(issueReviewKey(cripples({ severity: 'problem' }))).toBeUndefined();
    expect(issueReviewKey({ severity: 'warning', source: 'draft', text: 'free text' })).toBeUndefined();
    expect(
      issueReviewKey({
        severity: 'warning',
        source: 'draft',
        kind: 'opening.position',
        text: 'x',
        wallId: 'I1',
        openingId: 'I1-D',
      }),
    ).toBeDefined();
  });
});

describe('markReviewed', () => {
  it('marca só os avisos cuja chave está no projeto; problema com a mesma chave não é marcado', () => {
    const key = issueReviewKey(cripples())!;
    const list = [cripples(), cripples({ openingId: 'I1-D2' }), cripples({ severity: 'problem' })];
    const out = markReviewed(list, new Set([key]));
    expect(out.map((i) => i.reviewed === true)).toEqual([true, false, false]);
    expect(markReviewed(list, new Set())).toEqual(list);
  });
});

describe('setIssuesReviewed: grava no projeto, desfaz, não muda o que vai para o motor', () => {
  const project = {
    name: 'x',
    config: { studSpacing: 16, studLength: [92.625] },
    walls: [
      {
        id: 'I1',
        length: 240,
        height: 97.125,
        section: '2x4',
        exterior: false,
        bearing: false,
        openings: [
          { id: 'I1-D', type: 'door', offset: 30, roughWidth: 38, roughHeight: 82.5 },
          { id: 'I1-D2', type: 'door', offset: 150, roughWidth: 38, roughHeight: 82.5 },
        ],
      },
      { id: 'I2', length: 120, height: 97.125, section: '2x4', exterior: false, bearing: false, openings: [] },
    ],
  };
  const loaded = () =>
    editorReducer(initialEditorState, { type: 'load', text: JSON.stringify(project), source: 'file' });
  const key = issueReviewKey(cripples())!;
  const key2 = issueReviewKey(cripples({ openingId: 'I1-D2' }))!;
  const mark = (state: ReturnType<typeof loaded>, keys: string[]) =>
    editorReducer(state, { type: 'setIssuesReviewed', keys, reviewed: true });
  const keysOf = (state: ReturnType<typeof loaded>): string[] => [...reviewedIssueKeys(state.draft!)].sort();

  it('marca, desmarca e desfaz; chaves em ordem, sem repetir; projeto sem marca não leva a chave', () => {
    const start = loaded();
    const marked = mark(start, [key, key2, key]);
    expect(marked.draft!.extra?.[REVIEWED_ISSUES_KEY]).toEqual([key, key2].sort());
    expect(keysOf(marked)).toEqual([key, key2].sort());
    expect(marked.dirty).toBe(true);
    expect(mark(marked, [key])).toBe(marked);
    const undone = editorReducer(marked, { type: 'undo' });
    expect(reviewedIssueKeys(undone.draft!).size).toBe(0);
    const cleared = editorReducer(marked, { type: 'setIssuesReviewed', keys: [key, key2], reviewed: false });
    expect(cleared.draft!.extra?.[REVIEWED_ISSUES_KEY]).toBeUndefined();
    expect(editorReducer(start, { type: 'setIssuesReviewed', keys: [key], reviewed: false })).toBe(start);
  });

  it('S50 (revisão): a chave é um JSON legível de volta; ids com "|" não se confundem', () => {
    expect(JSON.parse(key)).toEqual([
      'FLAT_HEADER_CRIPPLES',
      'I1',
      'I1-D',
      '',
      '{"gap":24.125,"max":24,"top":83,"topPlate":107.125}',
    ]);
    const a = issueReviewKey(cripples({ wallId: 'A|B', openingId: 'C' }));
    const b = issueReviewKey(cripples({ wallId: 'A', openingId: 'B|C' }));
    expect(a).not.toBe(b);
  });

  it('S50 (revisão): apagar a abertura leva a marca junto — outra abertura com o mesmo id nasce por revisar; undo devolve', () => {
    const marked = mark(loaded(), [key, key2]);
    const removed = editorReducer(marked, { type: 'removeOpening', wallId: 'I1', openingId: 'I1-D' });
    expect(keysOf(removed)).toEqual([key2]);
    const again = editorReducer(removed, { type: 'addOpening', wallId: 'I1', preset: { id: 'I1-D' } });
    expect(again.draft!.walls[0]!.openings.some((o) => o.id === 'I1-D')).toBe(true);
    expect(keysOf(again)).toEqual([key2]);
    expect(keysOf(editorReducer(removed, { type: 'undo' }))).toEqual([key, key2].sort());
  });

  it('S50 (revisão): renomear abertura ou parede, e apagar a parede, também soltam as marcas delas', () => {
    const marked = mark(loaded(), [key, key2]);
    const renamed = editorReducer(marked, { type: 'renameOpening', wallId: 'I1', openingId: 'I1-D', newId: 'I1-X' });
    expect(keysOf(renamed)).toEqual([key2]);
    expect(keysOf(editorReducer(marked, { type: 'renameWall', wallId: 'I1', newId: 'I9' }))).toEqual([]);
    expect(keysOf(editorReducer(marked, { type: 'removeWall', wallId: 'I1' }))).toEqual([]);
    // marcas de outra parede e de aviso sem parede ficam
    const projectLevel = issueReviewKey({
      severity: 'warning',
      source: 'engine',
      code: 'WIND_SPEED_MISSING',
      text: 'x',
    })!;
    const both = mark(loaded(), [key, projectLevel]);
    expect(keysOf(editorReducer(both, { type: 'removeWall', wallId: 'I2' }))).toEqual([key, projectLevel].sort());
    // chave que não se lê (arquivo editado à mão) é descartada na primeira edição
    const odd = editorReducer(mark(loaded(), ['not json']), {
      type: 'updateWall',
      wallId: 'I2',
      patch: { height: 100 },
    });
    expect(keysOf(odd)).toEqual([]);
  });

  it('S50 (revisão): duas aberturas que a leitura não posicionou na mesma parede têm chaves diferentes', () => {
    const unplaced = (openingId: string): Issue => ({
      severity: 'warning',
      source: 'extraction',
      code: 'OPENING_UNPLACED',
      text: 'x',
      wallId: 'I1',
      params: { tag: 'A' },
      cited: { wallId: 'I1', openingId },
    });
    expect(issueReviewKey(unplaced('I1-A-1'))).not.toBe(issueReviewKey(unplaced('I1-A-2')));
    // a abertura citada não existe no projeto: a marca não é descartada por isso
    const k = issueReviewKey(unplaced('I1-A-1'))!;
    const kept = editorReducer(mark(loaded(), [k]), { type: 'updateWall', wallId: 'I2', patch: { height: 100 } });
    expect(keysOf(kept)).toEqual([k]);
  });

  it('salvar e reabrir devolve as marcas; o texto do motor é o mesmo com e sem marcas', () => {
    const start = loaded();
    const marked = editorReducer(start, { type: 'setIssuesReviewed', keys: [key], reviewed: true });
    const saved = textFromDraft(marked.draft!);
    expect(saved).toContain(REVIEWED_ISSUES_KEY);
    const reopened = draftFromJson(JSON.parse(saved));
    if (!reopened.ok) throw new Error('should reopen');
    expect([...reviewedIssueKeys(reopened.draft)]).toEqual([key]);
    expect(textFromDraft(withoutEditorKeys(marked.draft!))).toBe(textFromDraft(withoutEditorKeys(start.draft!)));
  });

  it('valor estranho na chave do arquivo (não é lista de textos): sem marcas, sem quebrar', () => {
    expect(reviewedIssueKeys({ extra: { [REVIEWED_ISSUES_KEY]: 'oops' } }).size).toBe(0);
    expect([...reviewedIssueKeys({ extra: { [REVIEWED_ISSUES_KEY]: ['a', 3, null, 'b'] } })]).toEqual(['a', 'b']);
    expect(reviewedIssueKeys({}).size).toBe(0);
  });
});
