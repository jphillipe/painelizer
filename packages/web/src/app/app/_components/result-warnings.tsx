'use client';

import { TriangleAlertIcon } from 'lucide-react';
import { useMemo } from 'react';
import { helpFor } from '@/lib/editor/issue-help';
import { groupIssues } from '@/lib/editor/issue-groups';
import { parseEngineResult, type IdIndex } from '@/lib/editor/problems';
import type { PanelSummary } from '@/types/panels';

export interface ResultWarningsProps {
  warnings: readonly string[];
  panels: readonly PanelSummary[];
  /** Ids do projeto (parede → aberturas), para ligar cada aviso à peça; sem o draft, só as paredes dos painéis. */
  ids: IdIndex | undefined;
  onOpenSheet: (panelId: string) => void;
}

/** Ids mínimos quando não há draft: as paredes que os painéis citam. */
export function idsFromPanels(panels: readonly PanelSummary[]): IdIndex {
  const walls = [...new Set(panels.map((p) => p.wallId))];
  return { walls, openings: new Map(walls.map((w) => [w, []])) };
}

/**
 * Avisos do resultado (M3) na mesma linguagem do editor: agrupados por família com título em inglês, o que
 * aconteceu e como resolver, e um chip por painel que abre a folha. O texto original do motor fica em "Details".
 */
export function ResultWarnings({ warnings, panels, ids, onOpenSheet }: ResultWarningsProps) {
  const groups = useMemo(() => {
    const index = ids ?? idsFromPanels(panels);
    return groupIssues(parseEngineResult({ warnings }, index), index);
  }, [warnings, panels, ids]);
  if (groups.length === 0) return null;
  return (
    <section className="rounded-md border border-warning/40 bg-gold-100/40" aria-label="Warnings">
      <p className="flex items-center gap-2 border-b border-warning/30 px-4 py-2 text-sm font-semibold text-warning">
        <TriangleAlertIcon className="size-4" />
        {warnings.length} warning{warnings.length === 1 ? '' : 's'} to review — the panels are built; check these before cutting
      </p>
      <ul className="divide-y divide-warning/20">
        {groups.map((g) => {
          const help = helpFor(g.items[0]!);
          const panelIds = [...new Set(g.items.map((i) => i.panelId).filter((p): p is string => p !== undefined))];
          return (
            <li key={g.key} className="space-y-1.5 px-4 py-3">
              <p className="text-sm font-semibold">
                {g.title}
                {g.count > 1 ? <span className="ml-2 font-mono text-[12px] font-medium text-ink-3">× {g.count}</span> : null}
              </p>
              {help !== undefined ? (
                <p className="text-[12px] leading-snug text-ink-2">
                  {help.what} <span className="font-semibold text-ink">{help.fix}</span>
                </p>
              ) : null}
              {panelIds.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {panelIds.map((id) => (
                    <button key={id} type="button" onClick={() => onOpenSheet(id)} title="Open the sheet" className="rounded-sm border border-line px-1.5 font-mono text-[11px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink">
                      {id}
                    </button>
                  ))}
                </div>
              ) : null}
              <details className="text-[12px]">
                <summary className="cursor-pointer text-ink-3 select-none">Details</summary>
                <ul className="mt-1 space-y-1 font-mono text-[12px] text-ink-2">
                  {g.items.map((i, n) => (
                    <li key={`${n}-${i.text}`}>{i.text}</li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
