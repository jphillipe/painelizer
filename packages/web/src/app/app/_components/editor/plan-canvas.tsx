'use client';

import { MaximizeIcon, MinusIcon, OctagonXIcon, PlusIcon } from 'lucide-react';
import { useImperativeHandle, useState, type ReactNode, type Ref } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, Kbd } from '@/components/ui/tooltip';
import type { ShownBreaks } from '@/lib/editor/breaks';
import type { Point } from '@/lib/editor/draft';
import { segmentRect, type PlanGeometry } from '@/lib/editor/geometry';
import type { Issue } from '@/lib/editor/problems';
import { selectedWallIds, type Selection } from '@/lib/editor/state';
import { svgMatrix, type Underlay } from '@/lib/editor/underlay';
import type { LevelFilter } from '@/lib/editor/wall-filters';
import { fitViewport, gridStep, scaleBar, type Size } from '@/lib/editor/viewport';
import { cn } from '@/lib/utils';
import { BrokenWall, DrawPreview, Grid, Handles, Legend, North, Origin, PanelBreaks, Readout, ScaleBar, Wall } from './plan-canvas-shapes';
import { useCanvasKeys, ZOOM_STEP } from './use-canvas-keys';
import { usePlanGestures } from './use-plan-gestures';
import { FIT_PADDING_PX, useViewportAnimation } from './use-viewport-animation';

const EMPTY_BOUNDS = { x: -24, y: -24, w: 480, h: 360 };

/** Comandos de quem está fora do canvas (S21.4): a lista de paredes traz a selecionada para a vista. */
export interface PlanCanvasHandle {
  fit: () => void;
  /** Centraliza a parede só se ela não está inteira na tela; nunca aproxima. */
  focusWall: (wallId: string) => void;
  /** Foco do teclado na planta (S30: ao entrar no "Draw wall", Esc e setas já valem). */
  focus: () => void;
}

export interface PlanCanvasProps {
  geometry: PlanGeometry;
  selection: Selection;
  issuesByWall: ReadonlyMap<string | undefined, Issue[]>;
  northAngle?: number | undefined;
  /** Muda quando outro projeto entra (ou o número de paredes): reenquadra. Edições comuns não mexem no zoom. */
  fitKey: string;
  onSelect: (s: Selection) => void;
  /** Arraste (S21.3): cada chamada leva o mesmo `txn` durante um arraste, para virar um undo só. */
  onEndpointDrag?: ((wallId: string, end: 'start' | 'end', point: Point, txn: string) => void) | undefined;
  onOpeningDrag?: ((wallId: string, openingId: string, s0: number, roughWidth: number, txn: string) => void) | undefined;
  /** Paredes inteiras deslocadas: setas (M5) e arraste do corpo da seleção (S30), uma ou várias. */
  onWallsMove?: ((wallIds: string[], dx: number, dy: number, txn: string) => void) | undefined;
  /**
   * Quebras de painel por parede (S29), em x do arquivo (do `start`): desenhadas em todas as paredes; na
   * selecionada, os candidatos viram pontos (clique acrescenta) e as quebras se arrastam (duplo clique tira).
   */
  breaks?: ReadonlyMap<string, ShownBreaks> | undefined;
  /** A lista inteira de quebras da parede (`undefined` = automático); `txn` durante um arraste. */
  onBreaksChange?: ((wallId: string, breaks: number[] | undefined, txn?: string) => void) | undefined;
  onDragEnd?: (() => void) | undefined;
  /** Pavimento mostrado (M5): compartilhado com a lista quando o pai o controla. */
  level?: LevelFilter | undefined;
  onLevel?: ((level: LevelFilter) => void) | undefined;
  /** Tamanho antes de medir o container (SSR e testes). */
  initialSize?: Size | undefined;
  className?: string;
  /** Toolbar do editor, à direita da barra da planta. */
  toolbar?: ReactNode;
  /** Planta do arquiteto por baixo das paredes (M6). */
  underlay?: Underlay | undefined;
  /** Calibração do underlay: cliques viram pontos (em planta), não seleção; Esc cancela. */
  onCalibrationPoint?: ((p: Point) => void) | undefined;
  onCalibrationCancel?: (() => void) | undefined;
  /** "Draw wall" (S30): presente = modo de desenho; dois cliques com snap criam a parede. */
  onDrawWall?: ((start: Point, end: Point) => void) | undefined;
  /** Faixa de instrução sobre a planta (calibração, desenho). */
  overlay?: ReactNode;
  ref?: Ref<PlanCanvasHandle>;
}

/**
 * Planta do editor em SVG React (S21.2/S21.3), ocupando a altura do painel do workspace: paredes com a espessura
 * real e as plates como o motor enquadra, aberturas como vãos, ids, origem, norte, grade, escala e legenda (M5).
 * S30: viewport em `useViewportAnimation`, ponteiro em `usePlanGestures`, teclado em `useCanvasKeys` e as
 * primitivas em `plan-canvas-shapes.tsx`; aqui só a composição e a barra (pavimento, zoom, toolbar do editor).
 */
export function PlanCanvas({ geometry, selection, issuesByWall, northAngle, fitKey, onSelect, onEndpointDrag, onOpeningDrag, onWallsMove, breaks, onBreaksChange, onDragEnd, level: levelProp, onLevel, initialSize, className, toolbar, underlay, onCalibrationPoint, onCalibrationCancel, onDrawWall, overlay, ref }: PlanCanvasProps) {
  const calibrating = onCalibrationPoint !== undefined;
  const drawing = onDrawWall !== undefined && !calibrating;
  const [ownLevel, setOwnLevel] = useState<LevelFilter>('all');
  const level = levelProp ?? ownLevel;
  const setLevel = onLevel ?? setOwnLevel;
  // Planta vazia (S30: desenhar a primeira parede) enquadra um quadro de 40′ × 30′ em volta da origem.
  const bounds = geometry.bounds ?? EMPTY_BOUNDS;
  const vp = useViewportAnimation({ bounds, fitKey, initialSize });
  const { size, viewport } = vp;
  const visible = geometry.walls.filter((w) => level === 'all' || w.level === level);
  const gestures = usePlanGestures({
    vp,
    geometry,
    selection,
    breaks,
    snapWalls: visible,
    callbacks: { onSelect, onEndpointDrag, onOpeningDrag, onWallsMove, onBreaksChange, onDragEnd, onCalibrationPoint, onDrawWall: drawing ? onDrawWall : undefined },
  });
  const keys = useCanvasKeys({ selection, geometry, fit: vp.fit, zoomBy: vp.zoomBy, onWallsMove, onOpeningDrag, onDragEnd, onCalibrationCancel: calibrating ? onCalibrationCancel : undefined, cancelDrawStart: drawing ? gestures.cancelDrawStart : undefined });

  useImperativeHandle(ref, () => ({
    fit: vp.fit,
    focusWall: (wallId) => {
      const wall = geometry.walls.find((w) => w.wallId === wallId);
      const broken = wall === undefined ? geometry.broken.find((b) => b.wallId === wallId) : undefined;
      const rect = wall?.rect ?? (broken === undefined ? undefined : segmentRect(broken.start, broken.end, 5.5));
      if (rect !== undefined) vp.reveal(rect);
    },
    focus: () => vp.svgRef.current?.focus({ preventScroll: true }),
  }));

  const selectedIds = selectedWallIds(selection);
  const single = selection.kind === 'wall' || selection.kind === 'opening' ? selection.wallId : undefined;
  const selectedOpening = selection.kind === 'opening' ? selection.openingId : undefined;
  const singleGeom = single === undefined ? undefined : visible.find((w) => w.wallId === single);
  const severity = (wallId: string): 'problem' | 'warning' | undefined => {
    const list = issuesByWall.get(wallId);
    if (list === undefined || list.length === 0) return undefined;
    return list.some((i) => i.severity === 'problem') ? 'problem' : 'warning';
  };
  const draggable = onEndpointDrag !== undefined && !drawing;
  const movable = onWallsMove !== undefined && !drawing;
  const fitScale = size !== undefined && bounds !== undefined ? fitViewport(bounds, size, FIT_PADDING_PX).scale : undefined;
  const zoomPercent = viewport !== undefined && fitScale !== undefined && fitScale > 0 ? Math.round((viewport.scale / fitScale) * 100) : undefined;
  const grid = viewport === undefined ? undefined : gridStep(viewport.scale);
  const bar = viewport === undefined ? undefined : scaleBar(viewport.scale);
  const editBreaks = draggable && onBreaksChange !== undefined;
  const hint = drawing
    ? 'Click the start, then the end · snaps to wall ends and axes, square to the plan · the next wall starts where the last ended · double-click or Esc ends the run · Esc again leaves'
    : draggable
      ? `Click to select · Shift+click adds to the selection · drag a selected wall to move it, its ends and openings to edit (Shift = 1/8")${editBreaks ? ' · panel breaks: click a dot to add, drag to move, double-click to remove' : ''} · arrows nudge · drag the background to pan · scroll or pinch to zoom`
      : 'Click to select · drag to pan · scroll to zoom';

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-2', className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {geometry.houseError !== undefined ? (
          <Badge variant="destructive" title={geometry.houseError}>
            <OctagonXIcon /> Plan doesn’t close
          </Badge>
        ) : null}
        {geometry.levels.length > 1 ? (
          <div className="flex items-center gap-1" role="group" aria-label="Level">
            <Button variant={level === 'all' ? 'secondary' : 'ghost'} size="xs" onClick={() => setLevel('all')}>
              All levels
            </Button>
            {geometry.levels.map((l) => (
              <Button key={l} variant={level === l ? 'secondary' : 'ghost'} size="xs" onClick={() => setLevel(l)}>
                L{l}
              </Button>
            ))}
          </div>
        ) : null}
        <ZoomControls zoomPercent={zoomPercent} onZoom={vp.zoomBy} onFit={vp.fit} />
        <div className="ml-auto flex items-center gap-1">{toolbar}</div>
      </div>
      {geometry.houseError !== undefined ? <p className="shrink-0 text-[12px] leading-snug text-destructive">{geometry.houseError}</p> : null}
      <div ref={vp.containerRef} data-plan-canvas className="relative min-h-0 w-full flex-1 overflow-hidden rounded-md border bg-paper-2">
        <svg
          ref={vp.svgRef}
          role="img"
          aria-label={`Plan, ${geometry.walls.length} walls`}
          tabIndex={0}
          width="100%"
          height="100%"
          data-drawing={drawing || undefined}
          className={cn('block touch-none select-none outline-none', calibrating || drawing ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing')}
          {...gestures.handlers}
          onKeyDown={keys.onKeyDown}
          onKeyUp={keys.onKeyUp}
        >
          {viewport !== undefined && size !== undefined ? (
            <>
              {grid !== undefined ? <Grid viewport={viewport} step={grid} /> : null}
              {underlay !== undefined && underlay.visible ? (
                <image href={underlay.image} width={underlay.width} height={underlay.height} transform={svgMatrix(underlay, viewport)} opacity={underlay.opacity} preserveAspectRatio="none" pointerEvents="none" data-underlay aria-hidden />
              ) : null}
              <Origin viewport={viewport} />
              {visible.map((w) => {
                const selected = selectedIds.includes(w.wallId);
                return (
                  <Wall key={w.wallId} wall={w} viewport={viewport} selected={selected} selectedOpening={single === w.wallId ? selectedOpening : undefined} severity={severity(w.wallId)} draggable={draggable} movable={movable && selected} drawing={drawing} />
                );
              })}
              {geometry.broken.map((b) => (
                <BrokenWall key={b.wallId} wall={b} viewport={viewport} />
              ))}
              {breaks === undefined
                ? null
                : visible.map((w) => {
                    const shown = breaks.get(w.wallId);
                    return shown === undefined || (shown.breaks.length === 0 && single !== w.wallId) ? null : (
                      <PanelBreaks key={`breaks-${w.wallId}`} wall={w} viewport={viewport} shown={shown} selected={single === w.wallId} editable={editBreaks} />
                    );
                  })}
              {singleGeom !== undefined && draggable ? <Handles key={singleGeom.wallId} wall={singleGeom} viewport={viewport} /> : null}
              {drawing ? <DrawPreview viewport={viewport} start={gestures.draw.start} cursor={gestures.draw.cursor} /> : null}
              {gestures.readout !== undefined ? <Readout x={gestures.readout.x} y={gestures.readout.y} text={gestures.readout.text} size={size} /> : null}
              {northAngle !== undefined ? <North x={size.width - 28} y={28} angle={northAngle} /> : null}
              {bar !== undefined ? <ScaleBar x={12} y={size.height - 14} inches={bar.inches} px={bar.px} /> : null}
            </>
          ) : null}
        </svg>
        {geometry.walls.length === 0 && geometry.broken.length === 0 && underlay === undefined && !drawing ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">Nothing to draw yet.</p>
        ) : null}
        {overlay}
        <Legend className="absolute right-2 bottom-2" />
      </div>
      <p className="shrink-0 truncate text-[12px] text-ink-3" title={hint}>
        {hint}
      </p>
    </div>
  );
}

function ZoomControls({ zoomPercent, onZoom, onFit }: { zoomPercent: number | undefined; onZoom: (factor: number) => void; onFit: () => void }) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Zoom">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" onClick={() => onZoom(1 / ZOOM_STEP)} aria-label="Zoom out">
            <MinusIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Zoom out<Kbd>−</Kbd>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="xs" className="min-w-12 font-mono tabular-nums" onClick={onFit} aria-label="Zoom level; click to fit">
            {zoomPercent === undefined ? '—' : `${zoomPercent}%`}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Zoom relative to the whole plan; click to fit</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" onClick={() => onZoom(ZOOM_STEP)} aria-label="Zoom in">
            <PlusIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Zoom in<Kbd>+</Kbd>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="xs" onClick={onFit}>
            <MaximizeIcon /> Fit
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Fit the plan in view<Kbd>F</Kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
