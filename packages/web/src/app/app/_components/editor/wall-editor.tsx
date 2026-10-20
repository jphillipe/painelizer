'use client';

import { DownloadIcon, Loader2Icon, OctagonXIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, type Dispatch } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { downloadText } from '@/lib/download';
import { draftFormat, openingCount, textFromDraft } from '@/lib/editor/draft';
import { geometryIssues, planGeometry, type PlanGeometry } from '@/lib/editor/geometry';
import { byWall, countIssues, draftIssues, idIndex, parseEngineResult, parseWarning, type Issue } from '@/lib/editor/problems';
import { provenanceIndex } from '@/lib/editor/provenance';
import type { EditorAction, EditorState } from '@/lib/editor/state';
import { projectSlug } from '@/lib/files';
import type { ExtractOutcome } from '@/types/extract';
import { ProjectDataForm } from '../project-data-form';
import { EditorToolbar } from './editor-toolbar';
import { Inspector } from './inspector';
import { IssuesList } from './issues-list';
import { PlanCanvas } from './plan-canvas';
import { useEditorShortcuts } from './use-editor-shortcuts';
import type { CheckState } from './use-project-check';
import { WallList } from './wall-list';

export interface WallEditorProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** Leitura da IA de onde o projeto veio (proveniência, notas, relatório); ausente para exemplo e arquivo. */
  outcome: Extract<ExtractOutcome, { ok: true }> | undefined;
  check: CheckState;
  pending: boolean;
  onGenerate: () => void;
  onOutcome: (outcome: ExtractOutcome) => void;
}

const FORMAT_LABEL = { plan: 'in plan', loose: 'by length', mixed: 'mixed formats', empty: 'no walls' } as const;

/**
 * Passo 02 (S21): o projeto como o editor o vê — cabeçalho, toolbar, issues (modelo + motor) e lista de paredes à
 * esquerda, inspetor à direita, notas da IA e "Generate panels". S21.1: edição pelo inspetor; canvas na S21.2.
 */
export function WallEditor({ state, dispatch, outcome, check, pending, onGenerate, onOutcome }: WallEditorProps) {
  const { draft } = state;
  const provenance = useMemo(() => provenanceIndex(outcome?.walls), [outcome]);
  // Última geometria em que a casa fechava: no fallback (casa aberta no meio de um arraste), as paredes não
  // citadas no erro mantêm as plates dela em vez de pular para o eixo nu (anti-flicker).
  const lastGood = useRef<PlanGeometry | undefined>(undefined);
  const geometry = useMemo<PlanGeometry | undefined>(() => (draft === undefined ? undefined : planGeometry(draft, lastGood.current)), [draft]);
  useEffect(() => {
    if (geometry !== undefined && geometry.houseError === undefined && geometry.walls.length > 0) lastGood.current = geometry;
  }, [geometry]);
  const issues = useMemo<Issue[]>(() => {
    if (draft === undefined) return [];
    const ids = idIndex(draft);
    const own = draftIssues(draft, state.loadProblems);
    const engine = check.result === undefined ? [] : parseEngineResult(check.result.ok ? { warnings: check.result.warnings } : { problems: check.result.problems }, ids);
    // A geometria no cliente vê o mesmo erro que o motor dirá ("planta: …"): não repetir quando a checagem já chegou.
    const said = new Set(engine.map((i) => i.text.replace(/^(planta|motor): /, '')));
    const geo = geometry === undefined ? [] : geometryIssues(geometry, ids).filter((i) => !said.has(i.text));
    const reading = (outcome?.warnings ?? []).filter((w) => w.startsWith('extração ')).map((w) => parseWarning(w, ids));
    return [...own, ...geo, ...engine, ...reading];
  }, [draft, state.loadProblems, check.result, outcome, geometry]);
  const issuesByWall = useMemo(() => byWall(issues), [issues]);
  useEditorShortcuts(state, dispatch, draft !== undefined);

  if (draft === undefined) {
    return (
      <Alert variant="destructive">
        <OctagonXIcon />
        <AlertTitle>This project can’t be opened</AlertTitle>
        <AlertDescription>{state.loadError ?? 'Upload drawings, pick a sample or open a project file.'}</AlertDescription>
      </Alert>
    );
  }

  const name = draft.name ?? outcome?.projectName ?? 'Untitled project';
  const format = draftFormat(draft);
  const counts = countIssues(issues);
  const lowConfidence = [...provenance.values()].filter((p) => p.confidence < 0.7 || [...p.openings.values()].some((o) => o.confidence < 0.7)).length;
  const needsData = outcome !== undefined && (issues.some((i) => i.source === 'draft' && /height is missing|studLength/.test(i.text)) || issues.some((i) => /config\.building|floorsSupported/.test(i.text)));
  const ready = check.status === 'done' && !check.stale && counts.problems === 0;
  const slug = projectSlug(name);
  const select = (selection: EditorState['selection']): void => dispatch({ type: 'select', selection });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2">{name}</h2>
        <Badge variant="secondary">{draft.walls.length} walls</Badge>
        <Badge variant="secondary">{openingCount(draft)} openings</Badge>
        <Badge variant={format === 'mixed' ? 'destructive' : 'secondary'}>{FORMAT_LABEL[format]}</Badge>
        {state.dirty ? <Badge variant="outline">edited</Badge> : null}
        {lowConfidence > 0 ? <Badge className="bg-destructive text-paper">{lowConfidence} to double-check</Badge> : null}
        <CheckBadge check={check} problems={counts.problems} warnings={counts.warnings} />
        <span className="text-sm text-ink-3">
          {outcome !== undefined
            ? `${outcome.model}${outcome.pagesSent.length > 0 ? ` · ${outcome.pagesSent.map((p) => `${p.name} p.${p.pages.join(',')}`).join(' · ')}` : ''}`
            : state.source === 'sample'
              ? 'sample project'
              : 'project file'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-ink-2">
          {outcome !== undefined ? `Origin: ${outcome.origin}` : format === 'plan' ? 'Walls on the plan axis, inches from the project origin.' : 'Walls by length; no plan geometry.'}
        </p>
        {outcome !== undefined ? (
          <Button variant="outline" size="sm" disabled={outcome.output === undefined} onClick={() => downloadText(`${slug}-reading.json`, JSON.stringify(outcome.output, null, 2))}>
            <DownloadIcon /> Download reading
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => downloadText(`${slug}-project.json`, textFromDraft(draft))}>
          <DownloadIcon /> Download project
        </Button>
      </div>

      {needsData && outcome !== undefined ? <ProjectDataForm outcome={outcome} onOutcome={onOutcome} highlight confirm={state.dirty} /> : null}

      <EditorToolbar state={state} dispatch={dispatch} />

      <div className="grid gap-4 lg:grid-cols-[7fr_5fr] lg:items-start">
        <div className="min-w-0 space-y-4">
          {geometry !== undefined && (geometry.walls.length > 0 || geometry.broken.length > 0) ? (
            <PlanCanvas
              geometry={geometry}
              selection={state.selection}
              issuesByWall={issuesByWall}
              northAngle={draft.northAngle}
              fitKey={`${state.source ?? ''}:${name}:${draft.walls.length}`}
              onSelect={select}
              onEndpointDrag={(wallId, end, point, txn) => dispatch({ type: 'moveEndpoint', wallId, end, point, txn })}
              onOpeningDrag={(wallId, openingId, s0, roughWidth, txn) => dispatch({ type: 'moveOpening', wallId, openingId, s0, roughWidth, txn })}
              onDragEnd={() => dispatch({ type: 'endTransaction' })}
            />
          ) : null}
          <IssuesList issues={issues} stale={check.stale} checking={check.status === 'checking'} selection={state.selection} onSelect={select} />
          <WallList draft={draft} selection={state.selection} provenance={provenance} issuesByWall={issuesByWall} onSelect={select} />
          {outcome !== undefined && outcome.notes.length > 0 ? (
            <div className="rounded-md border bg-paper-2 p-4 text-sm">
              <p className="eyebrow mb-2">Notes from the AI</p>
              <ul className="list-disc space-y-1 pl-4">
                {outcome.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {outcome !== undefined ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-2">Full review report</summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-card p-3 whitespace-pre-wrap">{outcome.report}</pre>
            </details>
          ) : null}
        </div>
        <div className="min-w-0 lg:sticky lg:top-4">
          <Inspector state={state} draft={draft} dispatch={dispatch} provenance={provenance} issues={issues} outcome={outcome} onOutcome={onOutcome} showProjectData={!needsData} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="accent" disabled={pending || !ready} onClick={onGenerate}>
          {pending ? (
            <>
              <Loader2Icon className="animate-spin" /> Generating…
            </>
          ) : (
            'Generate panels'
          )}
        </Button>
        <span className="text-sm text-ink-3" aria-live="polite">
          {counts.problems > 0
            ? needsData
              ? 'Fill in the project data above and apply it, or set the heights per wall.'
              : 'Fix the problems above; the engine can’t build the project as it is.'
            : check.status === 'done' && !check.stale
              ? 'Deterministic: same input, same sheets.'
              : check.status === 'error'
                ? (check.error ?? 'Could not check the project.')
                : 'Checking with the engine…'}
        </span>
      </div>
    </div>
  );
}

function CheckBadge({ check, problems, warnings }: { check: CheckState; problems: number; warnings: number }) {
  if (check.status === 'checking' || check.stale) return <Badge variant="outline">Checking…</Badge>;
  if (check.status === 'error') return <Badge className="bg-destructive text-paper">check failed</Badge>;
  if (check.status !== 'done') return null;
  if (problems > 0) return <Badge className="bg-destructive text-paper">{problems} problem{problems === 1 ? '' : 's'}</Badge>;
  const panels = check.result?.ok ? check.result.panels.length : 0;
  return (
    <>
      <Badge className="bg-success text-paper">Ready · {panels} panels</Badge>
      {warnings > 0 ? <Badge className="bg-warning text-paper">{warnings} warning{warnings === 1 ? '' : 's'}</Badge> : null}
    </>
  );
}
