'use client';

import { MaximizeIcon, OctagonXIcon } from 'lucide-react';
import { useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Point } from '@/lib/editor/draft';
import { alongFromStart, draggedEndpoint, draggedOpeningStart, segmentRect, type OpeningGeom, type PlanGeometry, type WallGeom } from '@/lib/editor/geometry';
import { formatMeasure } from '@/lib/editor/measure';
import type { Issue } from '@/lib/editor/problems';
import type { Selection } from '@/lib/editor/state';
import { centerOn, fitViewport, lerpViewport, panBy, planToScreen, rectToScreen, rectVisible, screenToPlan, SNAP_COARSE, SNAP_FINE, zoomAt, type Size, type Viewport } from '@/lib/editor/viewport';
import { easeSite, prefersReducedMotion, VIEWPORT_ANIMATION_MS } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** Transições do traço (M4): seleção, aviso e hover mudam de cor sem pular. */
const STROKE_TRANSITION = { transition: 'stroke 200ms var(--ease-site), stroke-width 200ms var(--ease-site)' } as const;
const HALO_TRANSITION = { transition: 'stroke-opacity 200ms var(--ease-site)' } as const;

/** Comandos de quem está fora do canvas (S21.4): a lista de paredes traz a selecionada para a vista. */
export interface PlanCanvasHandle {
  fit: () => void;
  /** Centraliza a parede só se ela não está inteira na tela; nunca aproxima. */
  focusWall: (wallId: string) => void;
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
  onDragEnd?: (() => void) | undefined;
  /** Tamanho antes de medir o container (SSR e testes). */
  initialSize?: Size | undefined;
  className?: string;
  /** Workspace (S21.4): preenche a altura do painel pai em vez do 4:3; a dica de uso vai para o rodapé. */
  fill?: boolean;
  /** Toolbar do editor, à direita da barra da planta. */
  toolbar?: ReactNode;
  ref?: Ref<PlanCanvasHandle>;
}

const WHEEL_ZOOM = 0.0015;
const CLICK_SLOP_PX = 3;
const FIT_PADDING_PX = 40;
const HANDLE_RADIUS = 6;
const HANDLE_HIT_RADIUS = 12;

type Drag =
  | { kind: 'pan'; x: number; y: number; moved: boolean; target: EventTarget | null }
  | { kind: 'endpoint'; x: number; y: number; moved: boolean; target: EventTarget | null; wallId: string; end: 'start' | 'end'; txn: string }
  | { kind: 'opening'; x: number; y: number; moved: boolean; target: EventTarget | null; wallId: string; openingId: string; grabOffset: number; txn: string };

/**
 * Planta do editor em SVG React (S21.2/S21.3): paredes com a espessura real e as plates como o motor enquadra,
 * aberturas como vãos, ids, origem e norte. Clique seleciona parede ou abertura (hit-test pelos `data-*` do
 * próprio SVG); arrastar o fundo faz pan; a roda dá zoom na posição do ponteiro. A parede selecionada ganha
 * alças nas pontas: arrastá-las move a ponta ao longo do eixo com snap de 1" (Shift = 1/8"); arrastar uma
 * abertura desliza o RO pela parede. Um arraste = uma transação = um undo. Cada ponto é convertido com o
 * viewport em JS (sem transform CSS), por isso rótulos ficam em pé e traços em px.
 */
export function PlanCanvas({ geometry, selection, issuesByWall, northAngle, fitKey, onSelect, onEndpointDrag, onOpeningDrag, onDragEnd, initialSize, className, fill = false, toolbar, ref }: PlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<Size | undefined>(initialSize);
  const [viewport, setViewport] = useState<Viewport | undefined>(() => (initialSize !== undefined && geometry.bounds !== undefined ? fitViewport(geometry.bounds, initialSize, FIT_PADDING_PX) : undefined));
  const [level, setLevel] = useState<number | 'all'>('all');
  const drag = useRef<Drag | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  // Animação do viewport (Fit, centralizar pela lista): cancelada por qualquer gesto do humano.
  const anim = useRef<number | undefined>(undefined);
  const pending = useRef<{ clientX: number; clientY: number; shift: boolean } | undefined>(undefined);
  // Geometria e viewport mais recentes para o handler do rAF (o closure do evento pode estar velho).
  const latest = useRef({ geometry, viewport });
  latest.current = { geometry, viewport };

  // Tamanho real do container.
  useEffect(() => {
    const el = containerRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const measure = (): void => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Enquadra quando o tamanho aparece ou outro projeto entra; não a cada edição (zoom do usuário é dele).
  const bounds = geometry.bounds;
  useEffect(() => {
    if (size === undefined || bounds === undefined) return;
    setViewport(fitViewport(bounds, size, FIT_PADDING_PX));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size?.width, size?.height, fitKey]);

  // Roda = zoom na posição do ponteiro; precisa de listener não passivo para segurar o scroll da página.
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
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      cancelAnim();
    };
  }, []);

  const cancelAnim = (): void => {
    if (anim.current !== undefined) {
      cancelAnimationFrame(anim.current);
      anim.current = undefined;
    }
  };
  /** Vai ao viewport `target` em 250 ms com a curva do site (M4); com `prefers-reduced-motion`, ou sem viewport ainda, pula. */
  const animateTo = (target: Viewport): void => {
    cancelAnim();
    const from = latest.current.viewport;
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
  };

  const toPlan = (clientX: number, clientY: number): Point | undefined => {
    const svg = svgRef.current;
    const v = latest.current.viewport;
    if (svg === null || v === undefined) return undefined;
    const rect = svg.getBoundingClientRect();
    return screenToPlan(v, { x: clientX - rect.left, y: clientY - rect.top });
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0 && e.button !== 1) return;
    cancelAnim();
    const el = e.target instanceof Element ? e.target : null;
    const base = { x: e.clientX, y: e.clientY, moved: false, target: e.target };
    const handleEl = el?.closest('[data-handle]');
    const openingEl = el?.closest('[data-opening-id]');
    const wallId = el?.closest('[data-wall-id]')?.getAttribute('data-wall-id') ?? undefined;
    const txn = `drag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (handleEl !== null && handleEl !== undefined && wallId !== undefined && onEndpointDrag !== undefined) {
      drag.current = { ...base, kind: 'endpoint', wallId, end: handleEl.getAttribute('data-handle') === 'start' ? 'start' : 'end', txn };
    } else if (openingEl !== null && openingEl !== undefined && wallId !== undefined && onOpeningDrag !== undefined) {
      const openingId = openingEl.getAttribute('data-opening-id') ?? '';
      const wall = geometry.walls.find((w) => w.wallId === wallId);
      const opening = wall?.openings.find((o) => o.openingId === openingId);
      const p = toPlan(e.clientX, e.clientY);
      if (wall !== undefined && opening !== undefined && p !== undefined && opening.rect !== undefined) {
        drag.current = { ...base, kind: 'opening', wallId, openingId, grabOffset: alongFromStart(wall, p) - opening.s0, txn };
      } else {
        drag.current = { ...base, kind: 'pan' };
      }
    } else {
      drag.current = { ...base, kind: 'pan' };
    }
    // Ponteiro sintético (testes) não tem id ativo: capturar é conveniência, não requisito.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* sem captura */
    }
  };

  const applyDrag = (): void => {
    frame.current = undefined;
    const d = drag.current;
    const ev = pending.current;
    pending.current = undefined;
    if (d === undefined || ev === undefined || d.kind === 'pan') return;
    const p = toPlan(ev.clientX, ev.clientY);
    const wall = latest.current.geometry.walls.find((w) => w.wallId === d.wallId);
    if (p === undefined || wall === undefined) return;
    const step = ev.shift ? SNAP_FINE : SNAP_COARSE;
    if (d.kind === 'endpoint') {
      onEndpointDrag?.(d.wallId, d.end, draggedEndpoint(wall, d.end, p, step), d.txn);
    } else {
      const opening = wall.openings.find((o) => o.openingId === d.openingId);
      if (opening === undefined) return;
      const s0 = draggedOpeningStart(wall, opening, alongFromStart(wall, p), d.grabOffset, step);
      if (s0 !== opening.s0) onOpeningDrag?.(d.wallId, d.openingId, s0, opening.s1 - opening.s0, d.txn);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const d = drag.current;
    if (d === undefined) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < CLICK_SLOP_PX) return;
    d.moved = true;
    if (d.kind === 'pan') {
      d.x = e.clientX;
      d.y = e.clientY;
      setViewport((v) => (v === undefined ? v : panBy(v, dx, dy)));
      return;
    }
    // Peça: no máximo um dispatch por quadro.
    pending.current = { clientX: e.clientX, clientY: e.clientY, shift: e.shiftKey };
    if (frame.current === undefined) frame.current = requestAnimationFrame(applyDrag);
  };

  const finishDrag = (e: ReactPointerEvent<SVGSVGElement>, cancelled: boolean): void => {
    const d = drag.current;
    drag.current = undefined;
    if (frame.current !== undefined) {
      cancelAnimationFrame(frame.current);
      frame.current = undefined;
      if (!cancelled) applyDrag();
    }
    pending.current = undefined;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (d === undefined) return;
    if (d.kind !== 'pan' && d.moved) {
      onDragEnd?.();
      return;
    }
    if (d.moved || cancelled) return;
    // Clique sem arraste: seleciona o que estava sob o ponteiro.
    const el = d.target instanceof Element ? d.target : null;
    const wallId = el?.closest('[data-wall-id]')?.getAttribute('data-wall-id') ?? undefined;
    const openingId = el?.closest('[data-opening-id]')?.getAttribute('data-opening-id') ?? undefined;
    if (wallId !== undefined && openingId !== undefined) onSelect({ kind: 'opening', wallId, openingId });
    else if (wallId !== undefined) onSelect({ kind: 'wall', wallId });
    else onSelect({ kind: 'none' });
  };

  const fit = (): void => {
    if (size !== undefined && bounds !== undefined) animateTo(fitViewport(bounds, size, FIT_PADDING_PX));
  };
  useImperativeHandle(
    ref,
    () => ({
      fit,
      focusWall: (wallId) => {
        const { geometry: g, viewport: v } = latest.current;
        if (v === undefined || size === undefined) return;
        const wall = g.walls.find((w) => w.wallId === wallId);
        const broken = wall === undefined ? g.broken.find((b) => b.wallId === wallId) : undefined;
        const rect = wall?.rect ?? (broken === undefined ? undefined : segmentRect(broken.start, broken.end, 5.5));
        if (rect === undefined || rectVisible(v, rect, size)) return;
        animateTo(centerOn(v, rect, size, FIT_PADDING_PX));
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size?.width, size?.height, bounds],
  );

  const visible = geometry.walls.filter((w) => level === 'all' || w.level === level);
  const selectedWall = selection.kind === 'wall' || selection.kind === 'opening' ? selection.wallId : undefined;
  const selectedOpening = selection.kind === 'opening' ? selection.openingId : undefined;
  const selectedGeom = selectedWall === undefined ? undefined : visible.find((w) => w.wallId === selectedWall);
  const severity = (wallId: string): 'problem' | 'warning' | undefined => {
    const list = issuesByWall.get(wallId);
    if (list === undefined || list.length === 0) return undefined;
    return list.some((i) => i.severity === 'problem') ? 'problem' : 'warning';
  };
  const draggable = onEndpointDrag !== undefined;

  const hint = draggable ? 'Click to select · drag ends and openings (Shift = 1/8") · drag the background to pan · scroll to zoom' : 'Click to select · drag to pan · scroll to zoom';

  return (
    <div className={cn(fill ? 'flex h-full min-h-0 flex-col gap-2' : 'space-y-2', className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {fill ? null : (
          <>
            <p className="eyebrow mr-1">Plan</p>
            <Badge variant="secondary">{geometry.walls.length} walls</Badge>
          </>
        )}
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
        <Button variant="ghost" size="xs" onClick={fit} title="Fit the plan in view">
          <MaximizeIcon /> Fit
        </Button>
        {fill ? <div className="ml-auto flex items-center gap-1">{toolbar}</div> : <span className="ml-auto text-[12px] text-ink-3">{hint}</span>}
      </div>
      <div ref={containerRef} data-plan-canvas className={cn('relative w-full overflow-hidden rounded-md border bg-paper-2', fill ? 'min-h-0 flex-1' : 'aspect-[4/3] min-h-[360px]')}>
        <svg
          ref={svgRef}
          role="img"
          aria-label={`Plan, ${geometry.walls.length} walls`}
          width="100%"
          height="100%"
          className="block touch-none select-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finishDrag(e, false)}
          onPointerCancel={(e) => finishDrag(e, true)}
        >
          {viewport !== undefined && size !== undefined ? (
            <>
              <Origin viewport={viewport} />
              {visible.map((w) => (
                <Wall key={w.wallId} wall={w} viewport={viewport} selected={selectedWall === w.wallId} selectedOpening={selectedWall === w.wallId ? selectedOpening : undefined} severity={severity(w.wallId)} draggable={draggable} />
              ))}
              {geometry.broken.map((b) => {
                const a = planToScreen(viewport, b.start);
                const z = planToScreen(viewport, b.end);
                return (
                  <g key={b.wallId} data-wall-id={b.wallId}>
                    <title>{b.error}</title>
                    <line x1={a.x} y1={a.y} x2={z.x} y2={z.y} stroke="var(--color-destructive)" strokeWidth={3} strokeDasharray="6 4" />
                    <Label x={(a.x + z.x) / 2} y={(a.y + z.y) / 2} text={b.wallId} tone="destructive" />
                  </g>
                );
              })}
              {selectedGeom !== undefined && draggable ? <Handles key={selectedGeom.wallId} wall={selectedGeom} viewport={viewport} /> : null}
              {northAngle !== undefined ? <North x={size.width - 28} y={28} angle={northAngle} /> : null}
            </>
          ) : null}
        </svg>
        {geometry.walls.length === 0 && geometry.broken.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">Nothing to draw yet.</p>
        ) : null}
      </div>
      {fill ? <p className="shrink-0 truncate text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

function Wall({ wall, viewport, selected, selectedOpening, severity, draggable }: { wall: WallGeom; viewport: Viewport; selected: boolean; selectedOpening: string | undefined; severity: 'problem' | 'warning' | undefined; draggable: boolean }) {
  const r = rectToScreen(viewport, wall.rect);
  // Cor do traço = estado (problema err, aviso gold-700, normal navy); seleção é um halo navy-600 por fora,
  // para parede selecionada e parede com aviso nunca se confundirem (M1, docs/10-design.md §2).
  const stroke = severity === 'problem' ? 'var(--color-destructive)' : severity === 'warning' ? 'var(--color-warning)' : 'var(--color-navy-900)';
  const mid = planToScreen(viewport, { x: (wall.plateStart.x + wall.plateEnd.x) / 2, y: (wall.plateStart.y + wall.plateEnd.y) / 2 });
  const thickPx = wall.thickness * viewport.scale;
  // Rótulo fora da parede quando ela é fina na tela: deslocado perpendicularmente ao eixo.
  const labelOffset = thickPx >= 14 ? 0 : thickPx / 2 + 9;
  const label = wall.dir === 'x' ? { x: mid.x, y: mid.y - labelOffset } : { x: mid.x + labelOffset, y: mid.y };
  const dim = wall.dir === 'x' ? { x: mid.x, y: mid.y + thickPx / 2 + 14 } : { x: mid.x - thickPx / 2 - 14, y: mid.y };
  return (
    <g data-wall-id={wall.wallId} data-selected={selected || undefined} data-severity={severity} className="cursor-pointer">
      <title>{`${wall.wallId} · ${wall.section} · ${wall.exterior ? 'exterior' : 'interior'} · plate ${formatMeasure(wall.plateLength)}${wall.framed ? '' : ' (not framed: plan doesn’t close)'}`}</title>
      {/* Halo de seleção sempre presente: entra e sai em 200 ms (M4). */}
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="var(--color-selection)" strokeWidth={8} strokeOpacity={selected ? 0.22 : 0} strokeLinejoin="round" pointerEvents="none" style={HALO_TRANSITION} />
      <rect className="wall-body" x={r.x} y={r.y} width={r.w} height={r.h} fill={wall.exterior ? 'var(--color-gold-100)' : 'var(--color-paper-3)'} stroke={selected && severity === undefined ? 'var(--color-selection)' : stroke} strokeWidth={selected ? 2 : 1.25} strokeDasharray={wall.framed ? undefined : '5 3'} style={STROKE_TRANSITION} />
      {wall.openings.map((o) => (
        <Opening key={o.openingId} wall={wall} opening={o} viewport={viewport} selected={selectedOpening === o.openingId} draggable={draggable} />
      ))}
      <Label x={label.x} y={label.y} text={wall.wallId} tone={selected ? 'selected' : 'ink'} vertical={wall.dir === 'y' && labelOffset === 0} />
      {selected ? <Label x={dim.x} y={dim.y} text={`${formatMeasure(wall.plateLength)} plate · ${formatMeasure(wall.length)} axis`} tone="muted" vertical={wall.dir === 'y'} /> : null}
    </g>
  );
}

/** Alças nas pontas da parede selecionada; o hit-test é o círculo maior transparente. */
function Handles({ wall, viewport }: { wall: WallGeom; viewport: Viewport }) {
  const cursor = wall.dir === 'x' ? 'ew-resize' : 'ns-resize';
  return (
    <g data-wall-id={wall.wallId} aria-hidden className="handle-pop">
      {(['start', 'end'] as const).map((end) => {
        const p = planToScreen(viewport, wall[end]);
        return (
          <g key={end} data-handle={end} style={{ cursor }}>
            <circle cx={p.x} cy={p.y} r={HANDLE_HIT_RADIUS} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={HANDLE_RADIUS} fill="var(--color-selection)" stroke="var(--color-card)" strokeWidth={2} />
          </g>
        );
      })}
    </g>
  );
}

function Opening({ wall, opening, viewport, selected, draggable }: { wall: WallGeom; opening: OpeningGeom; viewport: Viewport; selected: boolean; draggable: boolean }) {
  if (opening.rect === undefined) return null;
  const r = rectToScreen(viewport, opening.rect);
  const horizontal = wall.dir === 'x';
  const stroke = opening.resolved ? (selected ? 'var(--color-selection)' : 'var(--color-navy-900)') : 'var(--color-destructive)';
  const center = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const wide = (horizontal ? r.w : r.h) > 22;
  return (
    <g data-opening-id={opening.openingId} style={{ cursor: draggable ? (horizontal ? 'ew-resize' : 'ns-resize') : 'pointer' }}>
      <title>{`${opening.openingId} · ${opening.type ?? '?'} · ${formatMeasure(opening.s1 - opening.s0)} wide, left edge ${formatMeasure(opening.s0)} from start${opening.error === undefined ? '' : ` · ${opening.error}`}`}</title>
      {/* Vão: apaga a parede; batentes nas duas pontas; janela ganha a linha do vidro no eixo. */}
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="var(--color-selection)" strokeWidth={8} strokeOpacity={selected ? 0.22 : 0} strokeLinejoin="round" pointerEvents="none" style={HALO_TRANSITION} />
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="var(--color-card)" stroke={selected ? stroke : 'none'} strokeWidth={2} strokeDasharray={opening.resolved ? undefined : '3 2'} />
      {horizontal ? (
        <>
          <line x1={r.x} y1={r.y} x2={r.x} y2={r.y + r.h} className="opening-jamb" stroke={stroke} strokeWidth={1.25} style={STROKE_TRANSITION} />
          <line x1={r.x + r.w} y1={r.y} x2={r.x + r.w} y2={r.y + r.h} className="opening-jamb" stroke={stroke} strokeWidth={1.25} style={STROKE_TRANSITION} />
          {opening.type === 'window' ? <line x1={r.x} y1={center.y} x2={r.x + r.w} y2={center.y} stroke={stroke} strokeWidth={1} /> : null}
        </>
      ) : (
        <>
          <line x1={r.x} y1={r.y} x2={r.x + r.w} y2={r.y} className="opening-jamb" stroke={stroke} strokeWidth={1.25} style={STROKE_TRANSITION} />
          <line x1={r.x} y1={r.y + r.h} x2={r.x + r.w} y2={r.y + r.h} className="opening-jamb" stroke={stroke} strokeWidth={1.25} style={STROKE_TRANSITION} />
          {opening.type === 'window' ? <line x1={center.x} y1={r.y} x2={center.x} y2={r.y + r.h} stroke={stroke} strokeWidth={1} /> : null}
        </>
      )}
      {!opening.resolved ? <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={stroke} strokeWidth={1} strokeDasharray="3 2" /> : null}
      {wide ? <Label x={horizontal ? center.x : center.x + r.w / 2 + 8} y={horizontal ? center.y - r.h / 2 - 7 : center.y} text={selected ? `${opening.openingId} · edge ${formatMeasure(opening.s0)}` : opening.openingId} tone={selected ? 'selected' : 'muted'} small vertical={!horizontal} /> : null}
    </g>
  );
}

function Label({ x, y, text, tone, small = false, vertical = false }: { x: number; y: number; text: string; tone: 'ink' | 'muted' | 'selected' | 'destructive'; small?: boolean; vertical?: boolean }) {
  const fill = tone === 'ink' ? 'var(--color-ink)' : tone === 'muted' ? 'var(--color-ink-2)' : tone === 'selected' ? 'var(--color-selection)' : 'var(--color-destructive)';
  return (
    <text
      x={x}
      y={y}
      fontSize={small ? 9 : 11}
      fontFamily="var(--font-mono)"
      fontWeight={tone === 'selected' ? 600 : 500}
      fill={fill}
      textAnchor="middle"
      dominantBaseline="middle"
      transform={vertical ? `rotate(-90 ${x} ${y})` : undefined}
      style={{ paintOrder: 'stroke', stroke: 'var(--color-paper-2)', strokeWidth: 3, strokeLinejoin: 'round' }}
      pointerEvents="none"
    >
      {text}
    </text>
  );
}

function Origin({ viewport }: { viewport: Viewport }) {
  const o = planToScreen(viewport, { x: 0, y: 0 });
  return (
    <g pointerEvents="none" aria-hidden>
      <line x1={o.x - 10} y1={o.y} x2={o.x + 10} y2={o.y} stroke="var(--color-ink-3)" strokeWidth={1} />
      <line x1={o.x} y1={o.y - 10} x2={o.x} y2={o.y + 10} stroke="var(--color-ink-3)" strokeWidth={1} />
      <text x={o.x + 6} y={o.y + 12} fontSize={9} fontFamily="var(--font-mono)" fill="var(--color-ink-3)">
        0,0
      </text>
    </g>
  );
}

function North({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g transform={`rotate(${angle} ${x} ${y})`} pointerEvents="none" aria-hidden>
      <polygon points={`${x},${y - 14} ${x - 6},${y + 8} ${x},${y + 3} ${x + 6},${y + 8}`} fill="var(--color-navy-900)" />
      <text x={x} y={y + 20} fontSize={10} fontFamily="var(--font-mono)" fontWeight={600} fill="var(--color-navy-900)" textAnchor="middle">
        N
      </text>
    </g>
  );
}
