// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import type { ServerProject } from '@/lib/editor/project-sync';
import { editorReducer, initialEditorState, isReviewed, type EditorState } from '@/lib/editor/state';
import type { SaveResult } from '@/services/projects.service';

// A action de verdade importa `server-only` e o Supabase; aqui só interessa o que o hook faz com as respostas.
vi.mock('../_actions/save-project', () => ({ saveProjectAction: {} }));
type Input = { id: string; revision: number; name?: string; text: string };
const executeAsync = vi.fn<(input: Input) => Promise<{ data?: SaveResult; serverError?: string }>>();
vi.mock('next-safe-action/hooks', () => ({ useAction: () => ({ executeAsync }) }));

const { useProjectSync, SYNC_DELAY_MS } = await import('./use-project-sync');

const loaded = editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source: 'sample' });
// Alterna a marca de revisão da primeira parede: cada chamada é uma edição nova (a mesma marca duas vezes seria no-op).
const edited = (s: EditorState, wall = 0): EditorState => editorReducer(s, { type: 'setReviewed', wallId: s.draft!.walls[wall]!.id, reviewed: !isReviewed(s.draft!.walls[wall]!) });
const project: ServerProject = { id: 'p1', revision: 1, savedAt: '2026-11-03T10:00:00.000Z' };
const saved = (revision: number): { data: SaveResult } => ({ data: { ok: true, revision, savedAt: '2026-11-03T10:00:05.000Z' } });

beforeEach(() => {
  vi.useFakeTimers();
  executeAsync.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useProjectSync (S22.1)', () => {
  it('sem projeto no servidor fica "local" e nunca chama a action', () => {
    const hook = renderHook(({ s }: { s: EditorState }) => useProjectSync(s, undefined, undefined, () => {}), { initialProps: { s: loaded } });
    expect(hook.result.current.status).toEqual({ kind: 'local' });
    hook.rerender({ s: edited(loaded) });
    act(() => void vi.advanceTimersByTime(SYNC_DELAY_MS + 10));
    expect(executeAsync).not.toHaveBeenCalled();
  });

  it('carregar não grava; a primeira edição grava 500 ms depois com a revisão carregada e adota a nova', async () => {
    executeAsync.mockResolvedValueOnce(saved(2));
    const onProject = vi.fn();
    const hook = renderHook(({ s, p }: { s: EditorState; p: ServerProject }) => useProjectSync(s, undefined, p, onProject), { initialProps: { s: loaded, p: project } });
    expect(hook.result.current.status).toEqual({ kind: 'saved', at: Date.parse(project.savedAt) });
    act(() => void vi.advanceTimersByTime(SYNC_DELAY_MS + 10));
    expect(executeAsync).not.toHaveBeenCalled();

    hook.rerender({ s: edited(loaded), p: project });
    act(() => void vi.advanceTimersByTime(SYNC_DELAY_MS - 1));
    expect(executeAsync).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(2);
      await Promise.resolve();
    });
    expect(executeAsync).toHaveBeenCalledTimes(1);
    const sent = executeAsync.mock.calls[0]![0];
    expect(sent).toMatchObject({ id: 'p1', revision: 1 });
    expect(JSON.parse(sent.text)).toHaveProperty('walls');
    await act(async () => {
      await Promise.resolve();
    });
    expect(onProject).toHaveBeenCalledWith({ id: 'p1', revision: 2, savedAt: '2026-11-03T10:00:05.000Z' });
    expect(hook.result.current.status).toEqual({ kind: 'saved', at: Date.parse('2026-11-03T10:00:05.000Z') });
  });

  it('duas edições seguidas viram uma gravação (debounce); editar durante a gravação grava de novo depois', async () => {
    let resolveFirst: ((r: { data: SaveResult }) => void) | undefined;
    executeAsync.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    executeAsync.mockResolvedValueOnce(saved(3));
    const onProject = vi.fn();
    const hook = renderHook(({ s, p }: { s: EditorState; p: ServerProject }) => useProjectSync(s, undefined, p, onProject), { initialProps: { s: loaded, p: project } });
    const once = edited(loaded);
    hook.rerender({ s: once, p: project });
    act(() => void vi.advanceTimersByTime(200));
    const twice = edited(once, 1);
    hook.rerender({ s: twice, p: project });
    await act(async () => {
      vi.advanceTimersByTime(SYNC_DELAY_MS + 10);
      await Promise.resolve();
    });
    expect(executeAsync).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toEqual({ kind: 'saving' });

    // Edita enquanto a primeira gravação ainda não voltou.
    const thrice = edited(twice, 2);
    hook.rerender({ s: thrice, p: project });
    await act(async () => {
      resolveFirst!(saved(2));
      await Promise.resolve();
      await Promise.resolve();
    });
    // A revisão nova chega pelo onProject; o pai a devolve na prop e a gravação pendente sai com ela.
    expect(onProject).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }));
    hook.rerender({ s: thrice, p: { ...project, revision: 2 } });
    await act(async () => {
      vi.advanceTimersByTime(SYNC_DELAY_MS + 10);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(executeAsync).toHaveBeenCalledTimes(2);
    expect(executeAsync.mock.calls[1]![0]).toMatchObject({ id: 'p1', revision: 2 });
  });

  it('conflito para o auto-save até recarregar; erro deixa tentar de novo pelo retry', async () => {
    executeAsync.mockResolvedValueOnce({ data: { ok: false, reason: 'conflict', revision: 7, updatedAt: 'x', message: 'edited elsewhere' } });
    const hook = renderHook(({ s, p }: { s: EditorState; p: ServerProject }) => useProjectSync(s, undefined, p, () => {}), { initialProps: { s: loaded, p: project } });
    const once = edited(loaded);
    hook.rerender({ s: once, p: project });
    await act(async () => {
      vi.advanceTimersByTime(SYNC_DELAY_MS + 10);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(hook.result.current.status).toEqual({ kind: 'conflict', message: 'edited elsewhere', revision: 7 });
    hook.rerender({ s: edited(once), p: project });
    await act(async () => {
      vi.advanceTimersByTime(SYNC_DELAY_MS + 10);
      await Promise.resolve();
    });
    expect(executeAsync).toHaveBeenCalledTimes(1);

    executeAsync.mockReset();
    executeAsync.mockResolvedValueOnce({ serverError: 'Sign in to continue.' });
    executeAsync.mockResolvedValueOnce(saved(2));
    const other = renderHook(({ s, p }: { s: EditorState; p: ServerProject }) => useProjectSync(s, undefined, p, () => {}), { initialProps: { s: loaded, p: project } });
    other.rerender({ s: edited(loaded), p: project });
    await act(async () => {
      vi.advanceTimersByTime(SYNC_DELAY_MS + 10);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(other.result.current.status).toEqual({ kind: 'error', message: 'Sign in to continue.' });
    await act(async () => {
      other.result.current.retry();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(executeAsync).toHaveBeenCalledTimes(2);
    expect(other.result.current.status).toMatchObject({ kind: 'saved' });
  });
});

describe('useProjectSync — baseline é o texto (S22.1)', () => {
  it('projeto antes do draft (rota): o primeiro draft é a baseline e não grava; desfazer até o texto gravado também não', async () => {
    const hook = renderHook(({ s, p }: { s: EditorState; p: ServerProject }) => useProjectSync(s, undefined, p, () => {}), { initialProps: { s: initialEditorState, p: project } });
    hook.rerender({ s: loaded, p: project });
    await act(async () => {
      vi.advanceTimersByTime(SYNC_DELAY_MS + 10);
      await Promise.resolve();
    });
    expect(executeAsync).not.toHaveBeenCalled();
    // Edita e volta: o texto é o gravado, nada vai.
    const once = edited(loaded);
    hook.rerender({ s: once, p: project });
    hook.rerender({ s: edited(once), p: project });
    await act(async () => {
      vi.advanceTimersByTime(SYNC_DELAY_MS + 10);
      await Promise.resolve();
    });
    expect(executeAsync).not.toHaveBeenCalled();
  });

  it('reconverter a leitura muda o texto do arquivo e grava, mesmo sem edição no editor', async () => {
    executeAsync.mockResolvedValueOnce(saved(2));
    const reading = { ok: true, projectName: 'Lido', walls: [], model: 'm', report: 'a' } as unknown as Parameters<typeof useProjectSync>[1];
    const hook = renderHook(({ s, r }: { s: EditorState; r: typeof reading }) => useProjectSync(s, r, project, () => {}), { initialProps: { s: loaded, r: reading } });
    hook.rerender({ s: loaded, r: { ...reading, report: 'b' } as typeof reading });
    await act(async () => {
      vi.advanceTimersByTime(SYNC_DELAY_MS + 10);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(executeAsync).toHaveBeenCalledTimes(1);
    expect(executeAsync.mock.calls[0]![0].text).toContain('"report": "b"');
  });
});
