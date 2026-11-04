'use client';

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { PlanGeometry } from '@/lib/editor/geometry';
import { selectedWallIds, type Selection } from '@/lib/editor/state';
import { SNAP_FINE } from '@/lib/editor/viewport';

export const ZOOM_STEP = 1.25;
/** Nudge pelo teclado: 1" (Shift 1/8", Alt 12"). */
const NUDGE = { normal: 1, fine: SNAP_FINE, coarse: 12 } as const;

export interface CanvasKeyArgs {
  selection: Selection;
  geometry: PlanGeometry;
  fit: () => void;
  zoomBy: (factor: number) => void;
  onWallsMove?: ((wallIds: string[], dx: number, dy: number, txn: string) => void) | undefined;
  onOpeningDrag?:
    ((wallId: string, openingId: string, s0: number, roughWidth: number, txn: string) => void) | undefined;
  onDragEnd?: (() => void) | undefined;
  /** Calibrando o underlay: Esc cancela. */
  onCalibrationCancel?: (() => void) | undefined;
  /** Desenhando: Esc solta a primeira ponta (`true`); sem ponta, o Esc segue para o editor (sai do modo). */
  cancelDrawStart?: (() => boolean) | undefined;
}

/**
 * Teclado com a planta em foco (M5; S30 em hook próprio): setas movem a seleção — paredes inteiras (uma ou várias)
 * ou a abertura ao longo do eixo —, +/− zoom, F / 0 enquadra, Esc cancela calibração ou a ponta do desenho. Um
 * nudge contínuo (tecla presa) é uma transação: soltar a seta fecha o undo.
 */
export function useCanvasKeys({
  selection,
  geometry,
  fit,
  zoomBy,
  onWallsMove,
  onOpeningDrag,
  onDragEnd,
  onCalibrationCancel,
  cancelDrawStart,
}: CanvasKeyArgs): {
  onKeyDown: (e: ReactKeyboardEvent<SVGSVGElement>) => void;
  onKeyUp: (e: ReactKeyboardEvent<SVGSVGElement>) => void;
} {
  const nudgeTxn = useRef<string | undefined>(undefined);
  const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>): void => {
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') {
      if (onCalibrationCancel !== undefined) {
        e.preventDefault();
        onCalibrationCancel();
      } else if (cancelDrawStart?.() === true) {
        e.preventDefault();
      }
      return;
    }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomBy(ZOOM_STEP);
      return;
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomBy(1 / ZOOM_STEP);
      return;
    }
    if (e.key === 'f' || e.key === 'F' || e.key === '0') {
      e.preventDefault();
      fit();
      return;
    }
    const arrow: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const dir = arrow[e.key];
    if (dir === undefined) return;
    e.preventDefault();
    const stepIn = e.shiftKey ? NUDGE.fine : e.altKey ? NUDGE.coarse : NUDGE.normal;
    const [ux, uy] = dir;
    const txn = (nudgeTxn.current ??= `nudge-${Date.now()}`);
    if ((selection.kind === 'wall' || selection.kind === 'walls') && onWallsMove !== undefined) {
      onWallsMove(selectedWallIds(selection), ux * stepIn, uy * stepIn, txn);
    } else if (selection.kind === 'opening' && onOpeningDrag !== undefined) {
      const wall = geometry.walls.find((w) => w.wallId === selection.wallId);
      const opening = wall?.openings.find((o) => o.openingId === selection.openingId);
      if (wall === undefined || opening === undefined) return;
      // Ao longo do eixo: na parede em x, ←/→; na parede em y, ↑/↓ (no sentido start → end).
      const along = wall.dir === 'x' ? ux * wall.sign : uy * wall.sign;
      if (along === 0) return;
      const width = opening.s1 - opening.s0;
      const s0 = Math.max(0, Math.min(wall.length - width, opening.s0 + along * stepIn));
      if (s0 !== opening.s0) onOpeningDrag(selection.wallId, selection.openingId, s0, width, txn);
    }
  };
  const onKeyUp = (e: ReactKeyboardEvent<SVGSVGElement>): void => {
    if (e.key.startsWith('Arrow') && nudgeTxn.current !== undefined) {
      nudgeTxn.current = undefined;
      onDragEnd?.();
    }
  };
  return { onKeyDown, onKeyUp };
}
