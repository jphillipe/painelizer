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

/** Parede vizinha na ordem do arquivo (M5: `]` / `[`); sem seleção, a primeira / última. */
export function neighborWall(walls: readonly { id: string }[], current: string | undefined, delta: 1 | -1): string | undefined {
  if (walls.length === 0) return undefined;
  const i = current === undefined ? -1 : walls.findIndex((w) => w.id === current);
  if (i === -1) return (delta === 1 ? walls[0] : walls[walls.length - 1])?.id;
  return walls[(i + delta + walls.length) % walls.length]?.id;
}

export interface EditorShortcutHandlers {
  /** `?` */
  onHelp?: (() => void) | undefined;
}

/**
 * Atalhos do editor: Delete remove a seleção (foco na planta), Esc desseleciona, Ctrl+Z / Ctrl+Shift+Z (ou Ctrl+Y)
 * undo/redo; M5: N parede, O abertura, ] / [ próxima / anterior parede, ? atalhos. As setas são do canvas
 * (só com ele em foco).
 */
export function useEditorShortcuts(state: EditorState, dispatch: Dispatch<EditorAction>, enabled: boolean, handlers: EditorShortcutHandlers = {}): void {
  const sel = state.selection;
  const walls = state.draft?.walls;
  const { onHelp } = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if (inEditableContext(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const wallId = sel.kind === 'wall' || sel.kind === 'opening' ? sel.wallId : undefined;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (mod || e.altKey) {
        return;
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
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        dispatch(wallId === undefined ? { type: 'addWall' } : { type: 'addWall', afterWallId: wallId });
      } else if ((e.key === 'o' || e.key === 'O') && wallId !== undefined) {
        e.preventDefault();
        dispatch({ type: 'addOpening', wallId });
      } else if ((e.key === ']' || e.key === '[') && walls !== undefined) {
        e.preventDefault();
        const next = neighborWall(walls, wallId, e.key === ']' ? 1 : -1);
        if (next !== undefined) dispatch({ type: 'select', selection: { kind: 'wall', wallId: next } });
      } else if (e.key === '?' && onHelp !== undefined) {
        e.preventDefault();
        onHelp();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, sel, walls, dispatch, onHelp]);
}
