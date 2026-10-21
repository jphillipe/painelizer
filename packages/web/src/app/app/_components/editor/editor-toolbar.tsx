'use client';

import { CircleHelpIcon, PlusIcon, Redo2Icon, SettingsIcon, SquarePlusIcon, Trash2Icon, Undo2Icon } from 'lucide-react';
import type { Dispatch, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { canRedo, canUndo, type EditorAction, type EditorState } from '@/lib/editor/state';
import { modKey } from '@/lib/platform';
import { cn } from '@/lib/utils';

export interface EditorToolbarProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** Dentro da barra da planta (S21.4): sem moldura nem "Project settings" (fica no menu da top bar). */
  embedded?: boolean;
  /** Abre a lista de atalhos (M5). */
  onHelp?: (() => void) | undefined;
}

/** Botão com dica e atalho (M5): abaixo de `sm`, só o ícone (a dica continua dizendo o que é). */
function Tool({ label, tip, shortcut, icon, iconOnly = false, className, ...props }: { label: string; tip: ReactNode; shortcut?: string | undefined; icon: ReactNode; iconOnly?: boolean } & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} className={className} {...props}>
          {icon}
          <span className={cn(iconOnly && 'hidden sm:inline')}>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {tip}
        {shortcut !== undefined ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** Barra do editor: adicionar parede/abertura, remover a seleção, undo/redo, atalhos (e configurações do projeto fora do workspace). */
export function EditorToolbar({ state, dispatch, embedded = false, onHelp }: EditorToolbarProps) {
  const sel = state.selection;
  const wallId = sel.kind === 'wall' || sel.kind === 'opening' ? sel.wallId : undefined;
  const remove = (): void => {
    if (sel.kind === 'opening') dispatch({ type: 'removeOpening', wallId: sel.wallId, openingId: sel.openingId });
    else if (sel.kind === 'wall') dispatch({ type: 'removeWall', wallId: sel.wallId });
  };
  const size = embedded ? 'xs' : 'sm';
  const variant = embedded ? 'ghost' : 'outline';
  const mod = modKey();
  return (
    <div className={cn('flex flex-wrap items-center gap-1', !embedded && 'gap-2 rounded-md border bg-paper-2 px-3 py-2')} role="toolbar" aria-label="Editor">
      <Tool
        label="Add wall"
        icon={<PlusIcon />}
        iconOnly={embedded}
        variant={variant}
        size={size}
        tip={wallId === undefined ? 'New wall at the origin (or after the last one)' : `New wall continuing from the end of ${wallId}, turning left`}
        shortcut="N"
        onClick={() => dispatch(wallId === undefined ? { type: 'addWall' } : { type: 'addWall', afterWallId: wallId })}
      />
      <Tool
        label="Add opening"
        icon={<SquarePlusIcon />}
        iconOnly={embedded}
        variant={variant}
        size={size}
        disabled={wallId === undefined}
        tip={wallId === undefined ? 'Select a wall first' : `New opening at the center of ${wallId}`}
        shortcut="O"
        onClick={() => wallId !== undefined && dispatch({ type: 'addOpening', wallId })}
      />
      <Tool
        label={`Remove ${sel.kind === 'opening' ? 'opening' : 'wall'}`}
        icon={<Trash2Icon />}
        iconOnly={embedded}
        variant={variant}
        size={size}
        disabled={wallId === undefined}
        tip={wallId === undefined ? 'Select a wall or an opening first' : 'Remove the selection (Undo in the toast)'}
        shortcut="Delete"
        onClick={remove}
      />
      <span className="mx-1 h-4 w-px bg-line" aria-hidden />
      <Tool label="Undo" icon={<Undo2Icon />} iconOnly variant="ghost" size={size} disabled={!canUndo(state)} tip="Undo" shortcut={`${mod}+Z`} onClick={() => dispatch({ type: 'undo' })} className={embedded ? '' : 'sm:[&>span]:inline'} />
      <Tool label="Redo" icon={<Redo2Icon />} iconOnly variant="ghost" size={size} disabled={!canRedo(state)} tip="Redo" shortcut={`${mod}+Shift+Z`} onClick={() => dispatch({ type: 'redo' })} />
      {onHelp !== undefined ? <Tool label="Keyboard shortcuts" icon={<CircleHelpIcon />} iconOnly variant="ghost" size={size} tip="Keyboard shortcuts" shortcut="?" onClick={onHelp} /> : null}
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
