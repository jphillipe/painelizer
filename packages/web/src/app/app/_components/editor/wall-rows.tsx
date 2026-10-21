'use client';

import { useState } from 'react';
import { isPlanWall, type DraftOpening, type DraftWall, type ProjectDraft } from '@/lib/editor/draft';
import { formatMeasure } from '@/lib/editor/measure';
import type { Issue } from '@/lib/editor/problems';
import { confidenceTone, type WallProvenance } from '@/lib/editor/provenance';
import type { Selection } from '@/lib/editor/state';
import { countByFilter, filterWalls, type WallFilter } from '@/lib/editor/wall-filters';
import { cn } from '@/lib/utils';

export interface WallRowsProps {
  draft: ProjectDraft;
  selection: Selection;
  provenance: ReadonlyMap<string, WallProvenance>;
  issuesByWall: ReadonlyMap<string | undefined, Issue[]>;
  onSelect: (selection: Selection) => void;
}

const FILTERS: { id: WallFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'lowConfidence', label: 'Low confidence' },
];

const TONE_DOT = { success: 'bg-success', warning: 'bg-warning', destructive: 'bg-destructive' } as const;

function wallLength(w: DraftWall): number | undefined {
  if (!isPlanWall(w)) return w.length;
  if (w.start === undefined || w.end === undefined) return undefined;
  return Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
}

function role(w: DraftWall): string {
  const pos = w.exterior === undefined ? '?' : w.exterior ? 'ext' : 'int';
  const load = w.bearing === undefined ? '?' : w.bearing ? 'bearing' : 'non-bearing';
  return `${pos} · ${load}`;
}

function openingLabel(o: DraftOpening): string {
  const where = o.center !== undefined ? `@ ${formatMeasure(o.center)}` : o.offset !== undefined ? `edge ${formatMeasure(o.offset)}` : 'no position';
  return `${o.tag ?? o.type ?? '?'} ${where}`;
}

/**
 * Lista compacta de paredes do workspace (S21.4): uma linha por parede com papel, comprimento, pontos de issue e
 * de confiança; filtros em chips; a parede selecionada expande as aberturas. Selecionar centraliza a planta
 * (quem decide é o `Workspace`, pelo handle do canvas).
 */
export function WallRows({ draft, selection, provenance, issuesByWall, onSelect }: WallRowsProps) {
  const [filter, setFilter] = useState<WallFilter>('all');
  const hasProvenance = provenance.size > 0;
  const counts = countByFilter(draft.walls, issuesByWall, provenance);
  const walls = filterWalls(draft.walls, filter, issuesByWall, provenance);
  const selectedWall = selection.kind === 'wall' || selection.kind === 'opening' ? selection.wallId : undefined;
  const selectedOpening = selection.kind === 'opening' ? selection.openingId : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap gap-1 px-3 py-2" role="group" aria-label="Filter walls">
        {FILTERS.filter((f) => f.id !== 'lowConfidence' || hasProvenance).map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-pill border px-2 py-0.5 text-[12px] font-semibold transition-colors duration-200',
              filter === f.id ? 'border-navy-900 bg-navy-900 text-paper' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink',
            )}
          >
            {f.label} <span className={cn('font-mono font-medium', filter === f.id ? 'text-paper/70' : 'text-ink-3')}>{counts[f.id]}</span>
          </button>
        ))}
      </div>
      {hasProvenance ? (
        <p className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-faint px-3 py-1.5 text-[12px] text-ink-2" aria-label="Legend">
          <span className="font-semibold">AI confidence</span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-success" /> read from a dimension
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-warning" /> worked out, check
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-destructive" /> guessed, verify on the drawing
          </span>
        </p>
      ) : null}
      {walls.length === 0 ? (
        <p className="px-3 py-6 text-center text-[13px] text-ink-3">{draft.walls.length === 0 ? 'No walls yet. Add one with the toolbar.' : 'Nothing here with this filter.'}</p>
      ) : (
        <ul className="workspace-pane flex-1 divide-y divide-line-faint" aria-label="Walls">
          {walls.map((w) => {
            const p = provenance.get(w.id);
            const issues = issuesByWall.get(w.id) ?? [];
            const problems = issues.filter((x) => x.severity === 'problem').length;
            const warnings = issues.length - problems;
            const selected = selectedWall === w.id;
            const length = wallLength(w);
            return (
              <li key={w.id} className={cn('border-l-2 border-transparent transition-colors duration-200', selected && 'border-selection bg-selection/8')}>
                <button
                  type="button"
                  onClick={() => onSelect({ kind: 'wall', wallId: w.id })}
                  aria-pressed={selected}
                  className={cn('grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 px-3 py-2 text-left transition-colors duration-200 hover:bg-paper-2', selected && 'hover:bg-selection/12')}
                >
                  <span className={cn('font-mono text-[13px] font-semibold', selected && 'text-navy-900')}>{w.id}</span>
                  <span className="min-w-0 truncate text-[12px] text-ink-3">
                    {role(w)}
                    {w.section !== undefined ? ` · ${w.section}` : ''}
                    {w.openings.length > 0 ? ` · ${w.openings.length} op.` : ''}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[12px] text-ink-2">{length === undefined ? '—' : formatMeasure(length)}</span>
                    {problems > 0 ? <Dot tone="destructive" title={`${problems} problem${problems === 1 ? '' : 's'}`} count={problems} /> : null}
                    {warnings > 0 ? <Dot tone="warning" title={`${warnings} warning${warnings === 1 ? '' : 's'}`} count={warnings} /> : null}
                    {hasProvenance ? (
                      p === undefined ? (
                        <span className="inline-block size-2 rounded-full border border-line" title="Not in the AI reading" />
                      ) : (
                        <span className={cn('inline-block size-2 rounded-full', TONE_DOT[confidenceTone(p.confidence)])} title={`AI confidence ${p.confidence.toFixed(2)}`} />
                      )
                    ) : null}
                  </span>
                </button>
                {selected && w.openings.length > 0 ? (
                  <ul className="pb-2 pl-7 pr-3" aria-label={`Openings of ${w.id}`}>
                    {w.openings.map((o) => {
                      const oIssues = issues.filter((i) => i.openingId === o.id);
                      const oProblem = oIssues.some((i) => i.severity === 'problem');
                      const op = p?.openings.get(o.id);
                      return (
                        <li key={o.id}>
                          <button
                            type="button"
                            onClick={() => onSelect({ kind: 'opening', wallId: w.id, openingId: o.id })}
                            aria-pressed={selectedOpening === o.id}
                            className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[12px] transition-colors duration-200 hover:bg-paper-2', selectedOpening === o.id && 'bg-card font-semibold text-navy-900')}
                          >
                            <span className="font-mono">{o.id}</span>
                            <span className="min-w-0 flex-1 truncate text-ink-3">{openingLabel(o)}</span>
                            {oIssues.length > 0 ? <Dot tone={oProblem ? 'destructive' : 'warning'} title={`${oIssues.length} issue${oIssues.length === 1 ? '' : 's'}`} count={oIssues.length} /> : null}
                            {op !== undefined ? <span className={cn('inline-block size-2 rounded-full', TONE_DOT[confidenceTone(op.confidence)])} title={`AI confidence ${op.confidence.toFixed(2)}`} /> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Dot({ tone, title, count }: { tone: 'destructive' | 'warning'; title: string; count: number }) {
  return (
    <span className={cn('inline-flex h-4 min-w-4 items-center justify-center rounded-pill border px-1 font-mono text-[10px] font-semibold', tone === 'destructive' ? 'border-err/30 bg-err/10 text-err' : 'border-gold-700/30 bg-gold-100 text-gold-700')} title={title}>
      {count}
    </span>
  );
}
