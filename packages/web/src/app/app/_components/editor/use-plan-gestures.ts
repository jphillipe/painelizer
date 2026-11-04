'use client';

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { movedBreak, snapBreak, withBreak, withoutBreak, type ShownBreaks } from '@/lib/editor/breaks';
import type { Point } from '@/lib/editor/draft';
import { snapDrawPoint, type DrawSnap, type SnapWall } from '@/lib/editor/draw';
import { alongFromStart, draggedEndpoint, draggedOpeningStart, type PlanGeometry } from '@/lib/editor/geometry';
import { formatMeasure } from '@/lib/editor/measure';
import { selectedWallIds, toggledWall, type Selection } from '@/lib/editor/state';
import { panBy, snap, SNAP_COARSE, SNAP_FINE, zoomAt } from '@/lib/editor/viewport';
import type { ViewportControls } from './use-viewport-animation';

const CLICK_SLOP_PX = 3;
/** Distância de snap do desenho, em px de tela. */
const DRAW_SNAP_PX = 10;

type Base = { x: number; y: number; moved: boolean; target: EventTarget | null };
type Drag =
  | (Base & { kind: 'pan' })
  | (Base & { kind: 'endpoint'; wallId: string; end: 'start' | 'end'; txn: string })
  | (Base & { kind: 'opening'; wallId: string; openingId: string; grabOffset: number; txn: string })
  | (Base & { kind: 'break'; wallId: string; index: number; txn: string })
  /** Corpo de parede selecionada (S30): o conjunto anda junto; `applied` = deslocamento já mandado. */
  | (Base & { kind: 'walls'; wallIds: string[]; origin: Point; applied: Point; txn: string });

/** Dois dedos (M5): distância e centro do último quadro, para zoom + pan. */
interface Pinch {
  dist: number;
  mid: Point;
}

export interface PlanGestureCallbacks {
  onSelect: (s: Selection) => void;
  /** Arraste (S21.3): cada chamada leva o mesmo `txn` durante um arraste, para virar um undo só. */
  onEndpointDrag?: ((wallId: string, end: 'start' | 'end', point: Point, txn: string) => void) | undefined;
  onOpeningDrag?:
    ((wallId: string, openingId: string, s0: number, roughWidth: number, txn: string) => void) | undefined;
  /** Paredes inteiras deslocadas (S30: arraste do corpo e nudge, uma ou várias). */
  onWallsMove?: ((wallIds: string[], dx: number, dy: number, txn: string) => void) | undefined;
  onBreaksChange?: ((wallId: string, breaks: number[] | undefined, txn?: string) => void) | undefined;
  onDragEnd?: (() => void) | undefined;
  /** Calibração do underlay (M6): cliques viram pontos em planta, não seleção. */
  onCalibrationPoint?: ((p: Point) => void) | undefined;
  /** "Draw wall" ativo (S30): dois cliques criam a parede; o fim de uma é o começo da próxima. */
  onDrawWall?: ((start: Point, end: Point) => void) | undefined;
}

export interface PlanGestures {
  handlers: {
    onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerUp: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerLeave: () => void;
    onDoubleClick: (e: ReactMouseEvent<SVGSVGElement>) => void;
  };
  /** Cota junto ao cursor no arraste (M5), em px do svg. */
  readout: { x: number; y: number; text: string } | undefined;
  /** Desenho em curso: primeira ponta (depois do primeiro clique) e mira com snap. */
  draw: { start: Point | undefined; cursor: DrawSnap | undefined };
  /** Esc no desenho: solta a primeira ponta; `false` quando não havia (quem chamou sai do modo). */
  cancelDrawStart: () => boolean;
}

/**
 * Gestos da planta (S30, saídos do `plan-canvas.tsx`): clique seleciona (Shift/Ctrl/⌘ põe ou tira da seleção
 * múltipla); arrastar uma alça move a ponta no eixo, uma abertura desliza o RO, uma quebra de painel anda entre os
 * candidatos, o corpo de uma parede selecionada move a seleção inteira (snap 1", Shift 1/8"); o fundo — e parede
 * não selecionada — faz pan. Dois dedos: pinch e pan. Um arraste = uma transação = um undo; no máximo um dispatch
 * por quadro. No "Draw wall", o clique vira ponto da parede nova.
 */
export function usePlanGestures({
  vp,
  geometry,
  selection,
  breaks,
  snapWalls,
  callbacks,
}: {
  vp: ViewportControls;
  geometry: PlanGeometry;
  selection: Selection;
  breaks: ReadonlyMap<string, ShownBreaks> | undefined;
  snapWalls: readonly SnapWall[];
  callbacks: PlanGestureCallbacks;
}): PlanGestures {
  const {
    onSelect,
    onEndpointDrag,
    onOpeningDrag,
    onWallsMove,
    onBreaksChange,
    onDragEnd,
    onCalibrationPoint,
    onDrawWall,
  } = callbacks;
  const drawing = onDrawWall !== undefined;
  const [readout, setReadout] = useState<{ x: number; y: number; text: string } | undefined>(undefined);
  const [drawStart, setDrawStart] = useState<Point | undefined>(undefined);
  const [drawCursor, setDrawCursor] = useState<DrawSnap | undefined>(undefined);
  const drag = useRef<Drag | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const pending = useRef<{ clientX: number; clientY: number; shift: boolean } | undefined>(undefined);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | undefined>(undefined);
  // Geometria e quebras mais recentes para o handler do rAF (o closure do evento pode estar velho).
  const latest = useRef({ geometry, breaks, snapWalls, drawStart });
  latest.current = { geometry, breaks, snapWalls, drawStart };

  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    },
    [],
  );
  // Fora do modo, nada de desenho pendurado.
  if (!drawing && (drawStart !== undefined || drawCursor !== undefined)) {
    setDrawStart(undefined);
    setDrawCursor(undefined);
  }

  const drawSnap = (clientX: number, clientY: number): DrawSnap | undefined => {
    const p = vp.toPlan(clientX, clientY);
    const v = vp.latest.current;
    if (p === undefined || v === undefined) return undefined;
    return snapDrawPoint(p, latest.current.snapWalls, DRAW_SNAP_PX / v.scale, latest.current.drawStart);
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0 && e.button !== 1) return;
    vp.cancelAnim();
    e.currentTarget.focus({ preventScroll: true });
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Segundo dedo: vira pinch; o arraste em curso é abandonado (o que já moveu fica, é um undo).
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(b!.x - a!.x, b!.y - a!.y),
        mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 },
      };
      if (drag.current !== undefined && drag.current.kind !== 'pan' && drag.current.moved) onDragEnd?.();
      drag.current = undefined;
      setReadout(undefined);
      capture(e);
      return;
    }
    drag.current = startDrag(e);
    capture(e);
  };

  const startDrag = (e: ReactPointerEvent<SVGSVGElement>): Drag => {
    const base = { x: e.clientX, y: e.clientY, moved: false, target: e.target };
    // Desenhando ou calibrando, arrastar é sempre pan; o clique é tratado ao soltar.
    if (drawing || onCalibrationPoint !== undefined) return { ...base, kind: 'pan' };
    const el = e.target instanceof Element ? e.target : null;
    const handleEl = el?.closest('[data-handle]');
    const breakEl = el?.closest('[data-break-index]');
    const openingEl = el?.closest('[data-opening-id]');
    const candidateEl = el?.closest('[data-break-candidate]');
    const wallId = el?.closest('[data-wall-id]')?.getAttribute('data-wall-id') ?? undefined;
    const txn = `drag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (wallId === undefined) return { ...base, kind: 'pan' };
    if (handleEl != null && onEndpointDrag !== undefined)
      return {
        ...base,
        kind: 'endpoint',
        wallId,
        end: handleEl.getAttribute('data-handle') === 'start' ? 'start' : 'end',
        txn,
      };
    if (breakEl != null && onBreaksChange !== undefined)
      return { ...base, kind: 'break', wallId, index: Number(breakEl.getAttribute('data-break-index')), txn };
    if (openingEl != null && onOpeningDrag !== undefined) {
      const openingId = openingEl.getAttribute('data-opening-id') ?? '';
      const wall = geometry.walls.find((w) => w.wallId === wallId);
      const opening = wall?.openings.find((o) => o.openingId === openingId);
      const p = vp.toPlan(e.clientX, e.clientY);
      if (wall !== undefined && opening !== undefined && p !== undefined && opening.rect !== undefined) {
        return { ...base, kind: 'opening', wallId, openingId, grabOffset: alongFromStart(wall, p) - opening.s0, txn };
      }
      return { ...base, kind: 'pan' };
    }
    // Corpo de parede selecionada (S30): move a seleção; parede não selecionada continua fazendo pan.
    const selected = selectedWallIds(selection);
    const origin = vp.toPlan(e.clientX, e.clientY);
    if (candidateEl == null && onWallsMove !== undefined && selected.includes(wallId) && origin !== undefined) {
      const movable = selected.filter((id) => geometry.walls.some((w) => w.wallId === id));
      if (movable.length > 0) return { ...base, kind: 'walls', wallIds: movable, origin, applied: { x: 0, y: 0 }, txn };
    }
    return { ...base, kind: 'pan' };
  };

  const applyDrag = (): void => {
    frame.current = undefined;
    const d = drag.current;
    const ev = pending.current;
    pending.current = undefined;
    if (d === undefined || ev === undefined || d.kind === 'pan') return;
    const p = vp.toPlan(ev.clientX, ev.clientY);
    const at = vp.toLocal(ev.clientX, ev.clientY);
    if (p === undefined || at === undefined) return;
    const step = ev.shift ? SNAP_FINE : SNAP_COARSE;
    if (d.kind === 'walls') {
      const to = { x: snap(p.x - d.origin.x, step), y: snap(p.y - d.origin.y, step) };
      setReadout({ x: at.x, y: at.y, text: `move ${formatMeasure(to.x)}, ${formatMeasure(to.y)}` });
      const dx = to.x - d.applied.x;
      const dy = to.y - d.applied.y;
      if (dx === 0 && dy === 0) return;
      d.applied = to;
      onWallsMove?.(d.wallIds, dx, dy, d.txn);
      return;
    }
    const wall = latest.current.geometry.walls.find((w) => w.wallId === d.wallId);
    if (wall === undefined) return;
    if (d.kind === 'endpoint') {
      const point = draggedEndpoint(wall, d.end, p, step);
      const other = d.end === 'start' ? wall.end : wall.start;
      setReadout({ x: at.x, y: at.y, text: `${formatMeasure(Math.hypot(point.x - other.x, point.y - other.y))} axis` });
      onEndpointDrag?.(d.wallId, d.end, point, d.txn);
    } else if (d.kind === 'break') {
      const shown = latest.current.breaks?.get(d.wallId);
      if (shown === undefined) return;
      // Snap no candidato mais próximo (S29); Shift = 1/8" livre (o motor diz se serve).
      const along = Math.min(wall.length, Math.max(0, alongFromStart(wall, p)));
      const to = ev.shift ? snapBreak(along, [], SNAP_FINE) : snapBreak(along, shown.candidates, SNAP_COARSE);
      setReadout({ x: at.x, y: at.y, text: `break ${formatMeasure(to)}` });
      if (shown.breaks[d.index] === to) return;
      const next = movedBreak(shown.breaks, d.index, to);
      d.index = next.indexOf(to);
      onBreaksChange?.(d.wallId, next, d.txn);
    } else {
      const opening = wall.openings.find((o) => o.openingId === d.openingId);
      if (opening === undefined) return;
      const s0 = draggedOpeningStart(wall, opening, alongFromStart(wall, p), d.grabOffset, step);
      setReadout({ x: at.x, y: at.y, text: `edge ${formatMeasure(s0)}` });
      if (s0 !== opening.s0) onOpeningDrag?.(d.wallId, d.openingId, s0, opening.s1 - opening.s0, d.txn);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pz = pinch.current;
    if (pz !== undefined && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(b!.x - a!.x, b!.y - a!.y);
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      const anchor = vp.toLocal(mid.x, mid.y);
      if (anchor !== undefined && pz.dist > 0) {
        const factor = dist / pz.dist;
        vp.setViewport((v) =>
          v === undefined ? v : panBy(zoomAt(v, anchor, factor), mid.x - pz.mid.x, mid.y - pz.mid.y),
        );
      }
      pinch.current = { dist, mid };
      return;
    }
    const d = drag.current;
    if (d === undefined) {
      // Mira do desenho acompanha o ponteiro (sem botão).
      if (drawing) setDrawCursor(drawSnap(e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < CLICK_SLOP_PX) return;
    d.moved = true;
    if (d.kind === 'pan') {
      d.x = e.clientX;
      d.y = e.clientY;
      vp.setViewport((v) => (v === undefined ? v : panBy(v, dx, dy)));
      return;
    }
    pending.current = { clientX: e.clientX, clientY: e.clientY, shift: e.shiftKey };
    if (frame.current === undefined) frame.current = requestAnimationFrame(applyDrag);
  };

  const finishDrag = (e: ReactPointerEvent<SVGSVGElement>, cancelled: boolean): void => {
    pointers.current.delete(e.pointerId);
    if (pinch.current !== undefined) {
      if (pointers.current.size < 2) pinch.current = undefined;
      release(e);
      return;
    }
    // O quadro pendente (o último movimento antes de soltar) entra antes de o arraste acabar.
    if (frame.current !== undefined) {
      cancelAnimationFrame(frame.current);
      frame.current = undefined;
      if (!cancelled) applyDrag();
    }
    pending.current = undefined;
    const d = drag.current;
    drag.current = undefined;
    setReadout(undefined);
    release(e);
    if (d === undefined) return;
    if (d.kind !== 'pan' && d.moved) {
      onDragEnd?.();
      return;
    }
    if (d.moved || cancelled) return;
    // Calibrando o underlay (M6): o clique é um ponto, não uma seleção.
    if (onCalibrationPoint !== undefined) {
      const p = vp.toPlan(e.clientX, e.clientY);
      if (p !== undefined) onCalibrationPoint(p);
      return;
    }
    // Desenhando (S30): primeiro clique fixa a ponta; o segundo cria a parede e a corrente segue do fim dela.
    if (onDrawWall !== undefined) {
      const at = drawSnap(e.clientX, e.clientY);
      if (at === undefined) return;
      const start = latest.current.drawStart;
      if (start !== undefined && Math.hypot(at.point.x - start.x, at.point.y - start.y) >= 1)
        onDrawWall(start, at.point);
      if (start === undefined || Math.hypot(at.point.x - start.x, at.point.y - start.y) >= 1) setDrawStart(at.point);
      setDrawCursor(undefined);
      return;
    }
    clickSelect(d.target, e.shiftKey || e.ctrlKey || e.metaKey);
  };

  /** Clique sem arraste: seleciona o que estava sob o ponteiro; com modificador, põe/tira a parede da seleção. */
  const clickSelect = (target: EventTarget | null, additive: boolean): void => {
    const el = target instanceof Element ? target : null;
    const wallId = el?.closest('[data-wall-id]')?.getAttribute('data-wall-id') ?? undefined;
    // Ponto candidato da parede selecionada (S29): o clique acrescenta a quebra ali.
    const candidate = el?.closest('[data-break-candidate]')?.getAttribute('data-break-candidate');
    if (candidate != null && wallId !== undefined && onBreaksChange !== undefined) {
      const shown = latest.current.breaks?.get(wallId);
      if (shown !== undefined) onBreaksChange(wallId, withBreak(shown.breaks, Number(candidate)));
      return;
    }
    if (additive) {
      if (wallId !== undefined) onSelect(toggledWall(selection, wallId));
      return;
    }
    const openingId = el?.closest('[data-opening-id]')?.getAttribute('data-opening-id') ?? undefined;
    if (wallId !== undefined && openingId !== undefined) onSelect({ kind: 'opening', wallId, openingId });
    else if (wallId !== undefined) onSelect({ kind: 'wall', wallId });
    else onSelect({ kind: 'none' });
  };

  // Duplo clique: numa quebra da parede selecionada (S29) tira a quebra; desenhando (S30), fecha a corrente.
  const onDoubleClick = (e: ReactMouseEvent<SVGSVGElement>): void => {
    if (drawing) {
      setDrawStart(undefined);
      return;
    }
    const el = e.target instanceof Element ? e.target : null;
    const breakEl = el?.closest('[data-break-index]');
    const wallId = el?.closest('[data-wall-id]')?.getAttribute('data-wall-id') ?? undefined;
    if (breakEl == null || wallId === undefined || onBreaksChange === undefined) return;
    const shown = latest.current.breaks?.get(wallId);
    if (shown !== undefined)
      onBreaksChange(wallId, withoutBreak(shown.breaks, Number(breakEl.getAttribute('data-break-index'))));
  };

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => finishDrag(e, false),
      onPointerCancel: (e) => finishDrag(e, true),
      onPointerLeave: () => setDrawCursor(undefined),
      onDoubleClick,
    },
    readout,
    draw: { start: drawStart, cursor: drawCursor },
    cancelDrawStart: () => {
      if (latest.current.drawStart === undefined) return false;
      setDrawStart(undefined);
      return true;
    },
  };
}

// Ponteiro sintético (testes) não tem id ativo: capturar é conveniência, não requisito.
function capture(e: ReactPointerEvent<SVGSVGElement>): void {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    /* sem captura */
  }
}

function release(e: ReactPointerEvent<SVGSVGElement>): void {
  if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
}
