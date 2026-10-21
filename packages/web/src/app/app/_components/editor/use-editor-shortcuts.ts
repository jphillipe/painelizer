'use client';

import { useEffect, type Dispatch } from 'react';
import type { EditorAction, EditorState } from '@/lib/editor/state';

/**
 * Delete só apaga a seleção quando o foco está na planta ou em lugar nenhum (`body`): com um botão da lista,
 * da toolbar ou um `<summary>` em foco, a tecla faz o que a tecla faz. Backspace não apaga mais (M2: uma
 * parede sumia ao apertar Backspace com um botão em foco). Puro, para teste sem DOM.
 */
export function deleteAllowed(target: EventTarget | null): boolean {
  if (target === null) return true;
  const el = target as { tagName?: string; closest?: (selector: string) => Element | null };
  if (el.tagName === 'BODY') return true;
  return typeof el.closest === 'function' && el.closest('[data-plan-canvas]') !== null;
}

/** Alvo onde atalhos não valem: campos de texto, selects, listas e diálogos. */
export function inEditableContext(target: EventTarget | null): boolean {
  const t = target as (HTMLElement & { isContentEditable?: boolean }) | null;
  if (t === null || typeof t !== 'object') return false;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable === true) return true;
  return typeof t.closest === 'function' && t.closest('[role="combobox"], [role="listbox"], [role="dialog"]') !== null;
}

/** Atalhos do editor: Delete remove a seleção (foco na planta), Esc desseleciona, Ctrl+Z / Ctrl+Shift+Z (ou Ctrl+Y) undo/redo. */
export function useEditorShortcuts(state: EditorState, dispatch: Dispatch<EditorAction>, enabled: boolean): void {
  const sel = state.selection;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if (inEditableContext(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (e.key === 'Escape') {
        if (sel.kind !== 'none') dispatch({ type: 'select', selection: { kind: 'none' } });
      } else if (e.key === 'Delete' && deleteAllowed(e.target)) {
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
