import { SuggestError, type AskResult, type FixSuggestion } from 'extract/suggest';
import { describe, expect, it, vi } from 'vitest';
import { issueForSuggestion, SUGGEST_SYSTEM, type SuggestIssue } from '@/lib/ai/fix-suggestion';
import { draftFromJson } from '@/lib/editor/draft';
import { fourCausesProject } from '@/lib/editor/four-causes.fixture';
import { groupIssues, openingInfo } from '@/lib/editor/issue-groups';
import { idIndex, parseEngineResult } from '@/lib/editor/problems';

// `server-only` lança fora do React Server; nos testes vira módulo vazio.
vi.mock('server-only', () => ({}));

const { check } = await import('./panels.service');
const { suggestFix } = await import('./suggest.service');

const projectText = JSON.stringify(fourCausesProject);

/** A causa como o editor a mandaria: da checagem real do projeto. */
function issueOf(family: string): SuggestIssue {
  const load = draftFromJson(fourCausesProject);
  if (!load.ok) throw new Error('draft should load');
  const result = check(projectText);
  const ids = idIndex(load.draft);
  const groups = groupIssues(parseEngineResult(result.ok ? { warnings: result.warnings } : result, ids), ids, {
    openings: openingInfo(load.draft),
  });
  return issueForSuggestion(groups.find((g) => g.family === family)!);
}

type Edit = FixSuggestion['edits'][number];
const edit = (e: Partial<Edit>): Edit => ({
  target: 'opening',
  wallId: '',
  openingId: '',
  tag: '',
  field: 'headerHeight',
  value: '',
  ...e,
});
const answer = (edits: Edit[], over: Partial<FixSuggestion> = {}): AskResult => ({
  suggestion: { explanation: 'Because.', confidence: 'medium', needsFromHuman: '', edits, ...over },
  model: 'claude-opus-5-5',
  usage: { inputTokens: 1000, outputTokens: 100 },
});

/** S51: a IA propõe; quem diz se resolve é a checagem do motor, antes e depois. Nenhum teste chama a API. */
describe('suggestFix', () => {
  it('proposta boa: as edições validadas, a descrição e o efeito medido pelo motor (3 → 0, nada novo)', async () => {
    const ask = vi.fn(async () =>
      answer([
        edit({ target: 'openingType', tag: 'A', field: 'roughHeight', value: '81.5' }),
        edit({ target: 'openingType', tag: 'B', field: 'roughHeight', value: '81.5' }),
      ]),
    );
    const r = await suggestFix(
      { projectText, issue: issueOf('DOOR_RO_HEIGHT_MISMATCH'), notes: ['Doors per A601.'] },
      ask,
    );
    expect(r).toEqual({
      ok: true,
      explanation: 'Because.',
      confidence: 'medium',
      needsFromHuman: '',
      edits: [
        { target: 'openingType', tag: 'A', patch: { roughHeight: 81.5 } },
        { target: 'openingType', tag: 'B', patch: { roughHeight: 81.5 } },
      ],
      lines: ['Opening type A: RO height → 6\'-9 1/2"', 'Opening type B: RO height → 6\'-9 1/2"'],
      rejected: [],
      structural: false,
      effect: { before: 3, after: 0, newProblems: [], grownProblems: [], newWarnings: [] },
    });
    const [prompt] = ask.mock.calls[0]! as unknown as [{ system: string; user: string }];
    expect(prompt.system).toBe(SUGGEST_SYSTEM);
    expect(prompt.user).toContain('DOOR_RO_HEIGHT_MISMATCH');
    expect(prompt.user).toContain('Doors per A601.');
  });

  it('proposta que resolve a causa mas cria um problema: o efeito traz a família nova e a proposta é marcada como estrutural', async () => {
    // header de 3 plies (4 1/2") numa parede 2x4 (3 1/2"): o motor recusa
    const doors = [
      ['I1', 'I1-A'],
      ['I2', 'I2-B'],
      ['I3', 'I3-A'],
    ] as const;
    const ask = async () =>
      answer(
        doors.flatMap(([wallId, openingId]) => [
          edit({ wallId, openingId, field: 'headerSection', value: '2x12' }),
          edit({ wallId, openingId, field: 'headerPlies', value: '3' }),
        ]),
      );
    const r = await suggestFix({ projectText, issue: issueOf('FLAT_HEADER_CRIPPLES') }, ask);
    if (!r.ok) throw new Error('expected a suggestion');
    expect(r.structural).toBe(true);
    expect(r.lines).toEqual(['3 openings (I1-A, I2-B, I3-A): Header → 2x12 × 3']);
    expect(r.effect).toEqual({
      before: 3,
      after: 0,
      newProblems: ['Project header thicker than the wall'],
      grownProblems: [],
      newWarnings: [],
    });
  });

  it('id inventado é descartado e relatado; sem edição válida não há efeito a medir', async () => {
    const ask = async () =>
      answer([edit({ wallId: 'I9', openingId: 'NOPE', field: 'headerHeight', value: '82.5' })], {
        needsFromHuman: 'The header from the structural framing plan.',
      });
    const r = await suggestFix({ projectText, issue: issueOf('HEADER_OUT_OF_TABLE') }, ask);
    if (!r.ok) throw new Error('expected a suggestion');
    expect(r.edits).toEqual([]);
    expect(r.lines).toEqual([]);
    expect(r.rejected).toHaveLength(1);
    expect(r.needsFromHuman).toBe('The header from the structural framing plan.');
    expect(r.effect).toBeUndefined();
  });

  it('a API falha: uma frase para a tela, sem lançar e sem detalhe interno', async () => {
    const failing = (e: unknown) =>
      suggestFix({ projectText, issue: issueOf('DOOR_RO_HEIGHT_MISMATCH') }, async () => Promise.reject(e));
    expect(await failing(new SuggestError('API_ERROR', 'rate limited', 429))).toEqual({
      ok: false,
      message: 'The AI is busy right now. Try again in a minute.',
    });
    expect(await failing(new SuggestError('API_ERROR', 'invalid x-api-key', 401))).toEqual({
      ok: false,
      message: 'AI suggestions are not set up on this server.',
    });
    expect(await failing(new SuggestError('MODEL_REFUSED', 'declined'))).toEqual({
      ok: false,
      message: 'The AI declined to answer this one.',
    });
    expect(await failing(new SuggestError('RESPONSE_INVALID', 'bad'))).toEqual({
      ok: false,
      message: 'The AI answer could not be read. Try again.',
    });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await failing(new Error('secret detail sk-ant-123'))).toEqual({
      ok: false,
      message: 'The AI suggestion failed. Try again.',
    });
    quiet.mockRestore();
  });

  it('projeto que não abre: nem chama a IA', async () => {
    const ask = vi.fn(async () => answer([]));
    expect(await suggestFix({ projectText: '{', issue: issueOf('STUDS_OVERLAP') }, ask)).toEqual({
      ok: false,
      message: 'The project could not be read.',
    });
    expect(ask).not.toHaveBeenCalled();
  });
});

const { fromWire } = await import('@/lib/ai/fix-suggestion');
const { applyEdit } = await import('@/lib/editor/state');

/** S51 (revisão): o que a tela aplica é o que o motor conferiu; o efeito não esconde piora; a conta da API tem teto. */
describe('suggestFix — transporte, piora e limites (revisão da S51)', () => {
  const doors = [
    ['I1', 'I1-A'],
    ['I2', 'I2-B'],
    ['I3', 'I3-A'],
  ] as const;

  it('"limpar um campo" sobrevive à viagem do servidor para a tela: o que o Apply aplica é o que o motor conferiu', async () => {
    // limpar o topo do RO das três portas: passa a valer o do projeto (82 1/2"), e os dois avisos somem
    const ask = async () =>
      answer(doors.map(([wallId, openingId]) => edit({ wallId, openingId, field: 'headerHeight', value: '' })));
    const r = await suggestFix({ projectText, issue: issueOf('DOOR_RO_HEIGHT_MISMATCH') }, ask);
    if (!r.ok) throw new Error('expected a suggestion');
    expect(r.effect).toMatchObject({ before: 3, after: 0 });
    expect(r.lines).toEqual(['3 openings (I1-A, I2-B, I3-A): Top of RO → cleared']);
    // a resposta de uma server action perde as chaves com valor undefined (como o JSON): a limpeza viaja como null
    const wire = JSON.parse(JSON.stringify(r)) as typeof r;
    expect(wire.edits[0]).toEqual({
      target: 'opening',
      wallId: 'I1',
      openingId: 'I1-A',
      patch: { headerHeight: null },
    });
    const load = draftFromJson(fourCausesProject);
    if (!load.ok) throw new Error('draft should load');
    const applied = fromWire(wire.edits).reduce(applyEdit, load.draft);
    const openings = applied.walls.flatMap((w) => w.openings).filter((o) => doors.some(([, id]) => id === o.id));
    expect(openings.map((o) => 'headerHeight' in o)).toEqual([false, false, false]);
  });

  it('piora de um problema que já existia aparece no efeito (não é "nada novo")', async () => {
    // a parede I1 vira externa portante: a porta dela entra no mesmo erro de header que X1 e X2 já tinham
    const ask = async () =>
      answer([
        edit({ target: 'wall', wallId: 'I1', field: 'bearing', value: 'true' }),
        edit({ target: 'wall', wallId: 'I1', field: 'exterior', value: 'true' }),
        edit({ target: 'wall', wallId: 'I1', field: 'floorsSupported', value: '1' }),
      ]);
    const r = await suggestFix({ projectText, issue: issueOf('DOOR_RO_HEIGHT_MISMATCH') }, ask);
    if (!r.ok) throw new Error('expected a suggestion');
    expect(r.effect?.newProblems).toEqual([]);
    expect(r.effect?.grownProblems).toEqual(['Header outside the IRC table — engineer required (2 → 3)']);
    expect(r.structural).toBe(true);
  });

  it('pedido grande demais não vai para a IA (teto da conta)', async () => {
    const ask = vi.fn(async () => answer([]));
    const issue = issueOf('DOOR_RO_HEIGHT_MISMATCH');
    const huge = { ...issue, occurrences: [{ ...issue.occurrences[0]!, params: { blob: 'x'.repeat(250_000) } }] };
    expect(await suggestFix({ projectText, issue: huge }, ask)).toEqual({
      ok: false,
      message: 'This issue is too large to send to the AI.',
    });
    expect(ask).not.toHaveBeenCalled();
  });

  it('limite por usuário: 20 pedidos em 10 minutos; outro usuário e a janela seguinte passam', async () => {
    const ask = vi.fn(async () => answer([]));
    const issue = issueOf('DOOR_RO_HEIGHT_MISMATCH');
    let now = 1_000_000;
    const call = (userKey: string) => suggestFix({ projectText, issue }, ask, { userKey, now: () => now });
    for (let i = 0; i < 20; i += 1) expect((await call('limit-user-a')).ok).toBe(true);
    expect(await call('limit-user-a')).toEqual({
      ok: false,
      message: 'Too many AI suggestions in a short time. Try again in a few minutes.',
    });
    expect(ask).toHaveBeenCalledTimes(20);
    expect((await call('limit-user-b')).ok).toBe(true);
    now += 10 * 60 * 1000 + 1;
    expect((await call('limit-user-a')).ok).toBe(true);
  });

  it('cada chamada deixa no log o modelo e os tokens, sem o conteúdo; a falha da API deixa código e status', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await suggestFix({ projectText, issue: issueOf('DOOR_RO_HEIGHT_MISMATCH') }, async () => answer([]));
    expect(info).toHaveBeenCalledWith('[suggestFix]', {
      family: 'DOOR_RO_HEIGHT_MISMATCH',
      model: 'claude-opus-5-5',
      inputTokens: 1000,
      outputTokens: 100,
      edits: 0,
      rejected: 0,
    });
    await suggestFix({ projectText, issue: issueOf('DOOR_RO_HEIGHT_MISMATCH') }, async () =>
      Promise.reject(new SuggestError('API_ERROR', 'credit balance too low', 400)),
    );
    expect(warn).toHaveBeenCalledWith('[suggestFix] failed', { code: 'API_ERROR', status: 400 });
    info.mockRestore();
    warn.mockRestore();
  });
});
