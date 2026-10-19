'use client';

import { CircleCheckIcon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { Issue, IssueSource } from '@/lib/editor/problems';
import type { Selection } from '@/lib/editor/state';
import { cn } from '@/lib/utils';

export interface IssuesListProps {
  issues: readonly Issue[];
  /** A checagem do motor ainda não é desta versão do projeto. */
  stale: boolean;
  checking: boolean;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}

const SOURCE_LABEL: Record<IssueSource, string> = {
  draft: 'file',
  geometry: 'plan',
  parser: 'parser',
  engine: 'engine',
  extraction: 'reading',
  project: 'project',
};

/** Problemas e avisos do projeto, cada um clicável para selecionar a parede (ou a abertura) que cita. */
export function IssuesList({ issues, stale, checking, selection, onSelect }: IssuesListProps) {
  const problems = issues.filter((i) => i.severity === 'problem');
  const warnings = issues.filter((i) => i.severity === 'warning');
  if (issues.length === 0) {
    return (
      <Alert variant={checking ? 'default' : 'success'} aria-live="polite">
        <CircleCheckIcon />
        <AlertTitle>{checking ? 'Checking with the engine…' : 'No problems'}</AlertTitle>
        <AlertDescription>{checking ? 'Problems and warnings appear here.' : 'The engine builds this project as it is.'}</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className={cn('space-y-3', stale && 'opacity-70')} aria-live="polite" aria-busy={checking}>
      {problems.length > 0 ? (
        <Alert variant="destructive">
          <OctagonXIcon />
          <AlertTitle>
            {problems.length} problem{problems.length === 1 ? '' : 's'} — the project can’t be built yet
            {stale ? <span className="ml-2 font-normal text-ink-3">(rechecking…)</span> : null}
          </AlertTitle>
          <AlertDescription>
            <IssueRows issues={problems} selection={selection} onSelect={onSelect} />
          </AlertDescription>
        </Alert>
      ) : null}
      {warnings.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>
            {warnings.length} warning{warnings.length === 1 ? '' : 's'}
            {stale ? <span className="ml-2 font-normal text-ink-3">(rechecking…)</span> : null}
          </AlertTitle>
          <AlertDescription>
            <IssueRows issues={warnings} selection={selection} onSelect={onSelect} />
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function IssueRows({ issues, selection, onSelect }: { issues: readonly Issue[]; selection: Selection; onSelect: (s: Selection) => void }) {
  return (
    <ul className="mt-1 space-y-1">
      {issues.map((i, n) => {
        const target: Selection | undefined =
          i.wallId === undefined
            ? undefined
            : i.openingId === undefined
              ? { kind: 'wall', wallId: i.wallId }
              : { kind: 'opening', wallId: i.wallId, openingId: i.openingId };
        const selected =
          target !== undefined && selection.kind !== 'none' && selection.kind !== 'project' && selection.wallId === target.wallId &&
          (selection.kind === 'wall' || target.kind === 'wall' || selection.openingId === target.openingId);
        return (
          <li key={`${n}-${i.text}`} className="flex items-start gap-2">
            <Badge variant="outline" className="mt-0.5 shrink-0 font-mono text-[11px]" title={i.code}>
              {i.panelId ?? i.wallId ?? SOURCE_LABEL[i.source]}
            </Badge>
            {target === undefined ? (
              <span className="font-mono text-[13px]">{i.text}</span>
            ) : (
              <button
                type="button"
                onClick={() => onSelect(target)}
                className={cn('text-left font-mono text-[13px] underline-offset-2 hover:underline', selected && 'font-semibold')}
                aria-pressed={selected}
              >
                {i.text}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
