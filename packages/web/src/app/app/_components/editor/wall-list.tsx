'use client';

import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { isPlanWall, type DraftOpening, type DraftWall, type ProjectDraft } from '@/lib/editor/draft';
import { formatMeasure, formatPoint } from '@/lib/editor/measure';
import type { Issue } from '@/lib/editor/problems';
import { confidenceTone, type WallProvenance } from '@/lib/editor/provenance';
import type { Selection } from '@/lib/editor/state';
import { cn } from '@/lib/utils';

export interface WallListProps {
  draft: ProjectDraft;
  selection: Selection;
  provenance: ReadonlyMap<string, WallProvenance>;
  issuesByWall: ReadonlyMap<string | undefined, Issue[]>;
  onSelect: (selection: Selection) => void;
}

function Confidence({ value }: { value: number }) {
  const tone = confidenceTone(value);
  return (
    <Badge className={cn('font-mono', tone === 'success' && 'bg-success text-paper', tone === 'warning' && 'bg-warning text-paper', tone === 'destructive' && 'bg-destructive text-paper')}>
      {value.toFixed(2)}
    </Badge>
  );
}

function geometry(w: DraftWall): string {
  if (isPlanWall(w)) return `${w.start === undefined ? '?' : formatPoint(w.start)} → ${w.end === undefined ? '?' : formatPoint(w.end)}`;
  return w.length === undefined ? '—' : formatMeasure(w.length);
}

function position(o: DraftOpening): string {
  if (o.center !== undefined) return `@ ${formatMeasure(o.center)}`;
  if (o.offset !== undefined) return `edge ${formatMeasure(o.offset)}`;
  return '@ ?';
}

/** Tabela de paredes do draft: linha clicável seleciona; confiança e evidência vêm da leitura da IA, se houver. */
export function WallList({ draft, selection, provenance, issuesByWall, onSelect }: WallListProps) {
  const hasProvenance = provenance.size > 0;
  const selectedWall = selection.kind === 'wall' || selection.kind === 'opening' ? selection.wallId : undefined;
  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Wall</TableHead>
            <TableHead>Geometry (axis)</TableHead>
            <TableHead>Section</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Openings</TableHead>
            <TableHead className="text-right">Issues</TableHead>
            {hasProvenance ? <TableHead className="text-right">Conf.</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {draft.walls.map((w, i) => {
            const p = provenance.get(w.id);
            const issues = issuesByWall.get(w.id) ?? [];
            const problems = issues.filter((x) => x.severity === 'problem').length;
            const warnings = issues.length - problems;
            const selected = selectedWall === w.id;
            return (
              <TableRow
                key={`${i}-${w.id}`}
                style={{ '--i': i } as React.CSSProperties}
                data-selected={selected || undefined}
                onClick={() => onSelect({ kind: 'wall', wallId: w.id })}
                className={cn('stagger cursor-pointer transition-colors duration-200 hover:bg-paper-2', selected && 'bg-gold-100/60 hover:bg-gold-100/60')}
                aria-selected={selected}
              >
                <TableCell className="font-mono font-semibold">{w.id}</TableCell>
                <TableCell className="font-mono text-[13px]" title={p?.evidence}>
                  {geometry(w)}
                </TableCell>
                <TableCell className="font-mono">{w.section ?? '?'}</TableCell>
                <TableCell className="font-mono">{w.wallType ?? '—'}</TableCell>
                <TableCell className="text-sm">
                  {w.exterior === undefined ? '?' : w.exterior ? 'exterior' : 'interior'} · {w.bearing === undefined ? '?' : w.bearing ? 'bearing' : 'non-bearing'}
                </TableCell>
                <TableCell className="text-sm">
                  {w.openings.length === 0
                    ? '—'
                    : w.openings.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect({ kind: 'opening', wallId: w.id, openingId: o.id });
                          }}
                          className={cn(
                            'mr-2 inline-flex items-center gap-1 rounded-sm font-mono text-[13px] underline-offset-2 hover:underline',
                            selection.kind === 'opening' && selection.openingId === o.id && 'font-semibold',
                          )}
                        >
                          {o.id} <span className="text-ink-3">{o.tag ?? o.type ?? '?'} {position(o)}</span>
                        </button>
                      ))}
                </TableCell>
                <TableCell className="text-right font-mono text-[13px]">
                  {problems > 0 ? <Badge className="bg-destructive text-paper">{problems}</Badge> : null}
                  {warnings > 0 ? <Badge className="ml-1 bg-warning text-paper">{warnings}</Badge> : null}
                  {issues.length === 0 ? <span className="text-ink-3">—</span> : null}
                </TableCell>
                {hasProvenance ? <TableCell className="text-right">{p === undefined ? <span className="text-ink-3">—</span> : <Confidence value={p.confidence} />}</TableCell> : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
