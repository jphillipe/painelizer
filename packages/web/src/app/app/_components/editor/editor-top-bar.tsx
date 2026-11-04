'use client';

import { CircleCheckIcon, CloudCheckIcon, CloudOffIcon, EllipsisIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { describeSave, type SaveStatus } from '@/lib/editor/project-sync';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '../confirm-dialog';
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
  /** Paredes marcadas como revisadas (M5); mostrado quando há leitura da IA ou alguma marca. */
  reviewed?: { done: number; total: number } | undefined;
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
  /** Auto-save no servidor (S22.1): "Saved · just now", "Saving…", "Not saved" com Retry, "Edited elsewhere" com Reload. */
  save?: SaveStatus | undefined;
  onRetrySave?: (() => void) | undefined;
  /** S23 (A4): saídas do conflito além de recarregar ("Save as copy" também quando o projeto foi apagado). */
  saveActions?: SaveConflictActions | undefined;
}

/** O que o chip oferece quando o auto-save parou (conflito ou projeto apagado). */
export interface SaveConflictActions {
  /** Cria um projeto novo com o que está no editor e passa a gravar nele. */
  saveAsCopy?: () => void;
  /** Grava por cima da revisão de quem gravou antes. */
  overwrite?: () => void;
  /** Padrão: `window.location.reload()` (os testes trocam). */
  reload?: () => void;
}

/**
 * Top bar do workspace (S21.4): passos, nome do projeto (h1 da tela), contagens, um chip de status e a ação
 * principal sempre visível. Downloads, configurações e "Start over" ficam no menu `⋯`. Abaixo de `sm` (M5) são
 * duas linhas fixas: passos + nome | status + Generate + menu — nada quebra em três.
 */
export function EditorTopBar({ name, walls, openings, reviewed, check, problems, warnings, ready, pending, needsData, onGenerate, steps, menu, save, onRetrySave, saveActions }: EditorTopBarProps) {
  const hint = problems > 0 ? (needsData ? 'Fill in the project data first.' : `Fix ${problems} problem${problems === 1 ? '' : 's'} first.`) : check.status === 'error' ? (check.error ?? 'Could not check the project.') : '';
  return (
    <div className="no-print grid shrink-0 grid-cols-1 gap-x-4 gap-y-1.5 border-b border-line bg-card px-[var(--gutter)] py-2 sm:flex sm:flex-wrap sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        {steps}
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <h1 className="truncate text-lg font-semibold tracking-tight">{name}</h1>
          <span className="hidden shrink-0 text-[13px] text-ink-3 lg:inline">
            {walls} wall{walls === 1 ? '' : 's'} · {openings} opening{openings === 1 ? '' : 's'}
            {reviewed !== undefined ? ` · ${reviewed.done} of ${reviewed.total} reviewed` : ''}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-none" aria-live="polite">
          <StatusChip check={check} problems={problems} warnings={warnings} />
          {save !== undefined ? <SaveChip status={save} onRetry={onRetrySave} actions={saveActions} /> : null}
        </div>
        {hint !== '' ? <span className="hidden truncate text-[13px] text-ink-3 md:inline">{hint}</span> : null}
        <Button variant="accent" size="sm" disabled={pending || !ready} onClick={onGenerate} title={hint === '' ? undefined : hint} className="ml-auto shrink-0 sm:ml-0">
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

/**
 * Estado do auto-save (S22.1). "just now" envelhece sozinho (um tique por meio minuto). Conflito e erro trazem a
 * ação na própria barra: recarregar para ver a versão de quem gravou antes, ou tentar de novo.
 */
function SaveChip({ status, onRetry, actions }: { status: SaveStatus; onRetry: (() => void) | undefined; actions: SaveConflictActions | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState<'overwrite' | 'reload' | undefined>(undefined);
  useEffect(() => {
    if (status.kind !== 'saved') return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [status]);
  const label = describeSave(status, now);
  if (label.tone === 'muted') return null;
  if (status.kind === 'saving') {
    return (
      <Badge key="saving" variant="outline">
        <Loader2Icon className="animate-spin" /> {label.text}
      </Badge>
    );
  }
  if (status.kind === 'saved') {
    return (
      <Badge key="saved" variant="outline" className="animate-pop" title={new Date(status.at).toLocaleString()}>
        <CloudCheckIcon /> {label.text}
      </Badge>
    );
  }
  const copyButton =
    actions?.saveAsCopy !== undefined ? (
      <button type="button" className="ml-1 underline underline-offset-2" onClick={actions.saveAsCopy}>
        Save as copy
      </button>
    ) : null;
  if (status.kind === 'conflict') {
    // S23 (A4): antes só "Reload", que trocava as edições daqui pela versão do servidor sem dizer.
    return (
      <>
        <Badge key="conflict" variant="warning" className="animate-pop" title={status.message}>
          <TriangleAlertIcon /> {label.text}
          {copyButton}
          {actions?.overwrite !== undefined ? (
            <button type="button" className="ml-1 underline underline-offset-2" onClick={() => setConfirm('overwrite')}>
              Overwrite
            </button>
          ) : null}
          <button type="button" className="ml-1 underline underline-offset-2" onClick={() => setConfirm('reload')}>
            Reload
          </button>
        </Badge>
        <ConfirmDialog
          open={confirm !== undefined}
          onOpenChange={(open) => (open ? undefined : setConfirm(undefined))}
          title={confirm === 'overwrite' ? 'Overwrite the other version?' : 'Reload and drop your changes?'}
          description={
            confirm === 'overwrite'
              ? `Someone saved revision ${status.revision} of this project after you opened it. Overwriting replaces their version with yours; their changes are lost. To keep both, save yours as a copy instead.`
              : 'Reloading opens the version on the server. Your changes since the last save are lost. To keep them, save them as a copy first.'
          }
          confirmLabel={confirm === 'overwrite' ? 'Overwrite' : 'Reload'}
          destructive
          onConfirm={() => {
            const which = confirm;
            setConfirm(undefined);
            if (which === 'overwrite') actions?.overwrite?.();
            else (actions?.reload ?? (() => window.location.reload()))();
          }}
        />
      </>
    );
  }
  return (
    <Badge key={status.kind} variant="destructive" className="animate-pop" title={'message' in status ? status.message : undefined}>
      <CloudOffIcon /> {label.text}
      {status.kind === 'error' && onRetry !== undefined ? (
        <button type="button" className="ml-1 underline underline-offset-2" onClick={onRetry}>
          Retry
        </button>
      ) : null}
      {status.kind === 'deleted' ? copyButton : null}
    </Badge>
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
