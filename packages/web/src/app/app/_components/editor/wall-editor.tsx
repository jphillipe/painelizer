'use client';

import { OctagonXIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { ProjectDraft } from '@/lib/editor/draft';
import { geometryIssues, planGeometry, type PlanGeometry } from '@/lib/editor/geometry';
import { readingWarningResolved } from '@/lib/editor/issue-help';
import { dropRepeated, groupIssues } from '@/lib/editor/issue-groups';
import { projectDataNeeds } from '@/lib/editor/requirements';
import { byWall, countIssues, draftIssues, idIndex, parseEngineResult, parseWarning, type Issue } from '@/lib/editor/problems';
import { provenanceIndex } from '@/lib/editor/provenance';
import type { EditorAction, EditorState } from '@/lib/editor/state';
import { projectSlug } from '@/lib/files';
import type { ExtractOutcome } from '@/types/extract';
import { useEditorShortcuts } from './use-editor-shortcuts';
import type { CheckState } from './use-project-check';
import { Workspace } from './workspace';

export interface WallEditorProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  /** Leitura da IA de onde o projeto veio (proveniência, notas, relatório); ausente para exemplo e arquivo. */
  outcome: Extract<ExtractOutcome, { ok: true }> | undefined;
  check: CheckState;
  pending: boolean;
  onGenerate: () => void;
  onOutcome: (outcome: ExtractOutcome) => void;
  /** `StepBar` compacta para a top bar do workspace. */
  steps: ReactNode;
  onStartOver: () => void;
  /** Arquivos soltos no passo 01 (M6: planta por baixo). */
  sourceFiles?: readonly File[] | undefined;
}

/**
 * Passo 02 (S21): a camada de dados do editor — geometria da planta, issues (modelo + geometria + motor + leitura),
 * proveniência da IA — e os atalhos. A interface é o `Workspace` (S21.4).
 */
export function WallEditor({ state, dispatch: rawDispatch, outcome, check, pending, onGenerate, onOutcome, steps, onStartOver, sourceFiles }: WallEditorProps) {
  const { draft } = state;
  // Remover parede/abertura avisa com "Undo" (M2): o Undo do toast só vale enquanto nada mais foi editado.
  const latest = useRef(state);
  latest.current = state;
  const dispatch = useCallback<Dispatch<EditorAction>>(
    (action) => {
      if (action.type !== 'removeWall' && action.type !== 'removeOpening') {
        rawDispatch(action);
        return;
      }
      const d = latest.current.draft;
      const wall = d?.walls.find((w) => w.id === action.wallId);
      const exists = action.type === 'removeWall' ? wall !== undefined : wall?.openings.some((o) => o.id === action.openingId) === true;
      rawDispatch(action);
      if (!exists) return;
      const label = action.type === 'removeWall' ? `wall ${action.wallId}` : `opening ${action.openingId}`;
      const after = latest.current.revision + 1;
      toast(`Removed ${label}`, {
        action: {
          label: 'Undo',
          onClick: () => {
            if (latest.current.revision === after) rawDispatch({ type: 'undo' });
            else toast.error('Other edits came after; use Undo in the toolbar.');
          },
        },
      });
    },
    [rawDispatch],
  );
  const provenance = useMemo(() => provenanceIndex(outcome?.walls), [outcome]);
  // Última geometria em que a casa fechava: no fallback (casa aberta no meio de um arraste), as paredes não
  // citadas no erro mantêm as plates dela em vez de pular para o eixo nu (anti-flicker).
  const lastGood = useRef<PlanGeometry | undefined>(undefined);
  const lastLoaded = useRef<ProjectDraft | undefined>(undefined);
  const loadId = useRef(0);
  const geometry = useMemo<PlanGeometry | undefined>(() => (draft === undefined ? undefined : planGeometry(draft, lastGood.current)), [draft]);
  useEffect(() => {
    if (geometry !== undefined && geometry.houseError === undefined && geometry.walls.length > 0) lastGood.current = geometry;
  }, [geometry]);
  const ids = useMemo(() => (draft === undefined ? { walls: [], openings: new Map<string, string[]>() } : idIndex(draft)), [draft]);
  const issues = useMemo<Issue[]>(() => {
    if (draft === undefined) return [];
    const own = draftIssues(draft, state.loadProblems);
    const engine = check.result === undefined ? [] : dropRepeated(parseEngineResult(check.result.ok ? { warnings: check.result.warnings } : { problems: check.result.problems }, ids), own);
    // A geometria no cliente vê o mesmo erro que o motor dirá ("planta: …"): não repetir quando a checagem já chegou.
    const said = new Set(engine.map((i) => i.text.replace(/^(planta|motor): /, '')));
    const geo = geometry === undefined ? [] : geometryIssues(geometry, ids).filter((i) => !said.has(i.text));
    // Avisos da leitura são texto fixo: somem quando o draft já os resolveu (abertura adicionada, header dado).
    const reading = (outcome?.warnings ?? [])
      .filter((w) => w.startsWith('extração '))
      .map((w) => parseWarning(w, ids))
      .filter((i) => !readingWarningResolved(i, draft));
    return [...own, ...geo, ...engine, ...reading];
  }, [draft, state.loadProblems, check.result, outcome, geometry, ids]);
  const issuesByWall = useMemo(() => byWall(issues), [issues]);
  const groups = useMemo(() => groupIssues(issues, ids), [issues, ids]);
  // Lista de atalhos (M5): `?` ou o botão da toolbar.
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  useEditorShortcuts(state, dispatch, draft !== undefined, { onHelp: openHelp });

  if (draft === undefined) {
    return (
      <div className="container-site py-8">
        <Alert variant="destructive">
          <OctagonXIcon />
          <AlertTitle>This project can’t be opened</AlertTitle>
          <AlertDescription>{state.loadError ?? 'Upload drawings, pick a sample or open a project file.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const name = draft.name ?? outcome?.projectName ?? 'Untitled project';
  const counts = countIssues(issues);
  // O que o motor vai exigir, lido do próprio draft (antes da checagem): o card de setup pede tudo de uma vez.
  const needs = projectDataNeeds(draft);
  const needsData = outcome !== undefined && needs.required.length > 0;
  const ready = check.status === 'done' && !check.stale && counts.problems === 0;
  // Um `load` (outro projeto, leitura reconvertida) zera histórico e `dirty`: é quando o workspace remonta
  // (aba, filtro e card dispensado voltam ao início). Renomear o projeto ou editar não remonta.
  if (draft !== lastLoaded.current && state.past.length === 0 && state.future.length === 0 && !state.dirty) {
    lastLoaded.current = draft;
    loadId.current += 1;
  }

  return (
    <Workspace
      key={`${state.source ?? ''}:${loadId.current}`}
      state={state}
      draft={draft}
      dispatch={dispatch}
      geometry={geometry}
      issues={issues}
      issuesByWall={issuesByWall}
      groups={groups}
      provenance={provenance}
      outcome={outcome}
      check={check}
      counts={counts}
      ready={ready}
      pending={pending}
      needsData={needsData}
      needs={needs}
      name={name}
      slug={projectSlug(name)}
      onGenerate={onGenerate}
      onOutcome={onOutcome}
      steps={steps}
      onStartOver={onStartOver}
      help={{ open: helpOpen, onOpenChange: setHelpOpen }}
      sourceFiles={sourceFiles}
    />
  );
}
