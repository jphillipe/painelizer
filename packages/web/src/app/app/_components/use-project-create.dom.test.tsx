// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { projectFileText } from '@/lib/editor/project-file';
import { editorReducer, initialEditorState, type EditorState } from '@/lib/editor/state';
import type { CreateResult } from '@/services/projects.service';

// A action de verdade importa `server-only` e o Supabase; aqui só interessa o que o hook faz com as respostas.
vi.mock('../_actions/create-project', () => ({ createProjectAction: {} }));
type Input = { name?: string; text: string };
const executeAsync = vi.fn<(input: Input) => Promise<{ data?: CreateResult; serverError?: string }>>();
vi.mock('next-safe-action/hooks', () => ({ useAction: () => ({ executeAsync }) }));
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const { useProjectCreate } = await import('./use-project-create');

const loaded = (source: 'sample' | 'file' = 'file'): EditorState => editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source });
const created = (id: string): { data: CreateResult } => ({ data: { ok: true, id, revision: 1, savedAt: '2026-11-04T10:00:00.000Z' } });
const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  executeAsync.mockReset();
  toast.error.mockReset();
});
afterEach(cleanup);

describe('useProjectCreate (S23)', () => {
  it('A2: manda o .panelizer.json do draft carregado e devolve esse texto como baseline', async () => {
    executeAsync.mockResolvedValueOnce(created('p1'));
    const onCreated = vi.fn();
    const s = loaded();
    const hook = renderHook(({ e }: { e: EditorState }) => useProjectCreate(e, undefined, onCreated), { initialProps: { e: initialEditorState } });
    act(() => hook.result.current.opened('now'));
    hook.rerender({ e: s });
    await settle();
    expect(executeAsync).toHaveBeenCalledTimes(1);
    const sent = executeAsync.mock.calls[0]![0].text;
    expect(sent).toBe(projectFileText(s.draft!, undefined));
    expect(onCreated).toHaveBeenCalledWith({ id: 'p1', revision: 1, savedAt: '2026-11-04T10:00:00.000Z', text: sent }, undefined);
  });

  it('A3: "Start over" com a criação em voo — a resposta chega e é ignorada', async () => {
    let resolve: ((r: { data: CreateResult }) => void) | undefined;
    executeAsync.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const onCreated = vi.fn();
    const hook = renderHook(({ e }: { e: EditorState }) => useProjectCreate(e, undefined, onCreated), { initialProps: { e: initialEditorState } });
    act(() => hook.result.current.opened('now'));
    hook.rerender({ e: loaded() });
    await settle();
    expect(executeAsync).toHaveBeenCalledTimes(1);
    const before = hook.result.current.generation;
    act(() => hook.result.current.cancel());
    hook.rerender({ e: editorReducer(loaded(), { type: 'reset' }) });
    expect(hook.result.current.generation).toBe(before + 1);
    resolve!(created('abandoned'));
    await settle();
    expect(onCreated).not.toHaveBeenCalled();
    expect(executeAsync).toHaveBeenCalledTimes(1);
  });

  it('A6: sample não cria ao abrir; cria na primeira edição, com a edição dentro', async () => {
    executeAsync.mockResolvedValueOnce(created('s1'));
    const onCreated = vi.fn();
    const s = loaded('sample');
    const hook = renderHook(({ e }: { e: EditorState }) => useProjectCreate(e, undefined, onCreated), { initialProps: { e: initialEditorState } });
    act(() => hook.result.current.opened('on-edit'));
    hook.rerender({ e: s });
    await settle();
    expect(executeAsync).not.toHaveBeenCalled();
    const edited = editorReducer(s, { type: 'removeWall', wallId: s.draft!.walls[0]!.id });
    hook.rerender({ e: edited });
    await settle();
    expect(executeAsync).toHaveBeenCalledTimes(1);
    expect(executeAsync.mock.calls[0]![0].text).toBe(projectFileText(edited.draft!, undefined));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('A4: "Save as copy" cria já, com o nome da cópia; projeto que já tem id não cria', async () => {
    executeAsync.mockResolvedValueOnce(created('c1'));
    const onCreated = vi.fn();
    const s = loaded();
    const hook = renderHook(({ e }: { e: EditorState }) => useProjectCreate(e, undefined, onCreated), { initialProps: { e: s } });
    act(() => hook.result.current.opened(undefined));
    await settle();
    expect(executeAsync).not.toHaveBeenCalled();
    act(() => hook.result.current.copy('Copy of Casa'));
    await settle();
    expect(executeAsync.mock.calls[0]![0]).toMatchObject({ name: 'Copy of Casa' });
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), 'Copy of Casa');
  });
});
