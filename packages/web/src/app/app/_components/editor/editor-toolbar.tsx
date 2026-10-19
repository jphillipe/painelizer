'use client';

import { PlusIcon, Redo2Icon, SettingsIcon, SquarePlusIcon, Trash2Icon, Undo2Icon } from 'lucide-react';
import type { Dispatch } from 'react';
import { Button } from '@/components/ui/button';
import { canRedo, canUndo, type EditorAction, type EditorState } from '@/lib/editor/state';

export interface EditorToolbarProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

/** Barra do editor: adicionar parede/abertura, remover a seleção, undo/redo, configurações do projeto. */
export function EditorToolbar({ state, dispatch }: EditorToolbarProps) {
  const sel = state.selection;
  const wallId = sel.kind === 'wall' || sel.kind === 'opening' ? sel.wallId : undefined;
  const remove = (): void => {
    if (sel.kind === 'opening') dispatch({ type: 'removeOpening', wallId: sel.wallId, openingId: sel.openingId });
    else if (sel.kind === 'wall') dispatch({ type: 'removeWall', wallId: sel.wallId });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-paper-2 px-3 py-2" role="toolbar" aria-label="Editor">
      <Button variant="outline" size="sm" onClick={() => dispatch(wallId === undefined ? { type: 'addWall' } : { type: 'addWall', afterWallId: wallId })}>
        <PlusIcon /> Add wall
      </Button>
      <Button variant="outline" size="sm" disabled={wallId === undefined} onClick={() => wallId !== undefined && dispatch({ type: 'addOpening', wallId })}>
        <SquarePlusIcon /> Add opening
      </Button>
      <Button variant="outline" size="sm" disabled={wallId === undefined} onClick={remove} title="Delete">
        <Trash2Icon /> Remove {sel.kind === 'opening' ? 'opening' : 'wall'}
      </Button>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <Button variant="ghost" size="sm" disabled={!canUndo(state)} onClick={() => dispatch({ type: 'undo' })} title="Ctrl+Z">
        <Undo2Icon /> Undo
      </Button>
      <Button variant="ghost" size="sm" disabled={!canRedo(state)} onClick={() => dispatch({ type: 'redo' })} title="Ctrl+Shift+Z">
        <Redo2Icon /> Redo
      </Button>
      <span className="ml-auto" />
      <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'select', selection: { kind: 'project' } })}>
        <SettingsIcon /> Project settings
      </Button>
    </div>
  );
}
