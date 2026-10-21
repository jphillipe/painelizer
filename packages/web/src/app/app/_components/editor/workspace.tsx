'use client';

import { useRef, useState, type Dispatch, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { downloadText } from '@/lib/download';
import { wallById, type ProjectDraft } from '@/lib/editor/draft';
import { projectFileName, projectFileText } from '@/lib/editor/project-file';
import type { PlanGeometry } from '@/lib/editor/geometry';
import type { IssueGroup } from '@/lib/editor/issue-groups';
import type { Issue } from '@/lib/editor/problems';
import type { WallProvenance } from '@/lib/editor/provenance';
import type { ProjectDataNeeds } from '@/lib/editor/requirements';
import { reviewedCount, type EditorAction, type EditorState, type Selection } from '@/lib/editor/state';
import type { LevelFilter } from '@/lib/editor/wall-filters';
import { useMediaQuery, WIDE_QUERY } from '@/lib/use-media-query';
import type { ExtractOutcome } from '@/types/extract';
import { ProjectDataForm } from '../project-data-form';
import { EditorToolbar } from './editor-toolbar';
import { EditorTopBar, type TopBarMenuItem } from './editor-top-bar';
import { Inspector } from './inspector';
import { IssueGroupsList } from './issue-groups-list';
import { Navigator, type NavigatorTab } from './navigator';
import { PlanCanvas, type PlanCanvasHandle } from './plan-canvas';
import { ProjectSettingsDialog } from './project-settings-dialog';
import { ReadingPanel } from './reading-panel';
import { ShortcutsDialog } from './shortcuts-dialog';
import { CalibrationBanner, UnderlayControls, calibrationPoint, withPixelAt, type Calibration } from './underlay-controls';
import { UnderlayDialog } from './underlay-dialog';
import { underlayOf, type Underlay } from '@/lib/editor/underlay';
import { WallElevation } from './wall-elevation';
import type { CheckState } from './use-project-check';
import { WallRows } from './wall-rows';

export interface WorkspaceProps {
  state: EditorState;
  draft: ProjectDraft;
  dispatch: Dispatch<EditorAction>;
  geometry: PlanGeometry | undefined;
  issues: readonly Issue[];
  issuesByWall: ReadonlyMap<string | undefined, Issue[]>;
  groups: readonly IssueGroup[];
  provenance: ReadonlyMap<string, WallProvenance>;
  outcome: Extract<ExtractOutcome, { ok: true }> | undefined;
  check: CheckState;
  counts: { problems: number; warnings: number };
  ready: boolean;
  pending: boolean;
  /** A leitura veio sem altura / precuts: oferecer o card "Before you review". */
  needsData: boolean;
  /** O que o motor exige deste projeto (lib/editor/requirements). */
  needs: ProjectDataNeeds;
  name: string;
  slug: string;
  onGenerate: () => void;
  onOutcome: (outcome: ExtractOutcome) => void;
  /** `StepBar` compacta, para a top bar. */
  steps: ReactNode;
  onStartOver: () => void;
  /** Lista de atalhos (M5), aberta por ? (WallEditor) ou pelo botão da toolbar. */
  help: { open: boolean; onOpenChange: (open: boolean) => void };
  /** Arquivos soltos no passo 01, para a planta por baixo (M6). */
  sourceFiles?: readonly File[] | undefined;
}

/**
 * Workspace do passo 02 (S21.4, docs/10-design.md §4): top bar, navegador (Walls / Issues / Reading), planta no
 * centro e inspetor à direita; abaixo de `lg`, planta em cima e abas embaixo (inspetor vira aba). Só estado de
 * interface aqui (aba, card de setup dispensado); o projeto continua no reducer. Remontado por `key` quando
 * outro projeto entra.
 */
export function Workspace({ state, draft, dispatch, geometry, issues, issuesByWall, groups, provenance, outcome, check, counts, ready, pending, needsData, needs, name, slug, onGenerate, onOutcome, steps, onStartOver, help, sourceFiles = [] }: WorkspaceProps) {
  const wide = useMediaQuery(WIDE_QUERY);
  const [tab, setTab] = useState<string>(() => (counts.problems > 0 ? 'issues' : 'walls'));
  const [dismissed, setDismissed] = useState(false);
  // Pavimento (M5): um só filtro para a planta e a lista.
  const [level, setLevel] = useState<LevelFilter>('all');
  // Planta do arquiteto por baixo (M6): dialog de escolha e calibração em curso.
  const [underlayOpen, setUnderlayOpen] = useState(false);
  const [calibration, setCalibration] = useState<Calibration | undefined>(undefined);
  const underlay = underlayOf(draft);
  const setUnderlay = (u: Underlay | undefined): void => dispatch({ type: 'setUnderlay', underlay: u });
  const onCalibrationPoint = (p: { x: number; y: number }): void => {
    if (underlay === undefined || calibration === undefined) return;
    const px = calibrationPoint(underlay, p);
    if (calibration.kind === 'origin') {
      setUnderlay(withPixelAt(underlay, px, { x: 0, y: 0 }));
      setCalibration(undefined);
    } else if (calibration.points.length < 2) {
      setCalibration({ kind: 'scale', points: [...calibration.points, px] });
    }
  };
  const canvas = useRef<PlanCanvasHandle>(null);

  const select = (selection: Selection): void => dispatch({ type: 'select', selection });
  /** Seleção vinda de uma lista: traz a parede para a vista e, em tela estreita, abre o inspetor. */
  const selectFromList = (selection: Selection): void => {
    select(selection);
    if (selection.kind === 'wall' || selection.kind === 'opening') canvas.current?.focusWall(selection.wallId);
    if (!wide) setTab('inspector');
  };
  const openSettings = (): void => select({ kind: 'project' });
  const settingsOpen = state.selection.kind === 'project';
  const setupVisible = needsData && outcome !== undefined && !dismissed;

  const menu: TopBarMenuItem[] = [
    // Um arquivo só (M2): o projeto do CLI com a leitura da IA dentro (`$panelizer`); reabre no app com a proveniência.
    { label: 'Download project file', onSelect: () => downloadText(projectFileName(slug), projectFileText(draft, outcome)) },
    { label: 'Project settings', separator: true, onSelect: openSettings },
    { label: 'Start over', separator: true, destructive: true, onSelect: onStartOver },
  ];

  const toolbar = (
    <>
      <UnderlayControls underlay={underlay} calibration={calibration} onCalibration={setCalibration} onChoose={() => setUnderlayOpen(true)} onChange={setUnderlay} onView={(view) => dispatch({ type: 'setUnderlayView', ...view })} />
      <span className="mx-1 h-4 w-px bg-line" aria-hidden />
      <EditorToolbar state={state} dispatch={dispatch} embedded onHelp={() => help.onOpenChange(true)} />
    </>
  );
  const selectedWall = state.selection.kind === 'wall' || state.selection.kind === 'opening' ? wallById(draft, state.selection.wallId) : undefined;
  const reviewed = outcome !== undefined || reviewedCount(draft.walls) > 0 ? { done: reviewedCount(draft.walls), total: draft.walls.length } : undefined;
  const center = setupVisible ? (
    <Card className="step-enter workspace-pane flex-1 gap-0 p-6 md:p-8">
      <ProjectDataForm outcome={outcome} onOutcome={onOutcome} variant="setup" needs={needs} confirm={state.dirty} onSkip={() => setDismissed(true)} />
    </Card>
  ) : geometry !== undefined && (geometry.walls.length > 0 || geometry.broken.length > 0 || (underlay !== undefined && geometry.format !== 'loose')) ? (
    <PlanCanvas
      ref={canvas}
      fill
      toolbar={toolbar}
      geometry={geometry}
      selection={state.selection}
      issuesByWall={issuesByWall}
      northAngle={draft.northAngle}
      fitKey={`${state.source ?? ''}:${name}:${draft.walls.length}`}
      onSelect={select}
      onEndpointDrag={(wallId, end, point, txn) => dispatch({ type: 'moveEndpoint', wallId, end, point, txn })}
      onOpeningDrag={(wallId, openingId, s0, roughWidth, txn) => dispatch({ type: 'moveOpening', wallId, openingId, s0, roughWidth, txn })}
      onWallNudge={(wallId, dx, dy, txn) => dispatch({ type: 'moveWall', wallId, dx, dy, txn })}
      onDragEnd={() => dispatch({ type: 'endTransaction' })}
      level={level}
      onLevel={setLevel}
      underlay={underlay}
      onCalibrationPoint={calibration === undefined ? undefined : onCalibrationPoint}
      onCalibrationCancel={() => setCalibration(undefined)}
      overlay={underlay !== undefined && calibration !== undefined ? <CalibrationBanner underlay={underlay} calibration={calibration} onCalibration={setCalibration} onChange={setUnderlay} /> : undefined}
    />
  ) : (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-end gap-1">{toolbar}</div>
      {selectedWall !== undefined ? (
        // Projeto solto (M5): a elevação esquemática da parede selecionada no lugar da caixa vazia.
        <WallElevation draft={draft} wall={selectedWall} selection={state.selection} onSelect={select} className="min-h-0 flex-1" />
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed bg-paper-2 p-6 text-center text-sm text-ink-3">
          {draft.walls.length === 0 ? 'No walls yet. Add one with the toolbar.' : 'Walls given by length only, so there is no plan. Pick a wall in the list to see its elevation and edit it.'}
        </div>
      )}
    </div>
  );

  const navTabs: NavigatorTab[] = [
    { id: 'walls', label: 'Walls', count: draft.walls.length, content: <WallRows draft={draft} selection={state.selection} provenance={provenance} issuesByWall={issuesByWall} onSelect={selectFromList} level={level} /> },
    {
      id: 'issues',
      label: 'Issues',
      count: counts.problems + counts.warnings,
      alert: counts.problems > 0,
      content: (
        <IssueGroupsList
          groups={groups}
          stale={check.stale}
          checking={check.status === 'checking'}
          selection={state.selection}
          onSelect={selectFromList}
          onAction={(a) => {
            if (a === 'projectData' && outcome !== undefined) setDismissed(false);
            else openSettings();
          }}
          current={{ windSpeed: draft.config.building?.windSpeed, headerHeight: draft.config.headerHeight }}
          onQuickFix={(fix) => {
            if (fix.kind === 'wind') dispatch({ type: 'updateBuilding', patch: { windSpeed: fix.value } });
            else if (fix.kind === 'headerHeight') dispatch({ type: 'updateConfig', patch: { headerHeight: fix.value } });
            else {
              // A abertura que a leitura não posicionou nasce no centro da parede, já selecionada; o canvas vai até ela.
              dispatch({ type: 'addOpening', wallId: fix.wallId, preset: { id: fix.openingId, ...(fix.tag !== undefined ? { tag: fix.tag } : {}) } });
              canvas.current?.focusWall(fix.wallId);
              if (!wide) setTab('inspector');
            }
          }}
        />
      ),
    },
    { id: 'reading', label: 'Reading', content: <ReadingPanel outcome={outcome} source={state.source} slug={slug} /> },
  ];
  const inspector = <Inspector state={state} draft={draft} dispatch={dispatch} provenance={provenance} issues={issues} outcome={outcome} onOutcome={onOutcome} showProjectData={false} flat />;

  return (
    <div className="step-enter flex min-h-0 flex-1 flex-col">
      <EditorTopBar name={name} walls={draft.walls.length} reviewed={reviewed} openings={draft.walls.reduce((n, w) => n + w.openings.length, 0)} check={check} problems={counts.problems} warnings={counts.warnings} ready={ready} pending={pending} needsData={needsData} onGenerate={onGenerate} steps={steps} menu={menu} />
      {wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_320px] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <aside className="flex min-h-0 flex-col border-r border-line bg-card" aria-label="Navigator">
            <Navigator tab={tab === 'inspector' ? 'walls' : tab} onTab={setTab} tabs={navTabs} />
          </aside>
          <section className="flex min-h-0 flex-col p-3" aria-label="Plan">
            {center}
          </section>
          <aside className="workspace-pane border-l border-line bg-card" aria-label="Properties">
            {inspector}
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <section className="h-[45dvh] shrink-0 border-b border-line p-3" aria-label="Plan">
            {center}
          </section>
          <Navigator tab={tab} onTab={setTab} tabs={[...navTabs, { id: 'inspector', label: 'Inspector', content: <div className="workspace-pane flex-1">{inspector}</div> }]} className="bg-card" />
        </div>
      )}
      <ShortcutsDialog open={help.open} onOpenChange={help.onOpenChange} />
      <UnderlayDialog open={underlayOpen} onOpenChange={setUnderlayOpen} sourceFiles={sourceFiles} bounds={geometry?.bounds} onPick={setUnderlay} />
      <ProjectSettingsDialog open={settingsOpen} onOpenChange={(open) => !open && select({ kind: 'none' })} draft={draft} dispatch={dispatch} outcome={outcome} dirty={state.dirty} onOutcome={onOutcome} />
    </div>
  );
}
