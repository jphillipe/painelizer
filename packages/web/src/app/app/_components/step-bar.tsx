'use client';

import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepId = 1 | 2 | 3;

const STEPS: { id: StepId; label: string }[] = [
  { id: 1, label: 'Upload drawings' },
  { id: 2, label: 'Review walls' },
  { id: 3, label: 'Panels' },
];

export interface StepBarProps {
  active: StepId;
  /** Passos já concluídos: clicáveis para voltar. */
  done: readonly StepId[];
  onGo: (step: StepId) => void;
}

/** Barra de passos como no takeoff da National Lumber: círculo numerado, ativo cheio em navy com sublinhado dourado. */
export function StepBar({ active, done, onGo }: StepBarProps) {
  return (
    <ol className="no-print grid grid-cols-3 border-y border-line-faint" aria-label="Steps">
      {STEPS.map((s) => {
        const isActive = s.id === active;
        const isDone = done.includes(s.id);
        const clickable = isDone && !isActive;
        return (
          <li key={s.id} aria-current={isActive ? 'step' : undefined} className="relative">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onGo(s.id)}
              className={cn(
                'flex w-full items-center gap-3 px-2 py-4 text-left text-sm transition-colors duration-200',
                isActive ? 'text-ink' : 'text-ink-3',
                clickable && 'cursor-pointer hover:text-ink',
                !clickable && 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-pill border text-[13px] font-semibold transition-[background-color,border-color,transform] duration-300 ease-site',
                  isActive || isDone ? 'border-navy-900 bg-navy-900 text-paper' : 'border-line-strong bg-card text-ink-2',
                  isActive && 'scale-110',
                )}
              >
                {isDone && !isActive ? <CheckIcon className="size-3.5" /> : s.id}
              </span>
              <span className={cn('font-medium', isActive && 'font-semibold')}>{s.label}</span>
            </button>
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gold transition-transform duration-300 ease-site',
                isActive ? 'scale-x-100' : 'scale-x-0',
              )}
            />
          </li>
        );
      })}
    </ol>
  );
}
