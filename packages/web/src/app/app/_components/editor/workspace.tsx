'use client';

import { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { downloadText } from '@/lib/download';
import { wallById } from '@/lib/editor/draft';
import { extraDrawingsOf } from '@/lib/drawings';
import { projectFileName, projectFileText } from '@/lib/editor/project-file';
import { reviewedCount, selectedWallIds, viewedUnderlay, type Selection } from '@/lib/editor/state';
import type { Underlay } from '@/lib/editor/underlay';
import type { LevelFilter } from '@/lib/editor/wall-filters';
import { useMediaQuery, WIDE_QUERY } from '@/lib/use-media-query';
import { ProjectDataForm } from '../project-data-form';
import { useEditor, useProjectIO } from './editor-context';
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
import { useEditorShortcuts } from './use-editor-shortcuts';
import { WallElevation } from './wall-elevation';
import { WallRows } from './wall-rows';

/**
 * Workspace do passo 02 (S21.4, docs/10-design.md §4): top bar, navegador (Walls / Issues / Reading), planta no
 * centro e inspetor à direita; abaixo de `lg`, planta em cima e abas embaixo (inspetor vira aba). Lê o editor e o
 * projeto dos contextos (S30); aqui só estado de interface (aba, card de setup dispensado, pavimento, underlay,
 * "Draw wall", atalhos). Remontado por `key` quando outro projeto entra.
 */
export function Workspace() {
  const { state, draft, dispatch, geometry, issuesByWall, breaks, groups, provenance, check, counts, ready, needs, needsData, name, slug } = useEditor();
  const { outcome, onOutcome, pending, onGenerate, steps, onStartOver, sourceFiles, storedDrawings, storage, save, onRetrySave, saveActions } = useProjectIO();
  const wide = useMediaQuery(WIDE_QUERY);
  const [tab, setTab] = useState<string>(() => (counts.problems > 0 ? 'issues' : 'walls'));
  const [dismissed, setDismissed] = useState(false);
  // Pavimento (M5): um só filtro para a planta e a lista.
  const [level, setLevel] = useState<LevelFilter>('all');
  // Planta do arquiteto por baixo (M6): dialog de escolha e calibração em curso.
  const [underlayOpen, setUnderlayOpen] = useState(false);
  const [calibration, setCalibration] = useState<Calibration | undefined>(undefined);
  // Lista de atalhos (M5) e "Draw wall" (S30).
  const [helpOpen, setHelpOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const canvas = useRef<PlanCanvasHandle>(null);
  // S23: com a vista (opacidade/visível) do editor por cima; a vista não está no arquivo.
  const underlay = viewedUnderlay(state);
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

  // A planta aparece para projeto em planta, vazio (para desenhar a primeira parede) ou com underlay; projeto solto
  // mostra a elevação da parede selecionada.
  const showPlan = geometry !== undefined && (geometry.walls.length > 0 || geometry.broken.length > 0 || geometry.format === 'empty' || (underlay !== undefined && geometry.format !== 'loose'));
  const toggleDraw = showPlan
    ? (): void => {
        setDrawing((on) => !on);
        canvas.current?.focus();
      }
    : undefined;
  useEditorShortcuts(state, dispatch, true, { onHelp: () => setHelpOpen(true), onToggleDraw: toggleDraw, drawing: drawing && showPlan });

  const select = (selection: Selection): void => dispatch({ type: 'select', selection });
  /** Seleção vinda de uma lista: traz a parede para a vista e, em tela estreita, abre o inspetor. */
  const selectFromList = (selection: Selection): void => {
    select(selection);
    const last = selectedWallIds(selection).at(-1);
    if (last !== undefined) canvas.current?.focusWall(last);
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
      <EditorToolbar state={state} dispatch={dispatch} onHelp={() => setHelpOpen(true)} drawing={drawing && showPlan} onToggleDraw={toggleDraw} />
    </>
  );
  const selectedWall = state.selection.kind === 'wall' || state.selection.kind === 'opening' ? wallById(draft, state.selection.wallId) : undefined;
  const reviewed = outcome !== undefined || reviewedCount(draft.walls) > 0 ? { done: reviewedCount(draft.walls), total: draft.walls.length } : undefined;
  const center = setupVisible ? (
    <Card className="step-enter workspace-pane flex-1 gap-0 p-6 md:p-8">
      <ProjectDataForm outcome={outcome} onOutcome={onOutcome} variant="setup" needs={needs} confirm={state.dirty} onSkip={() => setDismissed(true)} />
    </Card>
  ) : showPlan && geometry !== undefined ? (
    <PlanCanvas
      ref={canvas}
      toolbar={toolbar}
      geometry={geometry}
      selection={state.selection}
      issuesByWall={issuesByWall}
      northAngle={draft.northAngle}
      // Reenquadra só quando outro projeto entra (o workspace remonta a cada carga): desenhar ou acrescentar uma
      // parede não tira a planta do lugar (S30).
      fitKey={`${state.source ?? ''}:${name}`}
      onSelect={select}
      onEndpointDrag={(wallId, end, point, txn) => dispatch({ type: 'moveEndpoint', wallId, end, point, txn })}
      onOpeningDrag={(wallId, openingId, s0, roughWidth, txn) => dispatch({ type: 'moveOpening', wallId, openingId, s0, roughWidth, txn })}
      onWallsMove={(wallIds, dx, dy, txn) => dispatch({ type: 'moveWalls', wallIds, dx, dy, txn })}
      breaks={breaks}
      onBreaksChange={(wallId, list, txn) => dispatch({ type: 'setPanelBreaks', wallId, breaks: list, ...(txn === undefined ? {} : { txn }) })}
      onDragEnd={() => dispatch({ type: 'endTransaction' })}
      level={level}
      onLevel={setLevel}
      underlay={underlay}
      onCalibrationPoint={calibration === undefined ? undefined : onCalibrationPoint}
      onCalibrationCancel={() => setCalibration(undefined)}
      onDrawWall={drawing ? (start, end) => dispatch({ type: 'addWall', afterWallId: selectedWallIds(state.selection).at(-1), segment: { start, end } }) : undefined}
      overlay={underlay !== undefined && calibration !== undefined ? <CalibrationBanner underlay={underlay} calibration={calibration} onCalibration={setCalibration} onChange={setUnderlay} /> : undefined}
    />
  ) : (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-end gap-1">{toolbar}</div>
      {selectedWall !== undefined ? (
        // Projeto solto (M5): a elevação esquemática da parede selecionada no lugar da caixa vazia.
        <WallElevation draft={draft} wall={selectedWall} selection={state.selection} onSelect={select} className="min-h-0 flex-1" />
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed bg-paper-2 p-6 text-center text-sm text-ink-3">Walls given by length only, so there is no plan. Pick a wall in the list to see its elevation and edit it.</div>
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

  return (
    <div className="step-enter flex min-h-0 flex-1 flex-col">
      <EditorTopBar name={name} walls={draft.walls.length} reviewed={reviewed} openings={draft.walls.reduce((n, w) => n + w.openings.length, 0)} check={check} problems={counts.problems} warnings={counts.warnings} ready={ready} pending={pending} needsData={needsData} onGenerate={onGenerate} steps={steps} menu={menu} save={save} onRetrySave={onRetrySave} saveActions={saveActions} />
      {wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_320px] xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <aside className="flex min-h-0 flex-col border-r border-line bg-card" aria-label="Navigator">
            <Navigator tab={tab === 'inspector' ? 'walls' : tab} onTab={setTab} tabs={navTabs} />
          </aside>
          <section className="flex min-h-0 flex-col p-3" aria-label="Plan">
            {center}
          </section>
          <aside className="workspace-pane border-l border-line bg-card" aria-label="Properties">
            <Inspector />
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <section className="h-[45dvh] shrink-0 border-b border-line p-3" aria-label="Plan">
            {center}
          </section>
          <Navigator
            tab={tab}
            onTab={setTab}
            tabs={[
              ...navTabs,
              {
                id: 'inspector',
                label: 'Inspector',
                content: (
                  <div className="workspace-pane flex-1">
                    <Inspector />
                  </div>
                ),
              },
            ]}
            className="bg-card"
          />
        </div>
      )}
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <UnderlayDialog
        open={underlayOpen}
        onOpenChange={setUnderlayOpen}
        sourceFiles={sourceFiles}
        storedDrawings={[...storedDrawings, ...extraDrawingsOf(draft.extra)]}
        storage={storage}
        bounds={geometry?.bounds}
        onPick={setUnderlay}
        onAddDrawings={(drawings) => dispatch({ type: 'addDrawings', drawings })}
      />
      <ProjectSettingsDialog open={settingsOpen} onOpenChange={(open) => !open && select({ kind: 'none' })} draft={draft} dispatch={dispatch} outcome={outcome} dirty={state.dirty} onOutcome={onOutcome} />
    </div>
  );
}
