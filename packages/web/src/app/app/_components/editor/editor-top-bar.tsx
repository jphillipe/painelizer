'use client';

import { CircleCheckIcon, EllipsisIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { CheckState } from './use-project-check';

export interface TopBarMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** Separador antes deste item. */
  separator?: boolean;
}

export interface EditorTopBarProps {
  name: string;
  walls: number;
  openings: number;
  check: CheckState;
  problems: number;
  warnings: number;
  ready: boolean;
  pending: boolean;
  needsData: boolean;
  onGenerate: () => void;
  /** `StepBar` compacta. */
  steps: ReactNode;
  menu: readonly TopBarMenuItem[];
}

/**
 * Top bar do workspace (S21.4): passos, nome do projeto (h1 da tela), contagens, um chip de status e a ação
 * principal sempre visível. Downloads, configurações e "Start over" ficam no menu `⋯`.
 */
export function EditorTopBar({ name, walls, openings, check, problems, warnings, ready, pending, needsData, onGenerate, steps, menu }: EditorTopBarProps) {
  const hint =
    problems > 0
      ? needsData
        ? 'Fill in the project data first.'
        : `Fix ${problems} problem${problems === 1 ? '' : 's'} first.`
      : check.status === 'error'
        ? (check.error ?? 'Could not check the project.')
        : ready
          ? ''
          : 'Checking…';
  return (
    <div className="no-print flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-card px-[var(--gutter)] py-2">
      {steps}
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <h1 className="truncate text-lg font-semibold tracking-tight">{name}</h1>
        <span className="hidden shrink-0 text-[13px] text-ink-3 lg:inline">
          {walls} wall{walls === 1 ? '' : 's'} · {openings} opening{openings === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2" aria-live="polite">
        <StatusChip check={check} problems={problems} warnings={warnings} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {hint !== '' ? <span className="hidden text-[13px] text-ink-3 sm:inline">{hint}</span> : null}
        <Button variant="accent" size="sm" disabled={pending || !ready} onClick={onGenerate}>
          {pending ? (
            <>
              <Loader2Icon className="animate-spin" /> Generating…
            </>
          ) : (
            'Generate panels'
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions">
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menu.map((m) => (
              <div key={m.label}>
                {m.separator ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem disabled={m.disabled} variant={m.destructive ? 'destructive' : 'default'} onSelect={m.onSelect}>
                  {m.label}
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** Chips de status em chip claro com ícone (docs/10-design.md §3): a cor nunca é o único sinal. Cada troca de estado entra com `pop` (M4). */
function StatusChip({ check, problems, warnings }: { check: CheckState; problems: number; warnings: number }) {
  if (check.status === 'error') {
    return (
      <Badge key="error" variant="destructive" className="animate-pop">
        <OctagonXIcon /> Check failed
      </Badge>
    );
  }
  if (problems > 0) {
    return (
      <Badge key="problems" variant="destructive" className="animate-pop">
        <OctagonXIcon /> {problems} to fix
      </Badge>
    );
  }
  if (check.status === 'checking' || check.stale || check.status === 'idle') {
    return (
      <Badge key="checking" variant="outline">
        <Loader2Icon className="animate-spin" /> Checking…
      </Badge>
    );
  }
  const panels = check.result?.ok ? check.result.panels.length : 0;
  return (
    <>
      <Badge key="ready" variant="success" className="animate-pop">
        <CircleCheckIcon /> Ready · {panels} panels
      </Badge>
      {warnings > 0 ? (
        <Badge key="warnings" variant="warning" className="animate-pop">
          <TriangleAlertIcon /> {warnings} warning{warnings === 1 ? '' : 's'}
        </Badge>
      ) : null}
    </>
  );
}
