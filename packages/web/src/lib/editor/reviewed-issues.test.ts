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
    walls: [{ id: 'I1', length: 120, height: 97.125, section: '2x4', exterior: false, bearing: false, openings: [] }],
  };
  const loaded = () =>
    editorReducer(initialEditorState, { type: 'load', text: JSON.stringify(project), source: 'file' });
  const key = issueReviewKey(cripples())!;

  it('marca, desmarca e desfaz; chaves em ordem, sem repetir; projeto sem marca não leva a chave', () => {
    const start = loaded();
    const marked = editorReducer(start, { type: 'setIssuesReviewed', keys: [key, 'B|x', key], reviewed: true });
    expect(marked.draft!.extra?.[REVIEWED_ISSUES_KEY]).toEqual(['B|x', key].sort());
    expect([...reviewedIssueKeys(marked.draft!)].sort()).toEqual(['B|x', key].sort());
    expect(marked.dirty).toBe(true);
    expect(editorReducer(marked, { type: 'setIssuesReviewed', keys: [key], reviewed: true })).toBe(marked);
    const undone = editorReducer(marked, { type: 'undo' });
    expect(reviewedIssueKeys(undone.draft!).size).toBe(0);
    const cleared = editorReducer(marked, { type: 'setIssuesReviewed', keys: [key, 'B|x'], reviewed: false });
    expect(cleared.draft!.extra?.[REVIEWED_ISSUES_KEY]).toBeUndefined();
    expect(editorReducer(start, { type: 'setIssuesReviewed', keys: [key], reviewed: false })).toBe(start);
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
