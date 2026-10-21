// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { editorReducer, initialEditorState, type EditorState } from '@/lib/editor/state';
import { useEditorShortcuts } from './use-editor-shortcuts';

afterEach(cleanup);

const house = (): EditorState => editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source: 'sample' });
const withWall = (wallId: string): EditorState => editorReducer(house(), { type: 'select', selection: { kind: 'wall', wallId } });

/** Atalhos como teclas de verdade num DOM (M10): o alvo do evento decide se Delete apaga. */
describe('useEditorShortcuts no DOM (M10)', () => {
  it('Delete com um botão em foco não apaga a parede; com o foco no body, apaga', () => {
    const dispatch = vi.fn();
    const state = withWall('W02');
    render(<button type="button">Remove</button>);
    renderHook(() => useEditorShortcuts(state, dispatch, true));
    const button = document.querySelector('button')!;
    button.focus();
    fireEvent.keyDown(button, { key: 'Delete' });
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeWall', wallId: 'W02' });
    // Backspace nunca apaga (M2).
    dispatch.mockClear();
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dentro de um input nenhum atalho vale', () => {
    const dispatch = vi.fn();
    render(<input aria-label="field" />);
    renderHook(() => useEditorShortcuts(withWall('W01'), dispatch, true));
    const input = document.querySelector('input')!;
    for (const key of ['Delete', 'n', ']', 'Escape']) fireEvent.keyDown(input, { key });
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Esc, N, O e ] / [ despacham as ações certas', () => {
    const dispatch = vi.fn();
    renderHook(() => useEditorShortcuts(withWall('W01'), dispatch, true));
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(document.body, { key: 'y', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.keyDown(document.body, { key: 'n' });
    fireEvent.keyDown(document.body, { key: 'o' });
    fireEvent.keyDown(document.body, { key: ']' });
    fireEvent.keyDown(document.body, { key: '[' });
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([
      { type: 'undo' },
      { type: 'redo' },
      { type: 'redo' },
      { type: 'select', selection: { kind: 'none' } },
      { type: 'addWall', afterWallId: 'W01' },
      { type: 'addOpening', wallId: 'W01' },
      { type: 'select', selection: { kind: 'wall', wallId: 'W02' } },
      { type: 'select', selection: { kind: 'wall', wallId: 'W05' } },
    ]);
  });

  it('? abre a ajuda; desligado, nada acontece; desmontar tira o listener', () => {
    const dispatch = vi.fn();
    const onHelp = vi.fn();
    const { rerender, unmount } = renderHook(({ enabled }: { enabled: boolean }) => useEditorShortcuts(withWall('W01'), dispatch, enabled, { onHelp }), { initialProps: { enabled: true } });
    fireEvent.keyDown(document.body, { key: '?' });
    expect(onHelp).toHaveBeenCalledTimes(1);
    rerender({ enabled: false });
    fireEvent.keyDown(document.body, { key: '?' });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(onHelp).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
    rerender({ enabled: true });
    unmount();
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
