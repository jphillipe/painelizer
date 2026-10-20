'use client';

import { MaximizeIcon } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { OpeningGeom, PlanGeometry, WallGeom } from '@/lib/editor/geometry';
import { formatMeasure } from '@/lib/editor/measure';
import type { Issue } from '@/lib/editor/problems';
import type { Selection } from '@/lib/editor/state';
import { fitViewport, panBy, planToScreen, rectToScreen, zoomAt, type Size, type Viewport } from '@/lib/editor/viewport';
import { cn } from '@/lib/utils';

export interface PlanCanvasProps {
  geometry: PlanGeometry;
  selection: Selection;
  issuesByWall: ReadonlyMap<string | undefined, Issue[]>;
  northAngle?: number | undefined;
  /** Muda quando outro projeto entra (ou o número de paredes): reenquadra. Edições comuns não mexem no zoom. */
  fitKey: string;
  onSelect: (s: Selection) => void;
  /** Tamanho antes de medir o container (SSR e testes). */
  initialSize?: Size | undefined;
  className?: string;
}

const WHEEL_ZOOM = 0.0015;
const CLICK_SLOP_PX = 3;
const FIT_PADDING_PX = 40;

/**
 * Planta do editor em SVG React (S21.2): paredes com a espessura real e as plates como o motor enquadra,
 * aberturas como vãos, ids, origem e norte. Clique seleciona parede ou abertura (hit-test pelos `data-*` do
 * próprio SVG); arrastar o fundo faz pan; a roda dá zoom na posição do ponteiro. Cada ponto é convertido com
 * o viewport em JS (sem transform CSS), por isso rótulos ficam em pé e traços em px. Arraste de peças: S21.3.
 */
export function PlanCanvas({ geometry, selection, issuesByWall, northAngle, fitKey, onSelect, initialSize, className }: PlanCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<Size | undefined>(initialSize);
  const [viewport, setViewport] = useState<Viewport | undefined>(() => (initialSize !== undefined && geometry.bounds !== undefined ? fitViewport(geometry.bounds, initialSize, FIT_PADDING_PX) : undefined));
  const [level, setLevel] = useState<number | 'all'>('all');
  const drag = useRef<{ x: number; y: number; moved: boolean; target: EventTarget | null } | undefined>(undefined);

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
      const rect = svg.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setViewport((v) => (v === undefined ? v : zoomAt(v, anchor, Math.exp(-e.deltaY * WHEEL_ZOOM))));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0 && e.button !== 1) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false, target: e.target };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const d = drag.current;
    if (d === undefined) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < CLICK_SLOP_PX) return;
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    setViewport((v) => (v === undefined ? v : panBy(v, dx, dy)));
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const d = drag.current;
    drag.current = undefined;
    if (d === undefined || d.moved) return;
    const el = d.target instanceof Element ? d.target : null;
    const openingEl = el?.closest('[data-opening-id]');
    const wallEl = el?.closest('[data-wall-id]');
    const wallId = wallEl?.getAttribute('data-wall-id') ?? undefined;
    const openingId = openingEl?.getAttribute('data-opening-id') ?? undefined;
    if (wallId !== undefined && openingId !== undefined) onSelect({ kind: 'opening', wallId, openingId });
    else if (wallId !== undefined) onSelect({ kind: 'wall', wallId });
    else onSelect({ kind: 'none' });
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const fit = (): void => {
    if (size !== undefined && bounds !== undefined) setViewport(fitViewport(bounds, size, FIT_PADDING_PX));
  };

  const visible = geometry.walls.filter((w) => level === 'all' || w.level === level);
  const selectedWall = selection.kind === 'wall' || selection.kind === 'opening' ? selection.wallId : undefined;
  const selectedOpening = selection.kind === 'opening' ? selection.openingId : undefined;
  const severity = (wallId: string): 'problem' | 'warning' | undefined => {
    const list = issuesByWall.get(wallId);
    if (list === undefined || list.length === 0) return undefined;
    return list.some((i) => i.severity === 'problem') ? 'problem' : 'warning';
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="eyebrow mr-1">Plan</p>
        <Badge variant="secondary">{geometry.walls.length} walls</Badge>
        {geometry.houseError !== undefined ? (
          <Badge className="bg-destructive text-paper" title={geometry.houseError}>
            plan doesn’t close
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
        <span className="ml-auto text-[12px] text-ink-3">Click to select · drag to pan · scroll to zoom</span>
        <Button variant="ghost" size="xs" onClick={fit} title="Fit the plan in view">
          <MaximizeIcon /> Fit
        </Button>
      </div>
      <div ref={containerRef} className="relative aspect-[4/3] min-h-[360px] w-full overflow-hidden rounded-md border bg-paper-2">
        <svg
          ref={svgRef}
          role="img"
          aria-label={`Plan, ${geometry.walls.length} walls`}
          width="100%"
          height="100%"
          className="block touch-none select-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = undefined;
          }}
        >
          {viewport !== undefined && size !== undefined ? (
            <>
              <Origin viewport={viewport} />
              {visible.map((w) => (
                <Wall key={w.wallId} wall={w} viewport={viewport} selected={selectedWall === w.wallId} selectedOpening={selectedWall === w.wallId ? selectedOpening : undefined} severity={severity(w.wallId)} />
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
              {northAngle !== undefined ? <North x={size.width - 28} y={28} angle={northAngle} /> : null}
            </>
          ) : null}
        </svg>
        {geometry.walls.length === 0 && geometry.broken.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">Nothing to draw yet.</p>
        ) : null}
      </div>
    </div>
  );
}

function Wall({ wall, viewport, selected, selectedOpening, severity }: { wall: WallGeom; viewport: Viewport; selected: boolean; selectedOpening: string | undefined; severity: 'problem' | 'warning' | undefined }) {
  const r = rectToScreen(viewport, wall.rect);
  const stroke = severity === 'problem' ? 'var(--color-destructive)' : selected ? 'var(--color-gold)' : severity === 'warning' ? 'var(--color-warning)' : 'var(--color-navy-900)';
  const mid = planToScreen(viewport, { x: (wall.plateStart.x + wall.plateEnd.x) / 2, y: (wall.plateStart.y + wall.plateEnd.y) / 2 });
  const thickPx = wall.thickness * viewport.scale;
  // Rótulo fora da parede quando ela é fina na tela: deslocado perpendicularmente ao eixo.
  const labelOffset = thickPx >= 14 ? 0 : thickPx / 2 + 9;
  const label = wall.dir === 'x' ? { x: mid.x, y: mid.y - labelOffset } : { x: mid.x + labelOffset, y: mid.y };
  const dim = wall.dir === 'x' ? { x: mid.x, y: mid.y + thickPx / 2 + 14 } : { x: mid.x - thickPx / 2 - 14, y: mid.y };
  return (
    <g data-wall-id={wall.wallId} data-selected={selected || undefined} className="cursor-pointer">
      <title>{`${wall.wallId} · ${wall.section} · ${wall.exterior ? 'exterior' : 'interior'} · plate ${formatMeasure(wall.plateLength)}${wall.framed ? '' : ' (not framed: plan doesn’t close)'}`}</title>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={wall.exterior ? 'var(--color-gold-100)' : 'var(--color-paper-3)'} stroke={stroke} strokeWidth={selected ? 2.5 : 1.25} strokeDasharray={wall.framed ? undefined : '5 3'} />
      {wall.openings.map((o) => (
        <Opening key={o.openingId} wall={wall} opening={o} viewport={viewport} selected={selectedOpening === o.openingId} />
      ))}
      <Label x={label.x} y={label.y} text={wall.wallId} tone={selected ? 'selected' : 'ink'} vertical={wall.dir === 'y' && labelOffset === 0} />
      {selected ? <Label x={dim.x} y={dim.y} text={formatMeasure(wall.plateLength)} tone="muted" vertical={wall.dir === 'y'} /> : null}
    </g>
  );
}

function Opening({ wall, opening, viewport, selected }: { wall: WallGeom; opening: OpeningGeom; viewport: Viewport; selected: boolean }) {
  if (opening.rect === undefined) return null;
  const r = rectToScreen(viewport, opening.rect);
  const horizontal = wall.dir === 'x';
  const stroke = opening.resolved ? (selected ? 'var(--color-gold)' : 'var(--color-navy-900)') : 'var(--color-destructive)';
  const center = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const wide = (horizontal ? r.w : r.h) > 22;
  return (
    <g data-opening-id={opening.openingId} className="cursor-pointer">
      <title>{`${opening.openingId} · ${opening.type ?? '?'} · ${formatMeasure(opening.s1 - opening.s0)} wide, left edge ${formatMeasure(opening.s0)} from start${opening.error === undefined ? '' : ` · ${opening.error}`}`}</title>
      {/* Vão: apaga a parede; batentes nas duas pontas; janela ganha a linha do vidro no eixo. */}
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="var(--color-card)" stroke={selected ? stroke : 'none'} strokeWidth={2} strokeDasharray={opening.resolved ? undefined : '3 2'} />
      {horizontal ? (
        <>
          <line x1={r.x} y1={r.y} x2={r.x} y2={r.y + r.h} stroke={stroke} strokeWidth={1.25} />
          <line x1={r.x + r.w} y1={r.y} x2={r.x + r.w} y2={r.y + r.h} stroke={stroke} strokeWidth={1.25} />
          {opening.type === 'window' ? <line x1={r.x} y1={center.y} x2={r.x + r.w} y2={center.y} stroke={stroke} strokeWidth={1} /> : null}
        </>
      ) : (
        <>
          <line x1={r.x} y1={r.y} x2={r.x + r.w} y2={r.y} stroke={stroke} strokeWidth={1.25} />
          <line x1={r.x} y1={r.y + r.h} x2={r.x + r.w} y2={r.y + r.h} stroke={stroke} strokeWidth={1.25} />
          {opening.type === 'window' ? <line x1={center.x} y1={r.y} x2={center.x} y2={r.y + r.h} stroke={stroke} strokeWidth={1} /> : null}
        </>
      )}
      {!opening.resolved ? <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={stroke} strokeWidth={1} strokeDasharray="3 2" /> : null}
      {wide ? <Label x={horizontal ? center.x : center.x + r.w / 2 + 8} y={horizontal ? center.y - r.h / 2 - 7 : center.y} text={opening.openingId} tone={selected ? 'selected' : 'muted'} small vertical={!horizontal} /> : null}
    </g>
  );
}

function Label({ x, y, text, tone, small = false, vertical = false }: { x: number; y: number; text: string; tone: 'ink' | 'muted' | 'selected' | 'destructive'; small?: boolean; vertical?: boolean }) {
  const fill = tone === 'ink' ? 'var(--color-ink)' : tone === 'muted' ? 'var(--color-ink-2)' : tone === 'selected' ? 'var(--color-gold-600)' : 'var(--color-destructive)';
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
