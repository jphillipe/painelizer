'use client';

import { ChevronRightIcon, CircleCheckIcon, Loader2Icon, OctagonXIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { headerSection, readField } from 'cli/schema';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import type { ProjectDraft } from '@/lib/editor/draft';
import { doorHeightEdits, setHeaderEdits, type GroupFix, type HeaderScope } from '@/lib/editor/group-fixes';
import { helpFor, quickFixFor, type QuickFix } from '@/lib/editor/issue-help';
import { formatMeasure } from '@/lib/editor/measure';
import type { DraftEdit } from '@/lib/editor/state';
import { focusFor } from '@/lib/editor/issue-targets';
import { LABELS } from '@/lib/editor/labels';
import { causeCounts, type IssueAction, type IssueGroup, type IssueTier } from '@/lib/editor/issue-groups';
import { hasOriginal, issueMessage, type Issue } from '@/lib/editor/problems';
import { issueReviewKey } from '@/lib/editor/reviewed-issues';
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
  /** `focus` (S47): ids do campo que resolve a issue clicada — o inspetor abre a seção e põe o cursor nele. */
  onSelect: (selection: Selection, focus?: readonly string[]) => void;
  /** Ação do grupo: dados do projeto (card de setup) ou configurações (com o campo a focar). `openWall` é resolvido aqui mesmo. */
  onAction: (action: Exclude<IssueAction, 'openWall'>, focus?: readonly string[]) => void;
  /** Conserto rápido confirmado (vento, altura de header, abertura que faltava). */
  onQuickFix?: ((fix: QuickFixCommit) => void) | undefined;
  /** Valores atuais para os campos de conserto rápido. */
  current?: { windSpeed?: number | undefined; headerHeight?: number | undefined } | undefined;
  /** A checagem achou problema mas montou alguma parede: as paredes com problema ainda podem trazer avisos (S46). */
  partial?: boolean | undefined;
  /** Marcar / desmarcar avisos como revisados (S50): as chaves das ocorrências da linha. Ausente = sem os botões. */
  onReview?: ((keys: string[], reviewed: boolean) => void) | undefined;
  /** Conserto em grupo de cada causa (S49), pela chave do grupo. */
  fixes?: ReadonlyMap<string, GroupFix> | undefined;
  /** O conserto confirmado: as edições entram no projeto num passo só de desfazer. */
  onApplyEdits?: ((edits: DraftEdit[]) => void) | undefined;
  /** O projeto como está: o conserto da altura de porta decide por ele se edita o tipo ou a abertura. */
  draft?: ProjectDraft | undefined;
}

/** Chips à vista por linha; acima disso ficam atrás de "Show openings (N)" (S46). */
const CHIPS_IN_VIEW = 6;

const TIER_HEADING: Record<Extract<IssueTier, 'fix' | 'review'>, string> = { fix: 'Must fix', review: 'To review' };

const ACTION_LABEL: Record<Exclude<IssueAction, 'openWall'>, string> = {
  projectData: 'Fill in project data',
  projectSettings: 'Open project settings',
};

function targetOf(i: Issue): Selection | undefined {
  if (i.wallId === undefined) return undefined;
  return i.openingId === undefined ? { kind: 'wall', wallId: i.wallId } : { kind: 'opening', wallId: i.wallId, openingId: i.openingId };
}

/** Campo do projeto (Project settings) que resolve a issue, quando a família é de projeto (S47). */
function projectFocus(i: Issue): readonly string[] | undefined {
  const f = focusFor(i);
  return f?.selection.kind === 'project' ? f.fieldIds : undefined;
}

/**
 * Issues por causa (S21.4, S46): uma linha por família, em três seções — o que trava a geração, o que pede uma
 * decisão e o que a fábrica resolve (recolhida). Cada linha tem o título em inglês, a frase com os valores em comum
 * (ou o que a família significa), como resolver, chips clicáveis (da abertura quando a issue é dela; acima de
 * CHIPS_IN_VIEW ficam recolhidos), conserto rápido quando há um e a ação quando há uma. Os textos originais do
 * motor / da extração ficam em "Details", nunca somem. A contagem do topo é de causas, não de ocorrências.
 */
export function IssueGroupsList({ groups, stale, checking, selection, onSelect, onAction, onQuickFix, current, partial, fixes, onApplyEdits, draft, onReview }: IssueGroupsListProps) {
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
  const counts = causeCounts(groups);
  const tally = [counts.fix > 0 ? `${counts.fix} to fix` : '', counts.review > 0 ? `${counts.review} to review` : '', counts.fine > 0 ? `${counts.fine} fine to leave` : ''].filter((s) => s !== '').join(' · ');
  const row = (g: IssueGroup) => (
    <GroupRow key={g.key} group={g} selection={selection} onSelect={onSelect} onAction={onAction} onQuickFix={onQuickFix} current={current} groupFix={fixes?.get(g.key)} onApplyEdits={onApplyEdits} draft={draft} onReview={onReview} />
  );
  const fine = groups.filter((g) => g.tier === 'fine');
  const reviewed = groups.filter((g) => g.tier === 'reviewed');
  return (
    <div className={cn('workspace-pane h-full', stale && 'opacity-70')} aria-live="polite" aria-busy={checking}>
      <p className="border-b border-line-faint px-4 py-2 text-[12px] font-medium text-ink-2">{tally}</p>
      {stale ? <p className="px-4 py-1 text-[12px] text-ink-3">Rechecking…</p> : null}
      {(['fix', 'review'] as const).map((tier) => {
        const list = groups.filter((g) => g.tier === tier);
        if (list.length === 0) return null;
        return (
          <section key={tier} aria-label={TIER_HEADING[tier]}>
            <h3 className="eyebrow px-4 pt-3">{TIER_HEADING[tier]}</h3>
            <ul className="divide-y divide-line-faint">{list.map(row)}</ul>
          </section>
        );
      })}
      {fine.length > 0 ? (
        <details className="group/fine border-t border-line-faint">
          <summary className="eyebrow flex cursor-pointer list-none items-center gap-1 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="size-3.5 transition-transform duration-200 group-open/fine:rotate-90" aria-hidden />
            Fine to leave ({fine.length})
          </summary>
          <ul className="divide-y divide-line-faint">{fine.map(row)}</ul>
        </details>
      ) : null}
      {reviewed.length > 0 ? (
        <details className="group/reviewed border-t border-line-faint">
          <summary className="eyebrow flex cursor-pointer list-none items-center gap-1 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="size-3.5 transition-transform duration-200 group-open/reviewed:rotate-90" aria-hidden />
            Reviewed ({reviewed.length})
          </summary>
          <ul className="divide-y divide-line-faint opacity-80">{reviewed.map(row)}</ul>
        </details>
      ) : null}
      {partial === true ? <p className="border-t border-line-faint px-4 py-3 text-[12px] leading-snug text-ink-3">Walls with a problem are not framed yet — they may add warnings once fixed.</p> : null}
    </div>
  );
}

type GroupRowProps = Pick<IssueGroupsListProps, 'selection' | 'onSelect' | 'onAction' | 'onQuickFix' | 'current' | 'onApplyEdits' | 'draft' | 'onReview'> & { group: IssueGroup; groupFix: GroupFix | undefined };

/** Uma causa: título, frase, chips, conserto rápido, ação e "Details". */
function GroupRow({ group: g, selection, onSelect, onAction, onQuickFix, current, groupFix, onApplyEdits, draft, onReview }: GroupRowProps) {
  // S50: linha já revisada só oferece desfazer; linha de aviso oferece marcar. Problema nunca.
  const done = g.tier === 'reviewed';
  const reviewKeys = g.severity === 'problem' ? [] : g.items.map(issueReviewKey).filter((k): k is string => k !== undefined);
  const selectedWall = selection.kind === 'wall' || selection.kind === 'opening' ? selection.wallId : undefined;
  const selectedOpening = selection.kind === 'opening' ? selection.openingId : undefined;
  const problem = g.severity === 'problem';
  const first = g.items[0]!;
  const help = helpFor(first);
  const fix = quickFixFor(first);
  const single = g.items.length === 1 ? targetOf(first) : undefined;
  // A ação do grupo; sem uma, a família que tem um campo em Project settings ganha o botão que abre o diálogo nele.
  const settingsAction: Exclude<IssueAction, 'openWall'> | undefined = g.action !== undefined && g.action !== 'openWall' ? g.action : projectFocus(first) !== undefined ? 'projectSettings' : undefined;
  /**
   * S47: o clique leva ao campo que resolve a issue — a seleção do alvo e os ids do campo. Sem alvo (ou alvo de
   * projeto, que é do botão de ação), seleciona a parede / abertura como sempre. `wallOnly`: chip de parede não
   * troca a seleção para a abertura.
   */
  const go = (issue: Issue | undefined, fallback: Selection, wallOnly = false): void => {
    const f = issue === undefined ? undefined : focusFor(issue);
    if (f === undefined || f.selection.kind === 'project' || (wallOnly && f.selection.kind !== 'wall')) onSelect(fallback);
    else onSelect(f.selection, f.fieldIds);
  };
  // Chips: uma por item quando a issue é de abertura (vai direto nela); senão uma por parede.
  const byOpening = g.items.every((i) => i.openingId !== undefined);
  const chips: { label: string; target: Selection; selected: boolean; issue: Issue | undefined; wallOnly: boolean }[] = byOpening
    ? g.items.map((i) => ({ label: i.openingId!, target: targetOf(i)!, selected: selectedOpening === i.openingId, issue: i, wallOnly: false }))
    : g.wallIds.map((w) => ({ label: w, target: { kind: 'wall', wallId: w }, selected: selectedWall === w, issue: g.items.find((i) => i.wallId === w), wallOnly: true }));
  const chipButtons = (
    <div className="flex flex-wrap gap-1">
      {chips.map((c, n) => (
        <button
          key={`${n}-${c.label}`}
          type="button"
          onClick={() => go(c.issue, c.target, c.wallOnly)}
          aria-pressed={c.selected}
          title={c.target.kind === 'opening' ? 'Go to the opening' : 'Go to the wall'}
          className={cn('rounded-sm border px-1.5 font-mono text-[11px] transition-colors hover:border-line-strong', c.selected ? 'border-navy-900 bg-navy-900 text-paper' : 'border-line text-ink-2')}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start gap-2">
        {problem ? <OctagonXIcon className="mt-0.5 size-4 shrink-0 text-destructive" /> : <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />}
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-semibold">
            {single !== undefined ? (
              <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => go(first, single)}>
                {g.title}
              </button>
            ) : (
              g.title
            )}
            {g.count > 1 ? <span className="ml-2 font-mono text-[12px] font-medium text-ink-3">× {g.count}</span> : null}
          </p>
          {g.summary !== undefined || help !== undefined ? (
            <p className="text-[12px] leading-snug text-ink-2">
              {g.summary ?? help?.what}
              {help !== undefined ? <span className="font-semibold text-ink"> {help.fix}</span> : null}
            </p>
          ) : null}
          {chips.length > 0 && !(single !== undefined && chips.length === 1) ? (
            chips.length <= CHIPS_IN_VIEW ? (
              chipButtons
            ) : (
              <details className="text-[12px]">
                <summary className="cursor-pointer text-ink-3 select-none">
                  {byOpening ? 'Show openings' : 'Show walls'} ({chips.length})
                </summary>
                <div className="mt-1">{chipButtons}</div>
              </details>
            )
          ) : null}
          {!done && fix !== undefined && onQuickFix !== undefined ? <QuickFixRow fix={fix} group={g} current={current} onQuickFix={onQuickFix} /> : null}
          {!done && groupFix !== undefined && onApplyEdits !== undefined ? <GroupFixRow fix={groupFix} groupKey={g.key} draft={draft} onApply={onApplyEdits} /> : null}
          {onReview !== undefined && reviewKeys.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={done ? 'ghost' : 'outline'} size="xs" onClick={() => onReview(reviewKeys, !done)} title={done ? 'Bring it back to the list' : 'I have seen it; take it off the list (it still prints on the panel sheet)'}>
                {done ? 'Undo review' : 'Mark as reviewed'}
              </Button>
              {!done && g.reviewedCount !== undefined && g.reviewedCount > 0 ? <span className="text-[12px] text-ink-3">+ {g.reviewedCount} reviewed</span> : null}
            </div>
          ) : null}
          {!done && settingsAction !== undefined && fix === undefined ? (
            <Button variant={problem ? 'accent' : 'outline'} size="xs" onClick={() => onAction(settingsAction, projectFocus(first))}>
              {ACTION_LABEL[settingsAction]}
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
                      <span className="font-sans">{issueMessage(i)}</span>
                    ) : (
                      <button type="button" className="text-left font-sans underline-offset-2 hover:underline" onClick={() => go(i, t)}>
                        {issueMessage(i)}
                      </button>
                    )}
                    {hasOriginal(i) ? <span className="block text-ink-3">{i.text}</span> : null}
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
      </div>
    </li>
  );
}

/**
 * Conserto em grupo (S49): uma edição para todas as aberturas da causa. Nada entra sem o clique; o que muda o framing
 * diz isso no botão.
 */
function GroupFixRow({ fix, groupKey, draft, onApply }: { fix: GroupFix; groupKey: string; draft: ProjectDraft | undefined; onApply: (edits: DraftEdit[]) => void }) {
  if (fix.kind === 'setHeader') return <SetHeaderForm scopes={fix.scopes} groupKey={groupKey} onApply={onApply} />;
  if (draft === undefined) return null;
  return (
    <div className="flex flex-wrap gap-1">
      <Button variant="outline" size="xs" title="The door rough opening follows the header; the framing does not change" onClick={() => onApply(doorHeightEdits(fix, 'roFromHeader', draft))}>
        Use {formatMeasure(fix.headerBase)} as the door RO height
      </Button>
      <Button variant="outline" size="xs" title="Moves the header of these openings to the door rough opening height" onClick={() => onApply(doorHeightEdits(fix, 'headerFromRo', draft))}>
        Set the header at {formatMeasure(fix.roughHeight)} (changes framing)
      </Button>
    </div>
  );
}

/** "Set header…": seção, plies e (opcional) jacks do engenheiro, para todas as aberturas da linha ou só as de um tipo. */
function SetHeaderForm({ scopes, groupKey, onApply }: { scopes: readonly HeaderScope[]; groupKey: string; onApply: (edits: DraftEdit[]) => void }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState('');
  const [plies, setPlies] = useState('2');
  const [jacks, setJacks] = useState('');
  const [scopeKey, setScopeKey] = useState('all');
  const [error, setError] = useState<string | undefined>(undefined);
  if (!open) {
    return (
      <Button variant="outline" size="xs" onClick={() => setOpen(true)}>
        Set header…
      </Button>
    );
  }
  const scope = scopes.find((s) => s.key === scopeKey) ?? scopes[0]!;
  const id = (name: string): string => `gf-${groupKey}-${name}`;
  const whole = (text: string): number | undefined => (/^[1-9]\d*$/.test(text.trim()) ? Number(text.trim()) : undefined);
  const apply = (): void => {
    const s = section.trim();
    if (!readField(headerSection, s).ok) return setError('Header section: use 2x4…2x12, or LVL / PSL <width>x<depth>.');
    const p = whole(plies);
    if (p === undefined) return setError('Plies: type a whole number, 1 or more.');
    const j = jacks.trim() === '' ? undefined : whole(jacks);
    if (jacks.trim() !== '' && j === undefined) return setError('Jack studs per side: type a whole number, or leave it empty.');
    setError(undefined);
    onApply(setHeaderEdits(scope, { section: s, plies: p, ...(j === undefined ? {} : { jackStuds: j }) }));
    setOpen(false);
  };
  return (
    <div className="space-y-2 rounded-md border border-line bg-paper-2 p-2">
      <div className="grid grid-cols-3 items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={id('section')} className="text-[12px] text-ink-2">
            Header section
          </Label>
          <Input id={id('section')} value={section} placeholder="2x12" className="h-8 font-mono text-[13px]" onChange={(e) => setSection(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={id('plies')} className="text-[12px] text-ink-2">
            Plies
          </Label>
          <Input id={id('plies')} value={plies} inputMode="numeric" className="h-8 text-[13px]" onChange={(e) => setPlies(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={id('jacks')} className="text-[12px] text-ink-2">
            Jack studs per side
          </Label>
          <Input id={id('jacks')} value={jacks} inputMode="numeric" placeholder="auto" className="h-8 text-[13px]" onChange={(e) => setJacks(e.target.value)} />
        </div>
      </div>
      {scopes.length > 1 ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Apply to">
          {scopes.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={s.key === scope.key}
              onClick={() => setScopeKey(s.key)}
              className={cn('rounded-sm border px-1.5 text-[11px] transition-colors hover:border-line-strong', s.key === scope.key ? 'border-navy-900 bg-navy-900 text-paper' : 'border-line text-ink-2')}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      {error !== undefined ? (
        <p className="text-[12px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-1">
        <Button variant="accent" size="xs" onClick={apply}>
          Apply to {scope.key === 'all' ? scope.label.charAt(0).toLowerCase() + scope.label.slice(1) : scope.label}
        </Button>
        <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] leading-snug text-ink-3">The header from the engineer goes on each opening; king studs still come from the wind table. Undo (Ctrl+Z) reverts all of them at once.</p>
    </div>
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
