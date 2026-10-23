import type { CSSProperties } from 'react';
import { SKETCH, sketchPieces, toSvg, type SketchKind } from '@/lib/login-sketch';
import { cn } from '@/lib/utils';

const FILL: Record<SketchKind, string> = {
  plate: 'fill-paper/90',
  stud: 'fill-gold-300',
  king: 'fill-paper/90',
  jack: 'fill-paper/90',
  header: 'fill-gold',
  sill: 'fill-gold-300/85',
  cripple: 'fill-gold-300/85',
};

const W = SKETCH.length * SKETCH.scale;
const H = SKETCH.height * SKETCH.scale;
const BREAK = SKETCH.breakAt * SKETCH.scale;

/**
 * Parede do palco do login (V1B escolhida pelo humano em 2026-10-23): 18' com janela, montada peça a peça em
 * cascata (`login-piece`), depois a linha tracejada da quebra em painéis desce na marca de 12' e as duas metades
 * se afastam com os ids (`login-half`, `login-tag`). Só SVG e CSS, sem cliente; a geometria vem de `lib/login-sketch`.
 */
export function WallSplitSketch({ className }: { className?: string }) {
  const pieces = sketchPieces();
  const half = (side: 'left' | 'right') => pieces.filter((p) => p.half === side);
  return (
    <svg viewBox={`-16 -16 ${W + 32} ${H + 48}`} role="img" aria-label="An 18-foot wall frames itself, then splits into two numbered panels" className={cn('block overflow-visible', className)}>
      {(['left', 'right'] as const).map((side) => (
        <g key={side} className="login-half" style={{ '--dx': side === 'left' ? '-14px' : '14px' } as CSSProperties}>
          {half(side).map((p) => {
            const r = toSvg(p);
            return <rect key={p.i} className={cn('login-piece', FILL[p.kind])} style={{ '--i': p.i } as CSSProperties} x={r.x} y={r.y} width={r.width} height={r.height} />;
          })}
          <text className="login-tag font-mono text-[13px] fill-gold-300" style={{ '--t': side === 'left' ? 0 : 1 } as CSSProperties} x={side === 'left' ? BREAK / 2 : BREAK + (W - BREAK) / 2} y={-14} textAnchor="middle">
            {side === 'left' ? '1-W01-P1 · 12\'-0" · window' : '1-W01-P2 · 6\'-0"'}
          </text>
        </g>
      ))}
      <path className="login-split stroke-gold" pathLength={1} d={`M${BREAK} -8 V${H + 8}`} fill="none" strokeWidth={2} strokeDasharray="6 5" />
      <text className="login-tag font-mono text-[12px] fill-paper/60" style={{ '--t': 2 } as CSSProperties} x={BREAK} y={H + 28} textAnchor="middle">
        panel break on the 48&quot; mark · double top plate laps over
      </text>
    </svg>
  );
}
