'use client';

import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepId = 1 | 2 | 3;

const STEPS: { id: StepId; label: string; short: string }[] = [
  { id: 1, label: 'Upload drawings', short: 'Drawings' },
  { id: 2, label: 'Review walls', short: 'Review' },
  { id: 3, label: 'Panels', short: 'Panels' },
];

/**
 * Passos concluídos (clicáveis para voltar): com projeto aberto, 1 e 2 — o editor fica alcançável depois de ir aos
 * desenhos (M2: antes o 2 só contava com resultado e o humano ficava preso no passo 1); com resultado, o 3.
 */
export function doneSteps(hasDraft: boolean, hasResult: boolean): StepId[] {
  return [...(hasDraft ? ([1, 2] as const) : []), ...(hasResult ? ([3] as const) : [])];
}

export interface StepBarProps {
  active: StepId;
  /** Passos já concluídos: clicáveis para voltar. */
  done: readonly StepId[];
  onGo: (step: StepId) => void;
  /** Versão de uma linha para a top bar do workspace (S21.4): pills pequenos, rótulos curtos. */
  compact?: boolean;
  /** Trilho centrado do passo 01 (2026-10-23): círculos ligados por uma linha, a feita em dourado. */
  rail?: boolean;
}

/** Barra de passos como no takeoff da National Lumber: círculo numerado, ativo cheio em navy com sublinhado dourado. */
export function StepBar({ active, done, onGo, compact = false, rail = false }: StepBarProps) {
  if (rail) return <StepRail active={active} done={done} onGo={onGo} />;
  return (
    <ol className={cn('no-print', compact ? 'flex items-center gap-1' : 'grid grid-cols-3 border-y border-line-faint')} aria-label="Steps">
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
              title={compact ? s.label : undefined}
              className={cn(
                'flex w-full items-center text-left transition-colors duration-200',
                compact ? 'gap-1.5 rounded-pill px-1.5 py-1 text-[13px]' : 'gap-3 px-2 py-4 text-sm',
                isActive ? 'text-ink' : 'text-ink-3',
                clickable && 'cursor-pointer hover:text-ink',
                !clickable && 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'flex shrink-0 items-center justify-center rounded-pill border font-semibold transition-[background-color,border-color,transform] duration-300 ease-site',
                  compact ? 'size-5 text-[11px]' : 'size-7 text-[13px]',
                  isActive || isDone ? 'border-navy-900 bg-navy-900 text-paper' : 'border-line-strong bg-card text-ink-2',
                  isActive && !compact && 'scale-110',
                )}
              >
                {isDone && !isActive ? <CheckIcon className={compact ? 'size-3' : 'size-3.5'} /> : s.id}
              </span>
              <span className={cn('font-medium', isActive && 'font-semibold', compact && !isActive && 'hidden sm:inline')}>{compact ? s.short : s.label}</span>
            </button>
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gold transition-transform duration-300 ease-site',
                isActive ? 'scale-x-100' : 'scale-x-0',
                compact && 'inset-x-1.5',
              )}
            />
          </li>
        );
      })}
    </ol>
  );
}

/** Trilho do passo 01: três círculos numerados ligados por linhas; a linha de um passo feito é dourada. */
function StepRail({ active, done, onGo }: Pick<StepBarProps, 'active' | 'done' | 'onGo'>) {
  return (
    <ol className="no-print flex items-center justify-center" aria-label="Steps">
      {STEPS.map((s, i) => {
        const isActive = s.id === active;
        const isDone = done.includes(s.id);
        const clickable = isDone && !isActive;
        const reached = isActive || isDone;
        return (
          <li key={s.id} aria-current={isActive ? 'step' : undefined} className="flex items-center">
            {i > 0 ? <span aria-hidden className={cn('mx-3 h-0.5 w-10 rounded-pill sm:mx-4 sm:w-20', reached ? 'bg-gradient-to-r from-gold to-line' : 'bg-line')} /> : null}
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onGo(s.id)}
              className={cn('flex items-center gap-2.5 text-[13px] font-semibold transition-colors duration-200', reached ? 'text-ink' : 'text-ink-3', clickable ? 'cursor-pointer hover:text-navy-600' : 'cursor-default')}
            >
              <span className={cn('flex size-7 items-center justify-center rounded-pill border text-[12px] transition-[background-color,border-color,transform] duration-300 ease-site', reached ? 'border-navy-900 bg-navy-900 text-paper' : 'border-line-strong bg-card text-ink-2', isActive && 'scale-110')}>
                {isDone && !isActive ? <CheckIcon className="size-3.5" /> : s.id}
              </span>
              <span className={cn(!isActive && 'hidden sm:inline')}>{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
