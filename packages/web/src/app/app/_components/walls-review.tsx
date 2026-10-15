'use client';

import { Loader2Icon } from 'lucide-react';
import { Problems, Warnings } from './problems';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ExtractOutcome } from '@/types/extract';

export interface WallsReviewProps {
  outcome: Extract<ExtractOutcome, { ok: true }>;
  pending: boolean;
  onGenerate: (projectText: string) => void;
}

function Confidence({ value }: { value: number }) {
  const cls = value >= 0.9 ? 'bg-success text-paper' : value >= 0.7 ? 'bg-warning text-paper' : 'bg-destructive text-paper';
  return <Badge className={cn('font-mono', cls)}>{value.toFixed(2)}</Badge>;
}

/** Passo 02: o que a IA leu, com confiança e evidência, para o humano conferir antes de gerar. */
export function WallsReview({ outcome, pending, onGenerate }: WallsReviewProps) {
  const lowConfidence = outcome.walls.filter((w) => w.confidence < 0.7 || w.openings.some((o) => o.confidence < 0.7)).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2">{outcome.projectName}</h2>
        <Badge variant="secondary">level {outcome.level}</Badge>
        <Badge variant="secondary">{outcome.walls.length} walls</Badge>
        <Badge variant="secondary">{outcome.openingTypes.length} opening types</Badge>
        {lowConfidence > 0 ? <Badge className="bg-destructive text-paper">{lowConfidence} to double-check</Badge> : null}
        <span className="text-sm text-ink-3">
          {outcome.model}
          {outcome.pagesSent.length > 0 ? ` · ${outcome.pagesSent.map((p) => `${p.name} p.${p.pages.join(',')}`).join(' · ')}` : ''}
        </span>
      </div>
      <p className="text-sm text-ink-2">Origin: {outcome.origin}</p>

      {outcome.problems.length > 0 ? <Problems problems={outcome.problems} /> : null}
      <Warnings warnings={outcome.warnings} />

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
              <TableHead className="text-right">Conf.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outcome.walls.map((w, i) => (
              <TableRow key={w.id} style={{ '--i': i } as React.CSSProperties} className="stagger transition-colors duration-200 hover:bg-paper-2">
                <TableCell className="font-mono">{w.id}</TableCell>
                <TableCell className="font-mono text-[13px]" title={w.evidence}>
                  {w.geometry}
                </TableCell>
                <TableCell className="font-mono">{w.section}</TableCell>
                <TableCell className="font-mono">{w.wallType ?? '—'}</TableCell>
                <TableCell className="text-sm">
                  {w.exterior ? 'exterior' : 'interior'} · {w.bearing ? 'bearing' : 'non-bearing'}
                </TableCell>
                <TableCell className="text-sm">
                  {w.openings.length === 0
                    ? '—'
                    : w.openings.map((o) => (
                        <span key={o.id} className="mr-2 inline-flex items-center gap-1 font-mono text-[13px]">
                          {o.id} <span className="text-ink-3">{o.kind} @ {o.position}</span>
                        </span>
                      ))}
                </TableCell>
                <TableCell className="text-right">
                  <Confidence value={w.confidence} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {outcome.notes.length > 0 ? (
        <div className="rounded-md border bg-paper-2 p-4 text-sm">
          <p className="eyebrow mb-2">Notes from the AI</p>
          <ul className="list-disc space-y-1 pl-4">
            {outcome.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="text-sm">
        <summary className="cursor-pointer text-ink-2">Full review report</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-card p-3 whitespace-pre-wrap">{outcome.report}</pre>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="accent" disabled={pending || outcome.problems.length > 0} onClick={() => onGenerate(outcome.projectText)}>
          {pending ? (
            <>
              <Loader2Icon className="animate-spin" /> Generating…
            </>
          ) : (
            'Generate panels'
          )}
        </Button>
        <span className="text-sm text-ink-3">
          {outcome.problems.length > 0
            ? 'The engine can’t build this as read. Wall editing arrives with the editor; for now, fix the project file and import it under Advanced.'
            : 'Deterministic: same input, same sheets.'}
        </span>
      </div>
    </div>
  );
}
