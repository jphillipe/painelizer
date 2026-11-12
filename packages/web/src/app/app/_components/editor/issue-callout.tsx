'use client';

import { OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import { helpFor } from '@/lib/editor/issue-help';
import { ISSUE_TITLES, tierOf } from '@/lib/editor/issue-groups';
import { hasOriginal, issueMessage, type Issue } from '@/lib/editor/problems';
import { OriginalText } from './issue-text';
import { cn } from '@/lib/utils';

/**
 * Issues do item selecionado no topo do inspetor (S21.4): título em inglês quando a família é conhecida, como
 * resolver, a frase do código (S26) e o texto original do motor só em "Details". Problemas em vermelho, avisos em
 * dourado escuro. S46: o aviso que a fábrica resolve sozinha não acende a parede na planta nem na lista, mas
 * continua aqui, com a etiqueta "Fine to leave".
 */
export function IssueCallout({ issues }: { issues: readonly Issue[] }) {
  if (issues.length === 0) return null;
  const problem = issues.some((i) => i.severity === 'problem');
  return (
    <div className={cn('rounded-md border px-3 py-2 text-[13px]', problem ? 'border-destructive/40 bg-destructive/5' : 'border-warning/40 bg-gold-100/40')} role="status">
      <ul className="space-y-2">
        {issues.map((i, n) => {
          const title = ISSUE_TITLES[i.kind ?? i.code ?? ''];
          const help = helpFor(i);
          return (
            <li key={`${n}-${i.text}`} className="flex items-start gap-2">
              {i.severity === 'problem' ? <OctagonXIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" /> : <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />}
              <span className="min-w-0 space-y-0.5">
                {tierOf(i) === 'fine' ? <span className="eyebrow block">Fine to leave</span> : null}
                {title !== undefined ? <span className="block font-semibold">{title}</span> : null}
                {help !== undefined ? <span className="block text-[12px] leading-snug text-ink-2">{help.fix}</span> : null}
                <span className={cn('block text-[12px] text-ink-3', title === undefined && 'text-ink')}>{issueMessage(i)}</span>
                {hasOriginal(i) ? <OriginalText text={i.text} /> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
