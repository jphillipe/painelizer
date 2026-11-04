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

  it('S30: Delete apaga as paredes selecionadas; Ctrl+D duplica; Ctrl+A seleciona todas; W e Esc ligam e desligam o desenho', () => {
    const dispatch = vi.fn();
    const onToggleDraw = vi.fn();
    const many = editorReducer(house(), { type: 'select', selection: { kind: 'walls', wallIds: ['W01', 'W03'] } });
    const { rerender } = renderHook(({ drawing }: { drawing: boolean }) => useEditorShortcuts(many, dispatch, true, { onToggleDraw, drawing }), { initialProps: { drawing: false } });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    fireEvent.keyDown(document.body, { key: 'd', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'a', metaKey: true });
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([
      { type: 'removeWalls', wallIds: ['W01', 'W03'] },
      { type: 'duplicateWalls', wallIds: ['W01', 'W03'] },
      { type: 'select', selection: { kind: 'walls', wallIds: ['W01', 'W02', 'W03', 'W04', 'W05'] } },
    ]);
    fireEvent.keyDown(document.body, { key: 'w' });
    expect(onToggleDraw).toHaveBeenCalledTimes(1);
    // Desenhando, Esc sai do modo e não desseleciona.
    dispatch.mockClear();
    rerender({ drawing: true });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onToggleDraw).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalled();
    // Tecla que a planta já tratou (preventDefault) não chega aqui.
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    e.preventDefault();
    document.body.dispatchEvent(e);
    expect(onToggleDraw).toHaveBeenCalledTimes(2);
  });

  it('S30: Ctrl+D sem parede selecionada fica com o navegador', () => {
    const dispatch = vi.fn();
    renderHook(() => useEditorShortcuts(house(), dispatch, true));
    const e = new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
