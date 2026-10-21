'use client';

import { useMemo } from 'react';
import type { DraftWall, ProjectDraft } from '@/lib/editor/draft';
import { elevationOf } from '@/lib/editor/elevation';
import { formatMeasure } from '@/lib/editor/measure';
import type { Selection } from '@/lib/editor/state';
import { cn } from '@/lib/utils';

export interface WallElevationProps {
  draft: ProjectDraft;
  wall: DraftWall;
  selection: Selection;
  onSelect: (s: Selection) => void;
  className?: string;
}

const PAD = { left: 56, right: 24, top: 28, bottom: 40 };

/**
 * Elevação esquemática da parede (M5): no projeto solto (sem planta) ocupa o centro do workspace em vez da caixa
 * vazia — comprimento, altura, cada RO como vão com o id, cotas das bordas. Não é framing: a folha do motor é que
 * desenha studs; aqui o revisor vê onde cada abertura cai e clica nela para editar.
 */
export function WallElevation({ draft, wall, selection, onSelect, className }: WallElevationProps) {
  const e = useMemo(() => elevationOf(draft, wall), [draft, wall]);
  const length = e.length ?? 96;
  const W = 900;
  const scale = (W - PAD.left - PAD.right) / Math.max(length, 1);
  const H = PAD.top + e.height * scale + PAD.bottom;
  const X = (x: number): number => PAD.left + x * scale;
  const Y = (y: number): number => PAD.top + (e.height - y) * scale;
  const selectedOpening = selection.kind === 'opening' && selection.wallId === wall.id ? selection.openingId : undefined;

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-2', className)}>
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
        <span className="font-mono font-semibold">{wall.id}</span>
        <span className="text-ink-2">
          elevation · {e.length === undefined ? 'no length' : formatMeasure(e.length)} × {formatMeasure(e.height)}
          {e.heightKnown ? '' : ' (height assumed)'} · {e.openings.length} opening{e.openings.length === 1 ? '' : 's'}
        </span>
        {e.unplaced.length > 0 ? <span className="text-warning">not placed: {e.unplaced.join(', ')}</span> : null}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border bg-paper-2 p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="max-h-full w-full" role="img" aria-label={`Elevation of ${wall.id}`} onClick={(ev) => {
          const el = ev.target instanceof Element ? ev.target.closest('[data-opening-id]') : null;
          const id = el?.getAttribute('data-opening-id');
          onSelect(id === null || id === undefined ? { kind: 'wall', wallId: wall.id } : { kind: 'opening', wallId: wall.id, openingId: id });
        }}>
          {/* Parede: contorno com plates. */}
          <rect x={X(0)} y={Y(e.height)} width={length * scale} height={e.height * scale} fill="var(--color-gold-100)" stroke="var(--color-navy-900)" strokeWidth={1.25} />
          <line x1={X(0)} y1={Y(1.5)} x2={X(length)} y2={Y(1.5)} stroke="var(--color-navy-900)" strokeWidth={0.75} />
          <line x1={X(0)} y1={Y(e.height - 3)} x2={X(length)} y2={Y(e.height - 3)} stroke="var(--color-navy-900)" strokeWidth={0.75} />
          {e.openings.map((o) => {
            const sel = o.id === selectedOpening;
            const x = X(o.x);
            const w = o.width * scale;
            const y = Y(o.top);
            const h = (o.top - o.bottom) * scale;
            return (
              <g key={o.id} data-opening-id={o.id} className="cursor-pointer">
                <title>{`${o.id} · ${o.type} · RO ${formatMeasure(o.width)} × ${formatMeasure(o.top - o.bottom)} · left edge ${formatMeasure(o.x)}`}</title>
                <rect x={x} y={y} width={w} height={h} fill="none" stroke="var(--color-selection)" strokeWidth={8} strokeOpacity={sel ? 0.22 : 0} style={{ transition: 'stroke-opacity 200ms var(--ease-site)' }} pointerEvents="none" />
                <rect x={x} y={y} width={w} height={h} fill="var(--color-card)" stroke={o.resolved ? (sel ? 'var(--color-selection)' : 'var(--color-navy-900)') : 'var(--color-destructive)'} strokeWidth={sel ? 2 : 1.25} strokeDasharray={o.resolved ? undefined : '4 3'} />
                {o.type === 'window' ? <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke="var(--color-navy-900)" strokeWidth={0.75} /> : null}
                <text x={x + w / 2} y={y + h / 2} fontSize={12} fontFamily="var(--font-mono)" fontWeight={600} fill={sel ? 'var(--color-selection)' : 'var(--color-ink)'} textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
                  {o.id}
                </text>
                {/* Cota da borda esquerda, no rodapé. */}
                <line x1={x} y1={Y(0) + 6} x2={x} y2={Y(0) + 18} stroke="var(--color-ink-3)" strokeWidth={1} />
                <text x={x} y={Y(0) + 30} fontSize={10} fontFamily="var(--font-mono)" fill="var(--color-ink-2)" textAnchor="middle" pointerEvents="none">
                  {formatMeasure(o.x)}
                </text>
              </g>
            );
          })}
          {/* Cotas: comprimento e altura. */}
          <line x1={X(0)} y1={Y(0) + 6} x2={X(0)} y2={Y(0) + 18} stroke="var(--color-ink-3)" strokeWidth={1} />
          <line x1={X(length)} y1={Y(0) + 6} x2={X(length)} y2={Y(0) + 18} stroke="var(--color-ink-3)" strokeWidth={1} />
          <text x={X(length)} y={Y(0) + 30} fontSize={10} fontFamily="var(--font-mono)" fill="var(--color-ink-2)" textAnchor="middle">
            {formatMeasure(length)}
          </text>
          <text x={X(0)} y={Y(0) + 30} fontSize={10} fontFamily="var(--font-mono)" fill="var(--color-ink-2)" textAnchor="middle">
            0
          </text>
          <text x={PAD.left - 10} y={Y(e.height / 2)} fontSize={10} fontFamily="var(--font-mono)" fill="var(--color-ink-2)" textAnchor="middle" transform={`rotate(-90 ${PAD.left - 10} ${Y(e.height / 2)})`}>
            {formatMeasure(e.height)}
          </text>
        </svg>
      </div>
    </div>
  );
}
