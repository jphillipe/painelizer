'use client';

import { CircleCheckIcon, Loader2Icon, OctagonXIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { helpFor, quickFixFor, type QuickFix } from '@/lib/editor/issue-help';
import { LABELS } from '@/lib/editor/labels';
import type { IssueAction, IssueGroup } from '@/lib/editor/issue-groups';
import type { Issue } from '@/lib/editor/problems';
import type { Selection } from '@/lib/editor/state';
import { cn } from '@/lib/utils';
import { MeasureInput, NumberInput } from './fields';

/** Valor confirmado num conserto rápido da lista. */
export type QuickFixCommit = { kind: 'wind'; value: number } | { kind: 'headerHeight'; value: number } | { kind: 'addOpening'; wallId: string; openingId: string; tag: string | undefined };

export interface IssueGroupsListProps {
  groups: readonly IssueGroup[];
  /** A checagem do motor ainda não é desta versão do projeto. */
  stale: boolean;
  checking: boolean;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** Ação do grupo: dados do projeto (card de setup) ou configurações. `openWall` é resolvido aqui mesmo. */
  onAction: (action: Exclude<IssueAction, 'openWall'>) => void;
  /** Conserto rápido confirmado (vento, altura de header, abertura que faltava). */
  onQuickFix?: ((fix: QuickFixCommit) => void) | undefined;
  /** Valores atuais para os campos de conserto rápido. */
  current?: { windSpeed?: number | undefined; headerHeight?: number | undefined } | undefined;
}

const ACTION_LABEL: Record<Exclude<IssueAction, 'openWall'>, string> = {
  projectData: 'Fill in project data',
  projectSettings: 'Open project settings',
};

function targetOf(i: Issue): Selection | undefined {
  if (i.wallId === undefined) return undefined;
  return i.openingId === undefined ? { kind: 'wall', wallId: i.wallId } : { kind: 'opening', wallId: i.wallId, openingId: i.openingId };
}

/**
 * Issues agrupadas (S21.4): um item por família com título em inglês, o que significa e como resolver, contagem,
 * chips clicáveis (parede, ou abertura quando a issue é dela), conserto rápido quando há um e a ação quando há
 * uma. Os textos originais do motor / da extração ficam em "Details", nunca somem.
 */
export function IssueGroupsList({ groups, stale, checking, selection, onSelect, onAction, onQuickFix, current }: IssueGroupsListProps) {
  if (groups.length === 0) {
    return (
      <div className="flex items-start gap-2 px-4 py-4 text-sm" aria-live="polite">
        {checking ? <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin text-ink-3" /> : <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />}
        <div>
          <p className="font-semibold">{checking ? 'Checking with the engine…' : 'No problems'}</p>
          <p className="text-ink-3">{checking ? 'Problems and warnings appear here.' : 'The engine builds this project as it is.'}</p>
        </div>
      </div>
    );
  }
  const selectedWall = selection.kind === 'wall' || selection.kind === 'opening' ? selection.wallId : undefined;
  const selectedOpening = selection.kind === 'opening' ? selection.openingId : undefined;
  return (
    <ul className={cn('workspace-pane h-full divide-y divide-line-faint', stale && 'opacity-70')} aria-live="polite" aria-busy={checking}>
      {stale ? <li className="px-4 py-1 text-[12px] text-ink-3">Rechecking…</li> : null}
      {groups.map((g) => {
        const problem = g.severity === 'problem';
        const first = g.items[0]!;
        const help = helpFor(first);
        const fix = quickFixFor(first);
        const single = g.items.length === 1 ? targetOf(first) : undefined;
        // Chips: uma por item quando a issue é de abertura (vai direto nela); senão uma por parede.
        const byOpening = g.items.every((i) => i.openingId !== undefined) && g.items.length <= 12;
        const chips: { label: string; target: Selection; selected: boolean }[] = byOpening
          ? g.items.map((i) => ({ label: i.openingId!, target: targetOf(i)!, selected: selectedOpening === i.openingId }))
          : g.wallIds.map((w) => ({ label: w, target: { kind: 'wall', wallId: w }, selected: selectedWall === w }));
        return (
          <li key={g.key} className="space-y-2 px-4 py-3">
            <div className="flex items-start gap-2">
              {problem ? <OctagonXIcon className="mt-0.5 size-4 shrink-0 text-destructive" /> : <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />}
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-semibold">
                  {single !== undefined ? (
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onSelect(single)}>
                      {g.title}
                    </button>
                  ) : (
                    g.title
                  )}
                  {g.count > 1 ? <span className="ml-2 font-mono text-[12px] font-medium text-ink-3">× {g.count}</span> : null}
                </p>
                {help !== undefined ? (
                  <p className="text-[12px] leading-snug text-ink-2">
                    {help.what} <span className="font-semibold text-ink">{help.fix}</span>
                  </p>
                ) : null}
                {chips.length > 0 && !(single !== undefined && chips.length === 1) ? (
                  <div className="flex flex-wrap gap-1">
                    {chips.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        onClick={() => onSelect(c.target)}
                        aria-pressed={c.selected}
                        title={c.target.kind === 'opening' ? 'Go to the opening' : 'Go to the wall'}
                        className={cn('rounded-sm border px-1.5 font-mono text-[11px] transition-colors hover:border-line-strong', c.selected ? 'border-navy-900 bg-navy-900 text-paper' : 'border-line text-ink-2')}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {fix !== undefined && onQuickFix !== undefined ? <QuickFixRow fix={fix} group={g} current={current} onQuickFix={onQuickFix} /> : null}
                {g.action !== undefined && g.action !== 'openWall' && fix === undefined ? (
                  <Button variant={problem ? 'accent' : 'outline'} size="xs" onClick={() => onAction(g.action as Exclude<IssueAction, 'openWall'>)}>
                    {ACTION_LABEL[g.action]}
                  </Button>
                ) : null}
                <details className="text-[12px]">
                  <summary className="cursor-pointer text-ink-3 select-none">Details</summary>
                  <ul className="mt-1 space-y-1 font-mono text-[12px] text-ink-2">
                    {g.items.map((i, n) => {
                      const t = targetOf(i);
                      return (
                        <li key={`${n}-${i.text}`}>
                          {t === undefined ? (
                            i.text
                          ) : (
                            <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onSelect(t)}>
                              {i.text}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Campo ou botão do conserto rápido: vento e altura de header confirmam no blur/Enter; abertura que faltava é um botão por item. */
function QuickFixRow({ fix, group, current, onQuickFix }: { fix: QuickFix; group: IssueGroup; current: IssueGroupsListProps['current']; onQuickFix: (fix: QuickFixCommit) => void }) {
  if (fix.kind === 'wind') {
    return (
      <div className="flex items-center gap-2">
        <Label htmlFor={`qf-wind-${group.key}`} className="text-[12px] text-ink-2">
          {LABELS.wind}
        </Label>
        <NumberInput id={`qf-wind-${group.key}`} value={current?.windSpeed} integer min={1} placeholder={LABELS.windPlaceholder} onCommit={(v) => v !== undefined && onQuickFix({ kind: 'wind', value: v })} />
      </div>
    );
  }
  if (fix.kind === 'headerHeight') {
    return (
      <div className="flex items-center gap-2">
        <Label htmlFor={`qf-hh-${group.key}`} className="text-[12px] text-ink-2">
          {LABELS.headerHeight}
        </Label>
        <MeasureInput id={`qf-hh-${group.key}`} value={current?.headerHeight} positive placeholder={LABELS.headerHeightPlaceholder} onCommit={(v) => v !== undefined && onQuickFix({ kind: 'headerHeight', value: v })} />
      </div>
    );
  }
  // addOpening: um botão por item do grupo (cada um é uma abertura diferente)
  return (
    <div className="flex flex-wrap gap-1">
      {group.items.map((i) => {
        const f = quickFixFor(i);
        if (f?.kind !== 'addOpening') return null;
        return (
          <Button key={f.openingId} variant="outline" size="xs" onClick={() => onQuickFix(f)} title={`Add ${f.openingId} at the center of ${f.wallId}, then drag it into place`}>
            <PlusIcon /> Add {f.openingId}
            {f.tag !== undefined ? <span className="text-ink-3">({f.tag})</span> : null}
          </Button>
        );
      })}
    </div>
  );
}
