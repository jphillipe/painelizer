'use client';

import { CircleHelpIcon, CopyIcon, PenLineIcon, PlusIcon, Redo2Icon, SquarePlusIcon, Trash2Icon, Undo2Icon } from 'lucide-react';
import type { Dispatch, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { canRedo, canUndo, selectedWallIds, type EditorAction, type EditorState } from '@/lib/editor/state';
import { modKey } from '@/lib/platform';
import { cn } from '@/lib/utils';
import { removeSelection } from './use-editor-shortcuts';

export interface EditorToolbarProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** Abre a lista de atalhos (M5). */
  onHelp?: (() => void) | undefined;
  /** "Draw wall" (S30): ausente quando não há planta (projeto solto). */
  drawing?: boolean;
  onToggleDraw?: (() => void) | undefined;
}

/** Botão com dica e atalho (M5): abaixo de `sm` (ou sempre, com `iconOnly`), só o ícone — a dica diz o que é. */
function Tool({ label, tip, shortcut, icon, iconOnly = false, className, ...props }: { label: string; tip: ReactNode; shortcut?: string | undefined; icon: ReactNode; iconOnly?: boolean } & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} variant="ghost" size="xs" className={className} {...props}>
          {icon}
          <span className={iconOnly ? 'sr-only' : 'hidden sm:inline'}>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {tip}
        {shortcut !== undefined ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Barra do editor, na barra da planta (S21.4): adicionar / desenhar parede, abertura, duplicar e remover a seleção
 * (uma ou várias paredes), undo/redo, atalhos.
 */
export function EditorToolbar({ state, dispatch, onHelp, drawing = false, onToggleDraw }: EditorToolbarProps) {
  const sel = state.selection;
  const walls = selectedWallIds(sel);
  const wallId = sel.kind === 'wall' || sel.kind === 'opening' ? sel.wallId : undefined;
  const last = walls.at(-1);
  const mod = modKey();
  const removeLabel = sel.kind === 'opening' ? 'Remove opening' : sel.kind === 'walls' ? `Remove ${sel.wallIds.length} walls` : 'Remove wall';
  return (
    <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Editor">
      <Tool
        label="Add wall"
        icon={<PlusIcon />}
        tip={last === undefined ? 'New wall at the origin (or after the last one)' : `New wall continuing from the end of ${last}, turning left`}
        shortcut="N"
        onClick={() => dispatch({ type: 'addWall', afterWallId: last })}
      />
      {onToggleDraw !== undefined ? (
        <Tool
          label="Draw wall"
          icon={<PenLineIcon />}
          aria-pressed={drawing}
          className={cn(drawing && 'bg-selection/12 text-navy-900')}
          tip={drawing ? 'Drawing: click the start and the end on the plan; Esc to stop' : 'Draw walls on the plan with two clicks, snapping to ends and axes'}
          shortcut="W"
          onClick={onToggleDraw}
        />
      ) : null}
      <Tool label="Add opening" icon={<SquarePlusIcon />} disabled={wallId === undefined} tip={wallId === undefined ? 'Select one wall first' : `New opening at the center of ${wallId}`} shortcut="O" onClick={() => wallId !== undefined && dispatch({ type: 'addOpening', wallId })} />
      <Tool
        label="Duplicate"
        icon={<CopyIcon />}
        disabled={walls.length === 0 || sel.kind === 'opening'}
        tip={walls.length === 0 || sel.kind === 'opening' ? 'Select one or more walls first' : 'Copy the selected walls, 2′ off; the copies stay selected'}
        shortcut={`${mod}+D`}
        onClick={() => dispatch({ type: 'duplicateWalls', wallIds: walls })}
      />
      <Tool
        label={removeLabel}
        icon={<Trash2Icon />}
        disabled={walls.length === 0}
        tip={walls.length === 0 ? 'Select a wall or an opening first' : 'Remove the selection (Undo in the toast)'}
        shortcut="Delete"
        onClick={() => removeSelection(sel, dispatch)}
      />
      <span className="mx-1 h-4 w-px bg-line" aria-hidden />
      <Tool label="Undo" iconOnly icon={<Undo2Icon />} disabled={!canUndo(state)} tip="Undo" shortcut={`${mod}+Z`} onClick={() => dispatch({ type: 'undo' })} />
      <Tool label="Redo" iconOnly icon={<Redo2Icon />} disabled={!canRedo(state)} tip="Redo" shortcut={`${mod}+Shift+Z`} onClick={() => dispatch({ type: 'redo' })} />
      {onHelp !== undefined ? <Tool label="Keyboard shortcuts" iconOnly icon={<CircleHelpIcon />} tip="Keyboard shortcuts" shortcut="?" onClick={onHelp} /> : null}
    </div>
  );
}
