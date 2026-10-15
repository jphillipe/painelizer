'use client';

import { FileImageIcon, FileTextIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { expectedWait, formatClock, formatMinutes, readDurations, waitFraction } from '@/lib/extract-timing';
import type { ExtractJob } from '@/types/extract';
import { formatBytes } from './drop-zone';

export interface ExtractProgressProps {
  job: ExtractJob;
}

/**
 * Tela de espera da extração (substitui o formulário enquanto a IA lê): parede sendo emoldurada em loop,
 * tempo corrido, média das últimas leituras deste navegador e barra que para em 95% até a resposta.
 * A barra mede tempo, não progresso real: a server action não informa etapas.
 */
export function ExtractProgress({ job }: ExtractProgressProps) {
  const [now, setNow] = useState(() => Date.now());
  const expected = useMemo(() => expectedWait(readDurations()), []);
  const elapsed = now - job.startedAt;
  const late = elapsed > expected.ms;
  const totalBytes = job.files.reduce((a, f) => a + f.size, 0);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Relógio na aba: quem troca de aba durante a espera vê o tempo sem voltar.
  useEffect(() => {
    const original = document.title;
    return () => {
      document.title = original;
    };
  }, []);
  useEffect(() => {
    document.title = `(${formatClock(elapsed)}) Reading drawings · Panelizer`;
  }, [elapsed]);

  return (
    <section className="step-enter no-print mx-auto max-w-3xl overflow-hidden rounded-md border bg-card shadow-1" aria-busy="true">
      <div className="flex items-center justify-between gap-3 bg-navy-900 px-6 py-4 text-paper">
        <span className="text-lg font-semibold">Reading your drawings</span>
        <span className="flex items-center gap-2 text-[13px] text-paper/80">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-pill bg-gold-300 opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-pill bg-gold-300" />
          </span>
          AI at work
        </span>
      </div>

      <div className="blueprint border-b border-line-faint px-4 py-6 sm:px-10">
        <WallSketch />
      </div>

      <div className="space-y-5 px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Elapsed</p>
            <p className="font-display text-6xl leading-none text-navy-900 tabular-nums" role="timer" aria-live="off">
              {formatClock(elapsed)}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="eyebrow">Average wait</p>
            <p className="font-display text-3xl leading-tight text-navy-900">~{formatMinutes(expected.ms)}</p>
            <p className="text-[13px] text-ink-3">
              {expected.samples === 0
                ? 'Typical for a floor plan with its schedules'
                : `Average of your last ${expected.samples === 1 ? 'read' : `${expected.samples} reads`}`}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div
            className="h-1.5 overflow-hidden rounded-pill bg-paper-3"
            role="progressbar"
            aria-label="Time against the average wait"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(waitFraction(elapsed, expected.ms) * 100)}
          >
            <div
              className="h-full rounded-pill bg-gold transition-[width] duration-1000 ease-linear"
              style={{ width: `${waitFraction(elapsed, expected.ms) * 100}%` }}
            />
          </div>
          <p className="text-sm text-ink-2" aria-live="polite">
            {late
              ? 'Taking longer than usual. Large or dense sets can run well past the average; the read is still going.'
              : `About ${formatMinutes(expected.ms - elapsed)} left, if this set reads like the last ones.`}
          </p>
        </div>

        <div className="grid gap-4 border-t border-line-faint pt-5 sm:grid-cols-3">
          <Step n="01" title="Find the sheets" text="Floor plan and schedules, picked by their title block." />
          <Step n="02" title="Trace the walls" text="Each wall on its axis, with section, bearing role and type." />
          <Step n="03" title="Place the openings" text="Doors and windows matched to their schedule tags." />
        </div>

        <ul className="flex flex-wrap gap-2" aria-label={`${job.files.length} files sent, ${formatBytes(totalBytes)}`}>
          {job.files.map((f, i) => (
            <li
              key={`${f.name}:${f.size}`}
              style={{ '--i': i } as React.CSSProperties}
              className="stagger flex max-w-full items-center gap-2 rounded-pill border bg-paper px-3 py-1 text-[13px]"
            >
              {f.name.toLowerCase().endsWith('.pdf') ? (
                <FileTextIcon className="size-3.5 shrink-0 text-navy-900" />
              ) : (
                <FileImageIcon className="size-3.5 shrink-0 text-gold-600" />
              )}
              <span className="min-w-0 truncate font-mono">{f.name}</span>
              <span className="text-ink-3">{formatBytes(f.size)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-900 px-6 py-2.5 text-[13px] text-paper/90">
        <span>Keep this tab open</span>
        <span>You review every wall before anything is built</span>
      </div>
    </section>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <div>
      <p className="eyebrow">{n}</p>
      <p className="mt-1 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-ink-2">{text}</p>
    </div>
  );
}

/* ── Desenho: elevação de 18' com janela de 48", em polegadas (y para cima), 2 px por polegada ─────────── */

interface Piece {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'plate' | 'stud' | 'header' | 'sill';
}

const LENGTH = 216;
const HEIGHT = 94;
const PLATE = 1.5;
const RO = { left: 88, right: 136, sill: 36, head: 80 };
const SCALE = 2;
const PAD = 12;

function wallPieces(): Piece[] {
  const top = HEIGHT - 2 * PLATE;
  const stud = (x: number, y = PLATE, h = top - PLATE): Piece => ({ x, y, w: PLATE, h, kind: 'stud' });
  const pieces: Piece[] = [{ x: 0, y: 0, w: LENGTH, h: PLATE, kind: 'plate' }];
  // Studs centrados nas marcas de 16" (o primeiro em 0, o último encostado no fim); os que caem na janela viram cripples.
  const marks = [0];
  for (let m = 16; m - 0.75 < LENGTH - PLATE; m += 16) marks.push(m - 0.75);
  marks.push(LENGTH - PLATE);
  const kingL = RO.left - 2 * PLATE;
  const kingR = RO.right + PLATE;
  for (const x of marks) {
    if (x + PLATE <= kingL || x >= kingR + PLATE) pieces.push(stud(x));
    else if (x > RO.left && x + PLATE < RO.right) pieces.push(stud(x, PLATE, RO.sill - PLATE));
  }
  pieces.push(stud(kingL), stud(RO.left - PLATE, PLATE, RO.head - PLATE), stud(RO.right, PLATE, RO.head - PLATE), stud(kingR));
  pieces.push({ x: RO.left, y: RO.sill, w: RO.right - RO.left, h: PLATE, kind: 'sill' });
  pieces.push({ x: RO.left - PLATE, y: RO.head, w: RO.right - RO.left + 2 * PLATE, h: top - RO.head, kind: 'header' });
  pieces.push({ x: 0, y: top, w: LENGTH, h: PLATE, kind: 'plate' }, { x: 0, y: top + PLATE, w: LENGTH, h: PLATE, kind: 'plate' });
  // Ordem de montagem: da esquerda para a direita, plates de baixo primeiro e de cima por último.
  return pieces.sort((a, b) => rank(a) - rank(b) || a.x - b.x);
}

function rank(p: Piece): number {
  if (p.kind === 'plate') return p.y === 0 ? 0 : 2;
  return 1;
}

const PIECE_CLASS: Record<Piece['kind'], string> = {
  plate: 'fill-paper-3 stroke-navy-800',
  stud: 'fill-card stroke-navy-800',
  header: 'fill-gold-100 stroke-gold-600',
  sill: 'fill-gold-100 stroke-gold-600',
};

function WallSketch() {
  const pieces = useMemo(wallPieces, []);
  const w = LENGTH * SCALE + 2 * PAD;
  const h = HEIGHT * SCALE + 2 * PAD;
  const px = (x: number) => PAD + x * SCALE;
  const py = (y: number) => h - PAD - y * SCALE;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mx-auto block h-auto w-full max-w-[560px]" role="img" aria-label="A wall frame being drawn">
      <rect
        x={px(RO.left)}
        y={py(RO.head)}
        width={(RO.right - RO.left) * SCALE}
        height={(RO.head - RO.sill - PLATE) * SCALE}
        className="fill-none stroke-gold-600"
        strokeDasharray="4 4"
        strokeWidth={1}
      />
      {pieces.map((p, i) => (
        <rect
          key={`${p.kind}-${p.x}-${p.y}`}
          x={px(p.x)}
          y={py(p.y + p.h)}
          width={p.w * SCALE}
          height={p.h * SCALE}
          strokeWidth={1}
          className={`frame-piece ${PIECE_CLASS[p.kind]}`}
          style={{ '--i': i } as React.CSSProperties}
        />
      ))}
      <g className="frame-scan">
        <rect x={PAD - 24} y={PAD} width={24} height={HEIGHT * SCALE} fill="url(#scan-glow)" />
        <line x1={PAD} x2={PAD} y1={PAD - 4} y2={h - PAD + 4} className="stroke-gold" strokeWidth={2} />
      </g>
      <defs>
        <linearGradient id="scan-glow" x1="0" x2="1">
          <stop offset="0" stopColor="var(--gold-300)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--gold-300)" stopOpacity="0.45" />
        </linearGradient>
      </defs>
    </svg>
  );
}
