'use client';

import { ChevronRightIcon } from 'lucide-react';
import type { Dispatch } from 'react';
import { Button } from '@/components/ui/button';
import { openingById, wallById, type ProjectDraft } from '@/lib/editor/draft';
import type { Issue } from '@/lib/editor/problems';
import type { WallProvenance } from '@/lib/editor/provenance';
import type { EditorAction, EditorState, Selection } from '@/lib/editor/state';
import { cn } from '@/lib/utils';
import type { ExtractOutcome } from '@/types/extract';
import { OpeningProperties } from './opening-properties';
import { ProjectProperties } from './project-properties';
import { WallProperties } from './wall-properties';

export interface InspectorProps {
  state: EditorState;
  draft: ProjectDraft;
  dispatch: Dispatch<EditorAction>;
  provenance: ReadonlyMap<string, WallProvenance>;
  issues: readonly Issue[];
  outcome: Extract<ExtractOutcome, { ok: true }> | undefined;
  onOutcome: (outcome: ExtractOutcome) => void;
  showProjectData: boolean;
  /**
   * Workspace (S21.4): sem moldura (o painel já é a moldura) e as configurações do projeto vivem num dialog —
   * a seleção `project` mostra o estado vazio aqui.
   */
  flat?: boolean;
}

/** Painel de propriedades: muda com a seleção (projeto, parede, abertura). Remonta por id para zerar campos. */
export function Inspector({ state, draft, dispatch, provenance, issues, outcome, onOutcome, showProjectData, flat = false }: InspectorProps) {
  const sel = state.selection;
  const select = (selection: Selection): void => dispatch({ type: 'select', selection });
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
      {sel.kind === 'opening' ? (
        <>
          <ChevronRightIcon className="size-3.5" />
          <span className="font-mono text-ink">{sel.openingId}</span>
        </>
      ) : null}
    </nav>
  );

  let body: React.ReactNode;
  if (sel.kind === 'none' || (sel.kind === 'project' && flat)) {
    body = (
      <div className="space-y-3 text-[13px] text-ink-3">
        <p>{flat ? 'Pick a wall on the plan or in the list to edit it.' : 'Select a wall in the list to edit it, or open the project settings.'}</p>
        <Button variant="outline" size="sm" onClick={() => select({ kind: 'project' })}>
          Project settings
        </Button>
      </div>
    );
  } else if (sel.kind === 'project') {
    body = <ProjectProperties draft={draft} dispatch={dispatch} outcome={outcome} dirty={state.dirty} onOutcome={onOutcome} showProjectData={showProjectData} />;
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
          provenance={provenance.get(wall.id)}
          issues={issues.filter((i) => i.wallId === wall.id && i.openingId === undefined)}
          dispatch={dispatch}
          onSelect={select}
          collapsible={flat}
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
            collapsible={flat}
          />
        );
    }
  }

  return (
    <div className={cn('space-y-4', flat ? 'p-4' : 'rounded-md border bg-card p-4 shadow-1')} aria-label="Properties">
      {crumb}
      {body}
    </div>
  );
}
