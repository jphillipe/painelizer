'use client';

import type { ShownBreaks } from '@/lib/editor/breaks';
import type { Point } from '@/lib/editor/draft';
import type { DrawSnap } from '@/lib/editor/draw';
import { pointAlong, type BrokenWall as BrokenWallGeom, type OpeningGeom, type WallGeom } from '@/lib/editor/geometry';
import { formatMeasure } from '@/lib/editor/measure';
import { planToScreen, rectToScreen, type Size, type Viewport } from '@/lib/editor/viewport';
import { noticeText } from '@/lib/notices';
import { cn } from '@/lib/utils';

/**
 * Primitivas da planta do editor (S30, saídas do `plan-canvas.tsx`): SVG React em px de tela — cada ponto passa
 * pelo viewport em JS (sem transform CSS), por isso rótulos ficam em pé e traços em px. O hit-test do canvas lê os
 * `data-*` daqui (`data-wall-id`, `data-opening-id`, `data-handle`, `data-break-index`, `data-break-candidate`).
 */

/** Transições do traço (M4): seleção, aviso e hover mudam de cor sem pular. */
const STROKE_TRANSITION = { transition: 'stroke 200ms var(--ease-site), stroke-width 200ms var(--ease-site)' } as const;
const HALO_TRANSITION = { transition: 'stroke-opacity 200ms var(--ease-site)' } as const;
const HANDLE_RADIUS = 6;
const HANDLE_HIT_RADIUS = 12;

/** Grade de `step` polegadas ancorada na origem da planta (M5): `<pattern>` em px, deslocado para a marca 0 cair no 0,0. */
export function Grid({ viewport, step }: { viewport: Viewport; step: number }) {
  const px = step * viewport.scale;
  const o = planToScreen(viewport, { x: 0, y: 0 });
  const mod = (n: number): number => ((n % px) + px) % px;
  return (
    <>
      <defs>
        <pattern id="plan-grid" width={px} height={px} patternUnits="userSpaceOnUse" x={mod(o.x)} y={mod(o.y)}>
          <path d={`M ${px} 0 L 0 0 0 ${px}`} fill="none" stroke="var(--line-faint)" strokeWidth={1} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#plan-grid)" pointerEvents="none" aria-hidden />
    </>
  );
}

/**
 * Parede com a espessura real e as plates como o motor enquadra. `movable` (S30): selecionada, o corpo se arrasta
 * (cursor de mover); `drawing`: no modo "Draw wall" nada aqui pede clique (o cursor é o do desenho).
 */
export function Wall({
  wall,
  viewport,
  selected,
  selectedOpening,
  severity,
  draggable,
  movable = false,
  drawing = false,
}: {
  wall: WallGeom;
  viewport: Viewport;
  selected: boolean;
  selectedOpening: string | undefined;
  severity: 'problem' | 'warning' | undefined;
  draggable: boolean;
  movable?: boolean;
  drawing?: boolean;
}) {
  const r = rectToScreen(viewport, wall.rect);
  // Cor do traço = estado (problema err, aviso gold-700, normal navy); seleção é um halo navy-600 por fora,
  // para parede selecionada e parede com aviso nunca se confundirem (M1, docs/10-design.md §2).
  const stroke =
    severity === 'problem'
      ? 'var(--color-destructive)'
      : severity === 'warning'
        ? 'var(--color-warning)'
        : 'var(--color-navy-900)';
  const mid = planToScreen(viewport, {
    x: (wall.plateStart.x + wall.plateEnd.x) / 2,
    y: (wall.plateStart.y + wall.plateEnd.y) / 2,
  });
  const thickPx = wall.thickness * viewport.scale;
  // Rótulo fora da parede quando ela é fina na tela: deslocado perpendicularmente ao eixo.
  const labelOffset = thickPx >= 14 ? 0 : thickPx / 2 + 9;
  const label = wall.dir === 'x' ? { x: mid.x, y: mid.y - labelOffset } : { x: mid.x + labelOffset, y: mid.y };
  const dim = wall.dir === 'x' ? { x: mid.x, y: mid.y + thickPx / 2 + 14 } : { x: mid.x - thickPx / 2 - 14, y: mid.y };
  return (
    <g
      data-wall-id={wall.wallId}
      data-selected={selected || undefined}
      data-severity={severity}
      className={drawing ? undefined : movable ? 'cursor-move' : 'cursor-pointer'}
    >
      <title>{`${wall.wallId} · ${wall.section} · ${wall.exterior ? 'exterior' : 'interior'} · plate ${formatMeasure(wall.plateLength)}${wall.framed ? '' : ' (not framed: plan doesn’t close)'}${movable ? ' · drag to move' : ''}`}</title>
      {/* Halo de seleção sempre presente: entra e sai em 200 ms (M4). */}
      <rect
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        fill="none"
        stroke="var(--color-selection)"
        strokeWidth={8}
        strokeOpacity={selected ? 0.22 : 0}
        strokeLinejoin="round"
        pointerEvents="none"
        style={HALO_TRANSITION}
      />
      <rect
        className="wall-body"
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        fill={wall.exterior ? 'var(--color-gold-100)' : 'var(--color-paper-3)'}
        stroke={selected && severity === undefined ? 'var(--color-selection)' : stroke}
        strokeWidth={selected ? 2 : 1.25}
        strokeDasharray={wall.framed ? undefined : '5 3'}
        style={STROKE_TRANSITION}
      />
      {wall.openings.map((o) => (
        <Opening
          key={o.openingId}
          wall={wall}
          opening={o}
          viewport={viewport}
          selected={selectedOpening === o.openingId}
          draggable={draggable && !drawing}
        />
      ))}
      <Label
        x={label.x}
        y={label.y}
        text={wall.wallId}
        tone={selected ? 'selected' : 'ink'}
        vertical={wall.dir === 'y' && labelOffset === 0}
      />
      {selected ? (
        <Label
          x={dim.x}
          y={dim.y}
          text={`${formatMeasure(wall.plateLength)} plate · ${formatMeasure(wall.length)} axis`}
          tone="muted"
          vertical={wall.dir === 'y'}
        />
      ) : null}
    </g>
  );
}

/**
 * Quebras de painel de uma parede (S29): um traço através da parede em cada quebra — cheio na cor da seleção
 * quando é do revisor, tracejado quando é do motor. Na parede selecionada e editável, os candidatos livres são
 * pontos no eixo e cada traço tem uma área de pega.
 */
export function PanelBreaks({
  wall,
  viewport,
  shown,
  selected,
  editable,
}: {
  wall: WallGeom;
  viewport: Viewport;
  shown: ShownBreaks;
  selected: boolean;
  editable: boolean;
}) {
  const half = (wall.thickness * viewport.scale) / 2 + 5;
  const across = (s: number): { x1: number; y1: number; x2: number; y2: number } => {
    const p = planToScreen(viewport, pointAlong(wall, s));
    return wall.dir === 'x'
      ? { x1: p.x, y1: p.y - half, x2: p.x, y2: p.y + half }
      : { x1: p.x - half, y1: p.y, x2: p.x + half, y2: p.y };
  };
  const stroke = shown.manual ? 'var(--color-selection)' : 'var(--color-ink-2)';
  const free =
    selected && editable ? shown.candidates.filter((c) => !shown.breaks.some((b) => Math.abs(b - c) < 1e-6)) : [];
  const cursor = wall.dir === 'x' ? 'ew-resize' : 'ns-resize';
  return (
    <g data-wall-id={wall.wallId} data-panel-breaks={shown.manual ? 'manual' : 'auto'}>
      {free.map((c) => {
        const p = planToScreen(viewport, pointAlong(wall, c));
        return (
          <g key={`c-${c}`} data-break-candidate={c} style={{ cursor: 'copy' }}>
            <title>{`Add a panel break at ${formatMeasure(c)} from start`}</title>
            <circle cx={p.x} cy={p.y} r={7} fill="transparent" />
            <circle
              cx={p.x}
              cy={p.y}
              r={2.5}
              fill="var(--color-card)"
              stroke="var(--color-selection)"
              strokeWidth={1.25}
            />
          </g>
        );
      })}
      {shown.breaks.map((b, i) => {
        const l = across(b);
        return (
          <g
            key={`b-${i}`}
            data-break-index={selected && editable ? i : undefined}
            style={selected && editable ? { cursor } : undefined}
          >
            <title>{`Panel break at ${formatMeasure(b)} from start · ${shown.manual ? 'set by you' : 'automatic'}${selected && editable ? ' · drag to move, double-click to remove' : ''}`}</title>
            {selected && editable ? <line {...l} stroke="transparent" strokeWidth={12} /> : null}
            <line
              {...l}
              stroke={stroke}
              strokeWidth={selected ? 2.5 : 1.5}
              strokeDasharray={shown.manual ? undefined : '4 3'}
              pointerEvents={selected && editable ? undefined : 'none'}
            />
          </g>
        );
      })}
    </g>
  );
}

/** Alças nas pontas da parede selecionada; o hit-test é o círculo maior transparente. */
export function Handles({ wall, viewport }: { wall: WallGeom; viewport: Viewport }) {
  const cursor = wall.dir === 'x' ? 'ew-resize' : 'ns-resize';
  return (
    <g data-wall-id={wall.wallId} aria-hidden className="handle-pop">
      {(['start', 'end'] as const).map((end) => {
        const p = planToScreen(viewport, wall[end]);
        return (
          <g key={end} data-handle={end} style={{ cursor }}>
            <circle cx={p.x} cy={p.y} r={HANDLE_HIT_RADIUS} fill="transparent" />
            <circle
              cx={p.x}
              cy={p.y}
              r={HANDLE_RADIUS}
              fill="var(--color-selection)"
              stroke="var(--color-card)"
              strokeWidth={2}
            />
          </g>
        );
      })}
    </g>
  );
}

export function Opening({
  wall,
  opening,
  viewport,
  selected,
  draggable,
}: {
  wall: WallGeom;
  opening: OpeningGeom;
  viewport: Viewport;
  selected: boolean;
  draggable: boolean;
}) {
  if (opening.rect === undefined) return null;
  const r = rectToScreen(viewport, opening.rect);
  const horizontal = wall.dir === 'x';
  const stroke = opening.resolved
    ? selected
      ? 'var(--color-selection)'
      : 'var(--color-navy-900)'
    : 'var(--color-destructive)';
  const center = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const wide = (horizontal ? r.w : r.h) > 22;
  return (
    <g
      data-opening-id={opening.openingId}
      style={{ cursor: draggable ? (horizontal ? 'ew-resize' : 'ns-resize') : 'pointer' }}
    >
      <title>{`${opening.openingId} · ${opening.type ?? '?'} · ${formatMeasure(opening.s1 - opening.s0)} wide, left edge ${formatMeasure(opening.s0)} from start${opening.error === undefined ? '' : ` · ${opening.error}`}`}</title>
      {/* Vão: apaga a parede; batentes nas duas pontas; janela ganha a linha do vidro no eixo. */}
      <rect
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        fill="none"
        stroke="var(--color-selection)"
        strokeWidth={8}
        strokeOpacity={selected ? 0.22 : 0}
        strokeLinejoin="round"
        pointerEvents="none"
        style={HALO_TRANSITION}
      />
      <rect
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        fill="var(--color-card)"
        stroke={selected ? stroke : 'none'}
        strokeWidth={2}
        strokeDasharray={opening.resolved ? undefined : '3 2'}
      />
      {horizontal ? (
        <>
          <line
            x1={r.x}
            y1={r.y}
            x2={r.x}
            y2={r.y + r.h}
            className="opening-jamb"
            stroke={stroke}
            strokeWidth={1.25}
            style={STROKE_TRANSITION}
          />
          <line
            x1={r.x + r.w}
            y1={r.y}
            x2={r.x + r.w}
            y2={r.y + r.h}
            className="opening-jamb"
            stroke={stroke}
            strokeWidth={1.25}
            style={STROKE_TRANSITION}
          />
          {opening.type === 'window' ? (
            <line x1={r.x} y1={center.y} x2={r.x + r.w} y2={center.y} stroke={stroke} strokeWidth={1} />
          ) : null}
        </>
      ) : (
        <>
          <line
            x1={r.x}
            y1={r.y}
            x2={r.x + r.w}
            y2={r.y}
            className="opening-jamb"
            stroke={stroke}
            strokeWidth={1.25}
            style={STROKE_TRANSITION}
          />
          <line
            x1={r.x}
            y1={r.y + r.h}
            x2={r.x + r.w}
            y2={r.y + r.h}
            className="opening-jamb"
            stroke={stroke}
            strokeWidth={1.25}
            style={STROKE_TRANSITION}
          />
          {opening.type === 'window' ? (
            <line x1={center.x} y1={r.y} x2={center.x} y2={r.y + r.h} stroke={stroke} strokeWidth={1} />
          ) : null}
        </>
      )}
      {!opening.resolved ? (
        <rect
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill="none"
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      ) : null}
      {wide ? (
        <Label
          x={horizontal ? center.x : center.x + r.w / 2 + 8}
          y={horizontal ? center.y - r.h / 2 - 7 : center.y}
          text={selected ? `${opening.openingId} · edge ${formatMeasure(opening.s0)}` : opening.openingId}
          tone={selected ? 'selected' : 'muted'}
          small
          vertical={!horizontal}
        />
      ) : null}
    </g>
  );
}

export function Label({
  x,
  y,
  text,
  tone,
  small = false,
  vertical = false,
}: {
  x: number;
  y: number;
  text: string;
  tone: 'ink' | 'muted' | 'selected' | 'destructive';
  small?: boolean;
  vertical?: boolean;
}) {
  const fill =
    tone === 'ink'
      ? 'var(--color-ink)'
      : tone === 'muted'
        ? 'var(--color-ink-2)'
        : tone === 'selected'
          ? 'var(--color-selection)'
          : 'var(--color-destructive)';
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

/** Cota junto ao cursor durante o arraste (M5): o valor já com snap. */
export function Readout({ x, y, text, size }: { x: number; y: number; text: string; size: Size }) {
  const w = text.length * 7 + 12;
  const left = Math.min(Math.max(8, x + 14), size.width - w - 8);
  const top = Math.min(Math.max(8, y - 30), size.height - 28);
  return (
    <g pointerEvents="none" aria-hidden>
      <rect x={left} y={top} width={w} height={20} rx={3} fill="var(--color-navy-900)" />
      <text
        x={left + w / 2}
        y={top + 10}
        fontSize={11}
        fontFamily="var(--font-mono)"
        fontWeight={600}
        fill="var(--color-paper)"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {text}
      </text>
    </g>
  );
}

/** Barra de escala (M5), canto inferior esquerdo. */
export function ScaleBar({ x, y, inches, px }: { x: number; y: number; inches: number; px: number }) {
  return (
    <g pointerEvents="none" aria-hidden>
      <line x1={x} y1={y} x2={x + px} y2={y} stroke="var(--color-ink-2)" strokeWidth={1.5} />
      <line x1={x} y1={y - 4} x2={x} y2={y + 4} stroke="var(--color-ink-2)" strokeWidth={1.5} />
      <line x1={x + px} y1={y - 4} x2={x + px} y2={y + 4} stroke="var(--color-ink-2)" strokeWidth={1.5} />
      <text
        x={x + px / 2}
        y={y - 7}
        fontSize={10}
        fontFamily="var(--font-mono)"
        fill="var(--color-ink-2)"
        textAnchor="middle"
        style={{ paintOrder: 'stroke', stroke: 'var(--color-paper-2)', strokeWidth: 3 }}
      >
        {formatMeasure(inches)}
      </text>
    </g>
  );
}

/** Legenda (M5): o que as cores dizem. */
export function Legend({ className }: { className?: string }) {
  const items: { label: string; swatch: string }[] = [
    { label: 'Exterior', swatch: 'bg-gold-100 border-navy-900' },
    { label: 'Interior', swatch: 'bg-paper-3 border-navy-900' },
    { label: 'Selected', swatch: 'bg-card border-selection ring-2 ring-selection/25' },
    { label: 'Warning', swatch: 'bg-card border-warning' },
    { label: 'Problem', swatch: 'bg-card border-destructive' },
  ];
  return (
    <ul
      className={cn(
        'flex flex-wrap gap-x-3 gap-y-1 rounded-sm bg-paper-2/85 px-2 py-1 text-[11px] text-ink-2 backdrop-blur-[2px]',
        className,
      )}
      aria-label="Legend"
    >
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1">
          <span className={cn('inline-block h-2.5 w-4 rounded-[2px] border', i.swatch)} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function Origin({ viewport }: { viewport: Viewport }) {
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

export function North({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g transform={`rotate(${angle} ${x} ${y})`} pointerEvents="none" aria-hidden>
      <polygon
        points={`${x},${y - 14} ${x - 6},${y + 8} ${x},${y + 3} ${x + 6},${y + 8}`}
        fill="var(--color-navy-900)"
      />
      <text
        x={x}
        y={y + 20}
        fontSize={10}
        fontFamily="var(--font-mono)"
        fontWeight={600}
        fill="var(--color-navy-900)"
        textAnchor="middle"
      >
        N
      </text>
    </g>
  );
}

/** Parede sem eixo (fora dos eixos, pontas coincidentes): linha de erro tracejada com o id. */
export function BrokenWall({ wall, viewport }: { wall: BrokenWallGeom; viewport: Viewport }) {
  const a = planToScreen(viewport, wall.start);
  const z = planToScreen(viewport, wall.end);
  return (
    <g data-wall-id={wall.wallId}>
      <title>{noticeText(wall.error)}</title>
      <line
        x1={a.x}
        y1={a.y}
        x2={z.x}
        y2={z.y}
        stroke="var(--color-destructive)"
        strokeWidth={3}
        strokeDasharray="6 4"
      />
      <Label x={(a.x + z.x) / 2} y={(a.y + z.y) / 2} text={wall.wallId} tone="destructive" />
    </g>
  );
}

/**
 * "Draw wall" (S30): mira no ponto com snap (quadrado = ponta de parede, guia tracejada até a ponta com que alinhou)
 * e, depois do primeiro clique, a parede em prévia com o comprimento.
 */
export function DrawPreview({
  viewport,
  start,
  cursor,
}: {
  viewport: Viewport;
  start: Point | undefined;
  cursor: DrawSnap | undefined;
}) {
  const c = cursor === undefined ? undefined : planToScreen(viewport, cursor.point);
  const s = start === undefined ? undefined : planToScreen(viewport, start);
  const ref = cursor?.ref === undefined ? undefined : planToScreen(viewport, cursor.ref);
  const length =
    start !== undefined && cursor !== undefined ? Math.hypot(cursor.point.x - start.x, cursor.point.y - start.y) : 0;
  return (
    <g pointerEvents="none" aria-hidden data-draw-preview>
      {ref !== undefined && c !== undefined ? (
        <line
          x1={ref.x}
          y1={ref.y}
          x2={c.x}
          y2={c.y}
          stroke="var(--color-selection)"
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.7}
        />
      ) : null}
      {s !== undefined && c !== undefined ? (
        <>
          <line
            x1={s.x}
            y1={s.y}
            x2={c.x}
            y2={c.y}
            stroke="var(--color-selection)"
            strokeWidth={Math.max(3, 3.5 * viewport.scale)}
            strokeOpacity={0.35}
            strokeLinecap="butt"
          />
          <line x1={s.x} y1={s.y} x2={c.x} y2={c.y} stroke="var(--color-selection)" strokeWidth={1.5} />
          <circle cx={s.x} cy={s.y} r={3.5} fill="var(--color-selection)" />
          {length >= 1 ? (
            <Label
              x={(s.x + c.x) / 2 + (s.y === c.y ? 0 : 14)}
              y={(s.y + c.y) / 2 - (s.y === c.y ? 12 : 0)}
              text={formatMeasure(length)}
              tone="selected"
            />
          ) : null}
        </>
      ) : null}
      {c !== undefined ? (
        cursor?.kind === 'end' ? (
          <rect
            x={c.x - 5}
            y={c.y - 5}
            width={10}
            height={10}
            fill="none"
            stroke="var(--color-selection)"
            strokeWidth={1.5}
          />
        ) : (
          <>
            <line x1={c.x - 7} y1={c.y} x2={c.x + 7} y2={c.y} stroke="var(--color-selection)" strokeWidth={1.25} />
            <line x1={c.x} y1={c.y - 7} x2={c.x} y2={c.y + 7} stroke="var(--color-selection)" strokeWidth={1.25} />
          </>
        )
      ) : null}
    </g>
  );
}
