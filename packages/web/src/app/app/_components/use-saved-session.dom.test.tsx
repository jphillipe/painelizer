// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { JOB_KEY, SESSION_KEY, sessionKey } from '@/lib/editor/persist';
import { editorReducer, initialEditorState, type EditorState } from '@/lib/editor/state';
import type { ExtractJob } from '@/types/extract';
import { SAVE_DELAY_MS, useSavedSession } from './use-saved-session';

const toast = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const house = (): EditorState => editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source: 'sample' });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  toast.warning.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Auto-save e retomada (M2) com o hook montado e o `localStorage` do jsdom (M10). */
describe('useSavedSession (M10)', () => {
  it('grava a sessão 500 ms depois da mudança; uma montagem nova oferece a retomada e resume devolve a sessão', () => {
    const onResume = vi.fn();
    const first = renderHook(({ s }: { s: EditorState }) => useSavedSession(s, undefined, undefined, onResume), { initialProps: { s: initialEditorState } });
    expect(first.result.current.saved).toBeUndefined();
    first.rerender({ s: house() });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    act(() => void vi.advanceTimersByTime(SAVE_DELAY_MS));
    const raw = localStorage.getItem(SESSION_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toMatchObject({ version: 1, source: 'sample', dirty: false });
    first.unmount();

    const second = renderHook(() => useSavedSession(initialEditorState, undefined, undefined, onResume));
    expect(second.result.current.saved?.name).toBe('Casa 28x40 (visão)');
    act(() => second.result.current.resume());
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume.mock.calls[0]![0].text).toContain('"walls"');
    expect(second.result.current.saved).toBeUndefined();
  });

  it('discard apaga a sessão gravada; "Start over" (reset) também', () => {
    const onResume = vi.fn();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), name: 'Old', text: EXAMPLES[1]!.text, source: 'file', dirty: true }));
    const hook = renderHook(({ s }: { s: EditorState }) => useSavedSession(s, undefined, undefined, onResume), { initialProps: { s: initialEditorState } });
    expect(hook.result.current.saved?.name).toBe('Old');
    act(() => hook.result.current.discard());
    expect(hook.result.current.saved).toBeUndefined();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();

    hook.rerender({ s: house() });
    act(() => void vi.advanceTimersByTime(SAVE_DELAY_MS));
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
    hook.rerender({ s: editorReducer(house(), { type: 'reset' }) });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('beforeunload grava o que esperava o debounce; um job sem id gravado vira aviso de leitura perdida', () => {
    const onResume = vi.fn();
    const hook = renderHook(({ s }: { s: EditorState }) => useSavedSession(s, undefined, undefined, onResume), { initialProps: { s: initialEditorState } });
    hook.rerender({ s: house() });
    window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
    hook.unmount();

    localStorage.setItem(JOB_KEY, JSON.stringify({ startedAt: Date.now() - 60_000, files: [{ name: 'a.pdf', size: 10 }] }));
    renderHook(() => useSavedSession(initialEditorState, undefined, undefined, onResume));
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(String(toast.warning.mock.calls[0]![0])).toContain('interrupted');
    expect(localStorage.getItem(JOB_KEY)).toBeNull();
  });
});

describe('useSavedSession (S23)', () => {
  it('A1: F5 durante a leitura — a montagem nova devolve o job com o jobId e resumed, sem aviso de leitura perdida', () => {
    const onResume = vi.fn();
    const job: ExtractJob = { jobId: 'job-42', startedAt: Date.now() - 3 * 60_000, files: [{ name: 'A-100.pdf', size: 1234 }] };
    const before = renderHook(() => useSavedSession(initialEditorState, undefined, job, onResume, { onResumeJob: vi.fn() }));
    expect(JSON.parse(localStorage.getItem(JOB_KEY)!)).toMatchObject({ jobId: 'job-42' });
    before.unmount();

    const onResumeJob = vi.fn();
    renderHook(() => useSavedSession(initialEditorState, undefined, undefined, onResume, { onResumeJob }));
    expect(onResumeJob).toHaveBeenCalledTimes(1);
    expect(onResumeJob.mock.calls[0]![0]).toEqual({ ...job, resumed: true });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('A6: cada projeto grava na sua chave; o que ganhou id deixa a chave "só no navegador"; Start over apaga só a dele', () => {
    const onResume = vi.fn();
    type P = { s: EditorState; project?: { id: string; revision: number }; generation: number };
    localStorage.setItem(sessionKey('other'), JSON.stringify({ version: 1, savedAt: Date.now() - 60_000, name: 'Other', text: EXAMPLES[0]!.text, source: 'file', dirty: true, project: { id: 'other', revision: 2 } }));
    const hook = renderHook(({ s, project, generation }: P) => useSavedSession(s, undefined, undefined, onResume, { project, generation }), { initialProps: { s: initialEditorState, generation: 0 } as P });
    expect(hook.result.current.saved?.name).toBe('Other');

    const opened = house();
    hook.rerender({ s: opened, generation: 1 });
    act(() => void vi.advanceTimersByTime(SAVE_DELAY_MS));
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
    // Criado no servidor: mesma geração, a sessão passa para a chave do id.
    hook.rerender({ s: opened, project: { id: 'p1', revision: 1 }, generation: 1 });
    act(() => void vi.advanceTimersByTime(SAVE_DELAY_MS));
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(sessionKey('p1'))!)).toMatchObject({ project: { id: 'p1', revision: 1 } });
    expect(localStorage.getItem(sessionKey('other'))).not.toBeNull();

    hook.rerender({ s: editorReducer(opened, { type: 'reset' }), generation: 2 });
    expect(localStorage.getItem(sessionKey('p1'))).toBeNull();
    expect(localStorage.getItem(sessionKey('other'))).not.toBeNull();
  });

  it('desmontar (error boundary) grava o que esperava o debounce', () => {
    const hook = renderHook(({ s }: { s: EditorState }) => useSavedSession(s, undefined, undefined, vi.fn()), { initialProps: { s: initialEditorState } });
    hook.rerender({ s: house() });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    hook.unmount();
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
  });
});
