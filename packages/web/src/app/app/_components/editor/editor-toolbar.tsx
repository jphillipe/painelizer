'use client';

import { PlusIcon, Redo2Icon, SettingsIcon, SquarePlusIcon, Trash2Icon, Undo2Icon } from 'lucide-react';
import type { Dispatch } from 'react';
import { Button } from '@/components/ui/button';
import { canRedo, canUndo, type EditorAction, type EditorState } from '@/lib/editor/state';
import { cn } from '@/lib/utils';

export interface EditorToolbarProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** Dentro da barra da planta (S21.4): sem moldura nem "Project settings" (fica no menu da top bar). */
  embedded?: boolean;
}

/** Barra do editor: adicionar parede/abertura, remover a seleção, undo/redo (e configurações do projeto fora do workspace). */
export function EditorToolbar({ state, dispatch, embedded = false }: EditorToolbarProps) {
  const sel = state.selection;
  const wallId = sel.kind === 'wall' || sel.kind === 'opening' ? sel.wallId : undefined;
  const remove = (): void => {
    if (sel.kind === 'opening') dispatch({ type: 'removeOpening', wallId: sel.wallId, openingId: sel.openingId });
    else if (sel.kind === 'wall') dispatch({ type: 'removeWall', wallId: sel.wallId });
  };
  const size = embedded ? 'xs' : 'sm';
  return (
    <div className={cn('flex flex-wrap items-center gap-1', !embedded && 'gap-2 rounded-md border bg-paper-2 px-3 py-2')} role="toolbar" aria-label="Editor">
      <Button variant={embedded ? 'ghost' : 'outline'} size={size} onClick={() => dispatch(wallId === undefined ? { type: 'addWall' } : { type: 'addWall', afterWallId: wallId })}>
        <PlusIcon /> Add wall
      </Button>
      <Button variant={embedded ? 'ghost' : 'outline'} size={size} disabled={wallId === undefined} onClick={() => wallId !== undefined && dispatch({ type: 'addOpening', wallId })}>
        <SquarePlusIcon /> Add opening
      </Button>
      <Button variant={embedded ? 'ghost' : 'outline'} size={size} disabled={wallId === undefined} onClick={remove} title="Delete">
        <Trash2Icon /> Remove {sel.kind === 'opening' ? 'opening' : 'wall'}
      </Button>
      <span className="mx-1 h-4 w-px bg-line" aria-hidden />
      <Button variant="ghost" size={size} disabled={!canUndo(state)} onClick={() => dispatch({ type: 'undo' })} title="Ctrl+Z" aria-label="Undo">
        <Undo2Icon /> {embedded ? null : 'Undo'}
      </Button>
      <Button variant="ghost" size={size} disabled={!canRedo(state)} onClick={() => dispatch({ type: 'redo' })} title="Ctrl+Shift+Z" aria-label="Redo">
        <Redo2Icon /> {embedded ? null : 'Redo'}
      </Button>
      {embedded ? null : (
        <>
          <span className="ml-auto" />
          <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'select', selection: { kind: 'project' } })}>
            <SettingsIcon /> Project settings
          </Button>
        </>
      )}
    </div>
  );
}
