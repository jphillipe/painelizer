import type { CSSProperties } from 'react';
import { planSketch } from '@/lib/plan-sketch';
import { cn } from '@/lib/utils';

/**
 * Palco do passo 01 (2026-10-23): a planta da casa 28×40 sendo lida. Uma linha dourada varre de cima para baixo e
 * cada parede acende quando ela passa (`read-wall` por atraso nas horizontais, `read-wall-v` por `clip-path` nas
 * verticais); depois aparecem as quebras e os ids dos painéis (`read-break`, `read-tag`). Ciclo de 11 s, só SVG e
 * CSS (globals.css); a geometria vem de `lib/plan-sketch`. Sem cliente.
 */
export function PlanReadSketch({ className }: { className?: string }) {
  const p = planSketch();
  const pad = 56;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${p.width + 2 * pad} ${p.depth + 2 * pad}`}
      role="img"
      aria-label="A floor plan being read: a line sweeps down, every wall turns gold, then the panels are numbered"
      className={cn('block overflow-visible', className)}
      style={{ '--h': `${p.depth}px` } as CSSProperties}
    >
      {p.walls.map((w) =>
        w.horizontal ? (
          <rect key={w.id} className="read-wall" style={{ '--d': `${w.delay}s` } as CSSProperties} x={w.x} y={w.y} width={w.w} height={w.h} />
        ) : (
          <g key={w.id}>
            <rect x={w.x} y={w.y} width={w.w} height={w.h} className="fill-paper/28" />
            <rect x={w.x} y={w.y} width={w.w} height={w.h} className="read-wall-v fill-gold-300" />
          </g>
        ),
      )}
      {p.openings.map((o, i) => (
        <rect key={i} x={o.x} y={o.y} width={o.w} height={o.h} className="fill-navy-950 stroke-paper/70" strokeWidth={1.5} />
      ))}
      {p.breaks.map((b, i) => (
        <line key={i} className="read-break stroke-gold-300" x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} strokeWidth={2} />
      ))}
      {p.tags.map((t, i) => (
        <text key={t.id} className="read-tag fill-gold-300 font-mono text-[12px]" style={{ '--i': i } as CSSProperties} x={t.x} y={t.y} textAnchor={t.anchor}>
          {t.id}
        </text>
      ))}
      <g className="read-scan" aria-hidden>
        <rect x={-pad + 16} y={-1.5} width={p.width + 2 * pad - 32} height={3} className="fill-gold-300" />
        <rect x={-pad + 16} y={-22} width={p.width + 2 * pad - 32} height={20} fill="url(#read-glow)" />
      </g>
      <defs>
        <linearGradient id="read-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D9B36A" stopOpacity="0" />
          <stop offset="1" stopColor="#D9B36A" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <g className="fill-paper/50 font-mono text-[11px]">
        <text x={p.width / 2} y={p.depth + 50} textAnchor="middle">
          40&apos;-0&quot;
        </text>
        <text x={-40} y={p.depth / 2} textAnchor="middle" transform={`rotate(-90 -40 ${p.depth / 2})`}>
          28&apos;-0&quot;
        </text>
      </g>
    </svg>
  );
}
