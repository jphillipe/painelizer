'use client';

import { OctagonXIcon } from 'lucide-react';
import { useCallback, useMemo, useRef, useEffect, type Dispatch } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { breaksByWall, shownBreaks } from '@/lib/editor/breaks';
import type { ProjectDraft } from '@/lib/editor/draft';
import { geometryIssues, planGeometry, type PlanGeometry } from '@/lib/editor/geometry';
import { readingWarningResolved } from '@/lib/editor/issue-help';
import { dropRepeated, groupIssues } from '@/lib/editor/issue-groups';
import { projectDataNeeds } from '@/lib/editor/requirements';
import { byWall, countIssues, draftIssues, idIndex, issueFromNotice, parseEngineResult, type Issue } from '@/lib/editor/problems';
import { provenanceIndex } from '@/lib/editor/provenance';
import type { EditorAction, EditorState } from '@/lib/editor/state';
import { projectSlug } from '@/lib/files';
import { EditorContext, useProjectIO, type EditorContextValue } from './editor-context';
import type { CheckState } from './use-project-check';
import { Workspace } from './workspace';

export interface WallEditorProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  check: CheckState;
}

/**
 * Passo 02 (S21): a camada de dados do editor — geometria da planta, issues (modelo + geometria + motor + leitura),
 * proveniência da IA, quebras de painel — publicada no `EditorContext` (S30). A interface é o `Workspace` (S21.4);
 * o que vem de fora (leitura, gerar, desenhos, auto-save) chega pelo `ProjectIOContext`.
 */
export function WallEditor({ state, dispatch: rawDispatch, check }: WallEditorProps) {
  const { draft } = state;
  const { outcome } = useProjectIO();
  // Remover parede/abertura avisa com "Undo" (M2): o Undo do toast só vale enquanto nada mais foi editado.
  const latest = useRef(state);
  latest.current = state;
  const dispatch = useCallback<Dispatch<EditorAction>>(
    (action) => {
      const label = removalLabel(latest.current.draft, action);
      rawDispatch(action);
      if (label === undefined) return;
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
  const geometry = useMemo<PlanGeometry | undefined>(() => (draft === undefined ? undefined : planGeometry(draft, lastGood.current)), [draft]);
  useEffect(() => {
    if (geometry !== undefined && geometry.houseError === undefined && geometry.walls.length > 0) lastGood.current = geometry;
  }, [geometry]);
  const ids = useMemo(() => (draft === undefined ? { walls: [], openings: new Map<string, string[]>() } : idIndex(draft)), [draft]);
  const issues = useMemo<Issue[]>(() => {
    if (draft === undefined) return [];
    const own = draftIssues(draft, state.loadProblems);
    // S45: com erro, a checagem ainda traz os avisos das paredes que o motor montou — a lista mostra os dois.
    const engine = check.result === undefined ? [] : dropRepeated(parseEngineResult(check.result.ok ? { warnings: check.result.warnings } : { problems: check.result.problems, warnings: check.result.warnings ?? [] }, ids), own);
    // A geometria no cliente vê o mesmo erro que o motor dirá (etapa da planta): não repetir quando a checagem já
    // chegou — mesmo código na mesma parede.
    const said = new Set(engine.map((i) => `${i.code ?? ''}:${i.wallId ?? ''}`));
    const geo = geometry === undefined ? [] : geometryIssues(geometry, ids).filter((i) => !said.has(`${i.code ?? ''}:${i.wallId ?? ''}`));
    // Avisos da leitura são fixos: somem quando o draft já os resolveu (abertura adicionada, header dado).
    const reading = (outcome?.warnings ?? [])
      .filter((w) => w.source === 'extraction')
      .map((w) => issueFromNotice(w, 'warning', ids))
      .filter((i) => !readingWarningResolved(i, draft));
    return [...own, ...geo, ...engine, ...reading];
  }, [draft, state.loadProblems, check.result, outcome, geometry, ids]);
  const issuesByWall = useMemo(() => byWall(issues), [issues]);
  const groups = useMemo(() => groupIssues(issues, ids), [issues, ids]);
  // Quebras de painel (S29): candidatos da última checagem; as do revisor vêm do draft (valem antes da resposta).
  const breakInfo = useMemo(() => breaksByWall(check.result), [check.result]);
  const breaks = useMemo(() => new Map((draft?.walls ?? []).map((w) => [w.id, shownBreaks(w, breakInfo.get(w.id))])), [draft?.walls, breakInfo]);

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
  const value: EditorContextValue = {
    state,
    draft,
    dispatch,
    geometry,
    issues,
    issuesByWall,
    groups,
    provenance,
    breaks,
    check,
    counts,
    ready: check.status === 'done' && !check.stale && counts.problems === 0,
    needs,
    needsData: outcome !== undefined && needs.required.length > 0,
    name,
    slug: projectSlug(name),
  };
  return (
    <EditorContext value={value}>
      {/* Um `load` (outro projeto, leitura reconvertida) remonta o workspace: aba, filtro e card dispensado voltam ao
          início. Editar, renomear e o reducer reexecutado pelo React não remontam (`EditorState.loads`). */}
      <Workspace key={state.loads} />
    </EditorContext>
  );
}

/** O que uma ação de remoção vai tirar ("wall W02", "3 walls", "opening J1"); `undefined` quando não remove nada. */
function removalLabel(d: ProjectDraft | undefined, action: EditorAction): string | undefined {
  if (d === undefined) return undefined;
  if (action.type === 'removeWall') return d.walls.some((w) => w.id === action.wallId) ? `wall ${action.wallId}` : undefined;
  if (action.type === 'removeWalls') {
    const n = d.walls.filter((w) => action.wallIds.includes(w.id)).length;
    return n === 0 ? undefined : n === 1 ? `wall ${d.walls.find((w) => action.wallIds.includes(w.id))!.id}` : `${n} walls`;
  }
  if (action.type === 'removeOpening') return d.walls.find((w) => w.id === action.wallId)?.openings.some((o) => o.id === action.openingId) === true ? `opening ${action.openingId}` : undefined;
  return undefined;
}
