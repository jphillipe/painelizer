'use client';

import { useEffect, type Dispatch } from 'react';
import type { EditorAction, EditorState } from '@/lib/editor/state';

/** Atalhos do editor: Delete/Backspace remove a seleção, Esc desseleciona, Ctrl+Z / Ctrl+Shift+Z (ou Ctrl+Y) undo/redo. */
export function useEditorShortcuts(state: EditorState, dispatch: Dispatch<EditorAction>, enabled: boolean): void {
  const sel = state.selection;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t !== null && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || t.closest('[role="combobox"], [role="listbox"], [role="dialog"]'))) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (e.key === 'Escape') {
        if (sel.kind !== 'none') dispatch({ type: 'select', selection: { kind: 'none' } });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel.kind === 'opening') {
          e.preventDefault();
          dispatch({ type: 'removeOpening', wallId: sel.wallId, openingId: sel.openingId });
        } else if (sel.kind === 'wall') {
          e.preventDefault();
          dispatch({ type: 'removeWall', wallId: sel.wallId });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, sel, dispatch]);
}
