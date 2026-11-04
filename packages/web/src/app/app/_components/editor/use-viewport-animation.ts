'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point } from '@/lib/editor/draft';
import type { Rect } from '@/lib/editor/geometry';
import {
  centerOn,
  fitViewport,
  lerpViewport,
  rectVisible,
  screenToPlan,
  zoomAt,
  type Size,
  type Viewport,
} from '@/lib/editor/viewport';
import { easeSite, prefersReducedMotion, VIEWPORT_ANIMATION_MS } from '@/lib/motion';

const WHEEL_ZOOM = 0.0015;
export const FIT_PADDING_PX = 40;

export interface ViewportControls {
  containerRef: React.RefObject<HTMLDivElement | null>;
  svgRef: React.RefObject<SVGSVGElement | null>;
  size: Size | undefined;
  viewport: Viewport | undefined;
  setViewport: React.Dispatch<React.SetStateAction<Viewport | undefined>>;
  /** O viewport mais recente (para handlers de rAF com closure velho). */
  latest: React.RefObject<Viewport | undefined>;
  /** Para a animação em curso: qualquer gesto do humano manda. */
  cancelAnim: () => void;
  fit: () => void;
  zoomBy: (factor: number) => void;
  /** Centraliza o retângulo só se ele não está inteiro na tela; nunca aproxima. */
  reveal: (rect: Rect) => void;
  /** Ponto do cliente → px do svg / polegadas da planta. */
  toLocal: (clientX: number, clientY: number) => Point | undefined;
  toPlan: (clientX: number, clientY: number) => Point | undefined;
}

/**
 * Viewport da planta (S30, saído do `plan-canvas.tsx`): tamanho medido do container, enquadramento quando o projeto
 * muda (`fitKey`) — nunca a cada edição, o zoom do usuário é dele —, roda = zoom no ponteiro (listener não passivo
 * para segurar o scroll da página) e animação de 250 ms com a curva do site para Fit / zoom / centralizar (M4),
 * pulada com `prefers-reduced-motion`.
 */
export function useViewportAnimation({
  bounds,
  fitKey,
  initialSize,
}: {
  bounds: Rect | undefined;
  fitKey: string;
  initialSize?: Size | undefined;
}): ViewportControls {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<Size | undefined>(initialSize);
  const [viewport, setViewport] = useState<Viewport | undefined>(() =>
    initialSize !== undefined && bounds !== undefined ? fitViewport(bounds, initialSize, FIT_PADDING_PX) : undefined,
  );
  const anim = useRef<number | undefined>(undefined);
  const latest = useRef(viewport);
  latest.current = viewport;

  useEffect(() => {
    const el = containerRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const measure = (): void => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (size === undefined || bounds === undefined) return;
    setViewport(fitViewport(bounds, size, FIT_PADDING_PX));
    // `bounds` fora de propósito (comentário acima); `size` entra pelas medidas, não pela identidade do objeto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size?.width, size?.height, fitKey]);

  const cancelAnim = useCallback((): void => {
    if (anim.current !== undefined) {
      cancelAnimationFrame(anim.current);
      anim.current = undefined;
    }
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      cancelAnim();
      const rect = svg.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setViewport((v) => (v === undefined ? v : zoomAt(v, anchor, Math.exp(-e.deltaY * WHEEL_ZOOM))));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', onWheel);
      cancelAnim();
    };
  }, [cancelAnim]);

  const animateTo = useCallback(
    (target: Viewport): void => {
      cancelAnim();
      const from = latest.current;
      if (from === undefined || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
        setViewport(target);
        return;
      }
      const start = performance.now();
      const step = (now: number): void => {
        const t = Math.min(1, (now - start) / VIEWPORT_ANIMATION_MS);
        setViewport(lerpViewport(from, target, easeSite(t)));
        anim.current = t < 1 ? requestAnimationFrame(step) : undefined;
      };
      anim.current = requestAnimationFrame(step);
    },
    [cancelAnim],
  );

  const fit = (): void => {
    if (size !== undefined && bounds !== undefined) animateTo(fitViewport(bounds, size, FIT_PADDING_PX));
  };
  const zoomBy = (factor: number): void => {
    const v = latest.current;
    if (v !== undefined && size !== undefined) animateTo(zoomAt(v, { x: size.width / 2, y: size.height / 2 }, factor));
  };
  const reveal = (rect: Rect): void => {
    const v = latest.current;
    if (v === undefined || size === undefined || rectVisible(v, rect, size)) return;
    animateTo(centerOn(v, rect, size, FIT_PADDING_PX));
  };
  const toLocal = (clientX: number, clientY: number): Point | undefined => {
    const svg = svgRef.current;
    if (svg === null) return undefined;
    const r = svg.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };
  const toPlan = (clientX: number, clientY: number): Point | undefined => {
    const v = latest.current;
    const p = toLocal(clientX, clientY);
    return v === undefined || p === undefined ? undefined : screenToPlan(v, p);
  };

  return {
    containerRef,
    svgRef,
    size,
    viewport,
    setViewport,
    latest,
    cancelAnim,
    fit,
    zoomBy,
    reveal,
    toLocal,
    toPlan,
  };
}
