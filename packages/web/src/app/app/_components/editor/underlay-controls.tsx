'use client';

import { CrosshairIcon, EyeIcon, EyeOffIcon, ImageIcon, RotateCcwIcon, RotateCwIcon, RulerIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Kbd, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Point } from '@/lib/editor/draft';
import { formatMeasure, parseMeasureText } from '@/lib/editor/measure';
import { planToImage, rotated, scaleFromPoints, withPixelAt, withScale, type Underlay } from '@/lib/editor/underlay';
import { cn } from '@/lib/utils';

/** Calibração em curso: escala (dois pontos + distância) ou origem (um ponto). Os pontos ficam em pixels da imagem. */
export type Calibration = { kind: 'scale'; points: Point[] } | { kind: 'origin' };

export interface UnderlayControlsProps {
  underlay: Underlay | undefined;
  calibration: Calibration | undefined;
  onCalibration: (c: Calibration | undefined) => void;
  onChoose: () => void;
  onChange: (u: Underlay | undefined) => void;
  onView: (view: { opacity?: number; visible?: boolean }) => void;
}

/** Menu "Drawing" na barra da planta (M6): escolher, mostrar/ocultar, opacidade, escala, origem, girar, remover. */
export function UnderlayControls({ underlay, calibration, onCalibration, onChoose, onChange, onView }: UnderlayControlsProps) {
  if (underlay === undefined) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="xs" onClick={onChoose} aria-label="Drawing under the plan">
            <ImageIcon /> <span className="hidden sm:inline">Drawing</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Put the architect’s plan under the walls to check the reading</TooltipContent>
      </Tooltip>
    );
  }
  const u = underlay;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={calibration === undefined ? 'ghost' : 'secondary'} size="xs" aria-label="Drawing under the plan">
          <ImageIcon /> <span className="hidden sm:inline">Drawing</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="truncate font-mono normal-case tracking-normal">
          {u.source.name}
          {u.source.page !== undefined ? ` · p.${u.source.page}` : ''}
        </DropdownMenuLabel>
        <div className="px-2 py-1.5">
          <label className="flex items-center justify-between gap-2 text-[12px] text-ink-2">
            Opacity <span className="font-mono">{Math.round(u.opacity * 100)}%</span>
          </label>
          <input type="range" min={5} max={90} step={5} value={Math.round(u.opacity * 100)} onChange={(e) => onView({ opacity: Number(e.target.value) / 100 })} className="mt-1 w-full accent-[var(--selection)]" aria-label="Drawing opacity" />
        </div>
        <DropdownMenuItem onSelect={() => onView({ visible: !u.visible })}>
          {u.visible ? <EyeOffIcon /> : <EyeIcon />} {u.visible ? 'Hide' : 'Show'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onCalibration({ kind: 'scale', points: [] })}>
          <RulerIcon /> Set scale (two points)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCalibration({ kind: 'origin' })}>
          <CrosshairIcon /> Set origin (one point)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange(rotated(u, 90))}>
          <RotateCcwIcon /> Rotate 90° left
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange(rotated(u, -90))}>
          <RotateCwIcon /> Rotate 90° right
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onChoose}>
          <ImageIcon /> Replace drawing…
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => onChange(undefined)}>
          <Trash2Icon /> Remove drawing
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface CalibrationBannerProps {
  underlay: Underlay;
  calibration: Calibration;
  onCalibration: (c: Calibration | undefined) => void;
  onChange: (u: Underlay) => void;
}

/** Faixa de instrução sobre a planta durante a calibração (M6): diz o próximo clique e pede a distância. */
export function CalibrationBanner({ underlay, calibration, onCalibration, onChange }: CalibrationBannerProps) {
  const [distance, setDistance] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const cancel = (): void => onCalibration(undefined);
  if (calibration.kind === 'origin') {
    return (
      <Strip onCancel={cancel}>
        <CrosshairIcon className="size-4 shrink-0" /> Click the point of the drawing that is the project origin (0, 0) — usually the outside corner the dimensions start from.
      </Strip>
    );
  }
  const n = calibration.points.length;
  if (n < 2) {
    return (
      <Strip onCancel={cancel}>
        <RulerIcon className="size-4 shrink-0" /> {n === 0 ? 'Click the first end of a dimension you know (a wall length, an overall).' : 'Now click the other end.'}
      </Strip>
    );
  }
  const [a, b] = calibration.points as [Point, Point];
  const apply = (): void => {
    const r = parseMeasureText(distance);
    if (!r.ok || r.value === undefined || !(r.value > 0)) {
      setError(r.ok ? 'Type the distance between the two points.' : r.message);
      return;
    }
    const scale = scaleFromPoints(a, b, r.value);
    if (scale === undefined) {
      setError('The two points are the same spot; start again.');
      return;
    }
    onChange(withScale(underlay, scale, a));
    onCalibration(undefined);
  };
  return (
    <Strip onCancel={cancel}>
      <RulerIcon className="size-4 shrink-0" />
      <label htmlFor="underlay-distance" className="shrink-0">
        Distance between the points
      </label>
      <input
        id="underlay-distance"
        value={distance}
        autoFocus
        placeholder={`e.g. 40'-0"`}
        onChange={(e) => {
          setDistance(e.target.value);
          setError(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
        className={cn('h-7 w-32 rounded-sm border bg-card px-2 font-mono text-[13px] text-ink', error === undefined ? 'border-paper/40' : 'border-destructive')}
        aria-invalid={error !== undefined || undefined}
      />
      <Button size="xs" variant="accent" onClick={apply}>
        Apply
      </Button>
      {error !== undefined ? <span className="text-[12px] text-gold-300">{error}</span> : null}
      <span className="hidden text-[12px] text-paper/70 lg:inline">
        current: {formatMeasure(Math.hypot(b.x - a.x, b.y - a.y) * underlay.scale)}
      </span>
    </Strip>
  );
}

function Strip({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="animate-fade-in absolute inset-x-2 top-2 z-10 flex flex-wrap items-center gap-2 rounded-md bg-navy-900 px-3 py-2 text-[13px] text-paper shadow-2" role="status">
      {children}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" className="ml-auto text-paper hover:bg-navy-700 hover:text-paper" onClick={onCancel} aria-label="Cancel">
            <XIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Cancel<Kbd>Esc</Kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Ponto clicado na planta → pixel da imagem, para a calibração guardar em coordenadas da imagem. */
export function calibrationPoint(u: Underlay, plan: Point): Point {
  return planToImage(u, plan);
}

export { withPixelAt };
