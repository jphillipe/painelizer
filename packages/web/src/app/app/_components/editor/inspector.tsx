'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { openingById, wallById } from '@/lib/editor/draft';
import type { Selection } from '@/lib/editor/state';
import { useEditor } from './editor-context';
import { OpeningProperties } from './opening-properties';
import { neighborWall } from './use-editor-shortcuts';
import { WallProperties } from './wall-properties';
import { WallsProperties } from './walls-properties';

/**
 * Painel de propriedades do workspace: muda com a seleção (parede, várias paredes, abertura); as configurações do
 * projeto vivem num dialog, então "projeto" e "nada" mostram o estado vazio. Remonta por id para zerar campos.
 */
export function Inspector() {
  const { state, draft, dispatch, breaks, provenance, issues } = useEditor();
  const sel = state.selection;
  const select = (selection: Selection): void => dispatch({ type: 'select', selection });
  const currentWall = sel.kind === 'wall' || sel.kind === 'opening' ? sel.wallId : undefined;
  const go = (delta: 1 | -1): void => {
    const next = neighborWall(draft.walls, currentWall, delta);
    if (next !== undefined) select({ kind: 'wall', wallId: next });
  };
  // Anterior / próxima parede (M5): revisar 28 paredes em sequência sem voltar à lista.
  const stepper =
    draft.walls.length > 1 ? (
      <span className="ml-auto flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Previous wall" onClick={() => go(-1)}>
              <ChevronLeftIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Previous wall<Kbd>[</Kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Next wall" onClick={() => go(1)}>
              <ChevronRightIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Next wall<Kbd>]</Kbd>
          </TooltipContent>
        </Tooltip>
      </span>
    ) : null;
  const crumb = (
    <nav className="flex flex-wrap items-center gap-1 text-[13px] text-ink-3" aria-label="Selection">
      <Button variant="link" size="xs" className="h-auto max-w-full px-0 text-[13px]" onClick={() => select({ kind: 'project' })}>
        <span className="truncate">{draft.name ?? 'Project'}</span>
      </Button>
      {sel.kind === 'wall' || sel.kind === 'opening' ? (
        <>
          <ChevronRightIcon className="size-3.5" />
          <Button variant="link" size="xs" className="h-auto px-0 font-mono text-[13px]" onClick={() => select({ kind: 'wall', wallId: sel.wallId })}>
            {sel.wallId}
          </Button>
        </>
      ) : null}
      {sel.kind === 'walls' ? (
        <>
          <ChevronRightIcon className="size-3.5" />
          <span className="text-ink">{sel.wallIds.length} walls</span>
        </>
      ) : null}
      {sel.kind === 'opening' ? (
        <>
          <ChevronRightIcon className="size-3.5" />
          <span className="font-mono text-ink">{sel.openingId}</span>
        </>
      ) : null}
      {stepper}
    </nav>
  );

  let body: React.ReactNode;
  if (sel.kind === 'none' || sel.kind === 'project') {
    body = (
      <div className="space-y-3 text-[13px] text-ink-3">
        <p>Pick a wall on the plan or in the list to edit it. Shift+click adds walls to the selection.</p>
        <Button variant="outline" size="sm" onClick={() => select({ kind: 'project' })}>
          Project settings
        </Button>
      </div>
    );
  } else if (sel.kind === 'walls') {
    body = <WallsProperties draft={draft} wallIds={sel.wallIds} dispatch={dispatch} onSelect={select} />;
  } else {
    const wall = wallById(draft, sel.wallId);
    if (wall === undefined) {
      body = <p className="text-[13px] text-ink-3">This wall no longer exists.</p>;
    } else if (sel.kind === 'wall') {
      body = (
        <WallProperties
          key={wall.id}
          draft={draft}
          wall={wall}
          breaks={breaks.get(wall.id)}
          provenance={provenance.get(wall.id)}
          issues={issues.filter((i) => i.wallId === wall.id && i.openingId === undefined)}
          dispatch={dispatch}
          onSelect={select}
        />
      );
    } else {
      const opening = openingById(draft, sel.wallId, sel.openingId);
      body =
        opening === undefined ? (
          <p className="text-[13px] text-ink-3">This opening no longer exists.</p>
        ) : (
          <OpeningProperties
            key={`${wall.id}/${opening.id}`}
            draft={draft}
            wall={wall}
            opening={opening}
            provenance={provenance.get(wall.id)?.openings.get(opening.id)}
            issues={issues.filter((i) => i.wallId === wall.id && i.openingId === opening.id)}
            dispatch={dispatch}
          />
        );
    }
  }

  // Troca de item (M4): o conteúdo entra em fade curto; a chave muda com a seleção, não com cada edição.
  const bodyKey = sel.kind === 'wall' ? `wall:${sel.wallId}` : sel.kind === 'walls' ? `walls:${sel.wallIds.join(',')}` : sel.kind === 'opening' ? `opening:${sel.wallId}/${sel.openingId}` : sel.kind;
  return (
    <div className="space-y-4 p-4" aria-label="Properties">
      {crumb}
      <div key={bodyKey} className="animate-fade-in">
        {body}
      </div>
    </div>
  );
}
