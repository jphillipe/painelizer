// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { draftFromText, type ProjectDraft } from '@/lib/editor/draft';
import { editorReducer, initialEditorState } from '@/lib/editor/state';
import type { CheckResult } from '@/types/panels';

// A action de verdade importa `server-only` e o motor; aqui só interessa o que o hook faz com as respostas.
vi.mock('../../_actions/check-project', () => ({ checkProject: {} }));
const executeAsync = vi.fn<(input: { projectText: string }) => Promise<{ data?: CheckResult; serverError?: string }>>();
vi.mock('next-safe-action/hooks', () => ({ useAction: () => ({ executeAsync }) }));

const { useProjectCheck, engineText } = await import('./use-project-check');

type Deferred = { resolve: (r: { data?: CheckResult; serverError?: string }) => void };
/** Cada chamada da action fica pendente até o teste resolver, na ordem que quiser. */
function pendingCalls(): Deferred[] {
  const calls: Deferred[] = [];
  executeAsync.mockImplementation(() => new Promise((resolve) => calls.push({ resolve })));
  return calls;
}

const ok = (n: number): CheckResult => ({ ok: true, projectName: `rev ${n}`, panels: [], warnings: [] });
const load = (text: string): ProjectDraft => {
  const r = draftFromText(text);
  if (!r.ok) throw new Error('should open');
  return r.draft;
};

beforeEach(() => {
  vi.useFakeTimers();
  executeAsync.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Debounce, descarte de resposta velha e "texto igual não vai" (S21 / M6 / M8) com o hook montado de verdade. */
describe('useProjectCheck (M10)', () => {
  it('espera o debounce, manda o texto do motor e aplica o resultado', async () => {
    const calls = pendingCalls();
    const draft = load(EXAMPLES[1]!.text);
    const { result } = renderHook(({ d, rev }: { d: ProjectDraft; rev: number }) => useProjectCheck(d, rev, 600), { initialProps: { d: draft, rev: 1 } });
    expect(result.current.status).toBe('checking');
    expect(result.current.stale).toBe(true);
    await act(async () => void vi.advanceTimersByTime(599));
    expect(executeAsync).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(1));
    expect(executeAsync).toHaveBeenCalledTimes(1);
    expect(executeAsync.mock.calls[0]![0].projectText).toContain('"walls"');
    await act(async () => calls[0]!.resolve({ data: ok(1) }));
    expect(result.current).toMatchObject({ status: 'done', revision: 1, stale: false });
    expect(result.current.result).toEqual(ok(1));
  });

  it('uma resposta mais antiga que a última aplicada é descartada', async () => {
    const calls = pendingCalls();
    const base = editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source: 'sample' });
    const edited = editorReducer(base, { type: 'updateWall', wallId: 'W01', patch: { exterior: false } });
    const { result, rerender } = renderHook(({ d, rev }: { d: ProjectDraft; rev: number }) => useProjectCheck(d, rev, 600), { initialProps: { d: base.draft!, rev: 1 } });
    await act(async () => void vi.advanceTimersByTime(600));
    rerender({ d: edited.draft!, rev: 2 });
    await act(async () => void vi.advanceTimersByTime(600));
    expect(executeAsync).toHaveBeenCalledTimes(2);
    // A revisão 2 responde primeiro; a 1 chega depois e não pode sobrescrever.
    await act(async () => calls[1]!.resolve({ data: ok(2) }));
    expect(result.current).toMatchObject({ status: 'done', revision: 2, stale: false });
    await act(async () => calls[0]!.resolve({ data: ok(1) }));
    expect(result.current.result).toEqual(ok(2));
    expect(result.current.revision).toBe(2);
  });

  it('revisão com o mesmo texto para o motor não vai ao servidor e deixa de ser stale', async () => {
    const calls = pendingCalls();
    const base = editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source: 'sample' });
    const reviewed = editorReducer(base, { type: 'setReviewed', wallId: 'W01', reviewed: true });
    const { result, rerender } = renderHook(({ d, rev }: { d: ProjectDraft; rev: number }) => useProjectCheck(d, rev, 600), { initialProps: { d: base.draft!, rev: 1 } });
    await act(async () => void vi.advanceTimersByTime(600));
    await act(async () => calls[0]!.resolve({ data: ok(1) }));
    rerender({ d: reviewed.draft!, rev: 2 });
    await act(async () => void vi.advanceTimersByTime(600));
    expect(executeAsync).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ status: 'done', revision: 2, stale: false });
  });

  it('edição dentro do debounce reinicia a espera: uma chamada só; erro do servidor vira status error', async () => {
    const calls = pendingCalls();
    const base = editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source: 'sample' });
    const edited = editorReducer(base, { type: 'updateWall', wallId: 'W01', patch: { exterior: false } });
    const { result, rerender } = renderHook(({ d, rev }: { d: ProjectDraft; rev: number }) => useProjectCheck(d, rev, 600), { initialProps: { d: base.draft!, rev: 1 } });
    await act(async () => void vi.advanceTimersByTime(300));
    rerender({ d: edited.draft!, rev: 2 });
    await act(async () => void vi.advanceTimersByTime(599));
    expect(executeAsync).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(1));
    expect(executeAsync).toHaveBeenCalledTimes(1);
    await act(async () => calls[0]!.resolve({ serverError: 'boom' }));
    expect(result.current).toMatchObject({ status: 'error', error: 'boom', revision: 2, stale: false });
  });
});

describe('engineText (M10)', () => {
  it('tira $underlay da raiz e $reviewed das paredes; sem chaves do editor, devolve o mesmo draft', () => {
    const base = editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source: 'sample' });
    const plain = engineText(base.draft!);
    expect(plain).not.toContain('"$');
    const reviewed = editorReducer(base, { type: 'setReviewed', wallId: 'W01', reviewed: true });
    expect(JSON.stringify(reviewed.draft)).toContain('"$reviewed"');
    expect(engineText(reviewed.draft!)).toBe(plain);
  });
});
