'use client';

import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, ExternalLinkIcon, PrinterIcon, ZoomInIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { downloadText } from '@/lib/download';
import { formatMeasure } from '@/lib/editor/measure';
import { baseName, type Sheet } from '@/lib/files';
import { cn } from '@/lib/utils';
import type { PanelSummary } from '@/types/panels';
import { inEditableContext } from './editor/use-editor-shortcuts';
import { SvgView } from './svg-view';

export interface ResultSheetsProps {
  sheets: readonly Sheet[];
  panels: readonly PanelSummary[];
  /** Nº de avisos por painel. */
  warningsByPanel: ReadonlyMap<string, number>;
  selected: string | undefined;
  onSelect: (panelId: string) => void;
  showAll: boolean;
  onShowAll: (v: boolean) => void;
  /** Imprimir só a folha aberta (a lista e os controles têm `no-print`). */
  onPrint: () => void;
}

/** A animação em cascata da lista só na primeira montagem e só nos primeiros itens (M3): 41 folhas não esperam 2,5 s. */
const STAGGER_MAX = 12;

const ZOOMS = [100, 150, 200] as const;

/**
 * Aba Sheets (M3): lista com peças, peso e avisos por painel; folha com anterior/próximo (também ← →), abrir em
 * nova aba, baixar, imprimir só esta e lupa (dialog de tela cheia com zoom). "Show all" despeja todas, para a
 * impressão do conjunto.
 */
export function ResultSheets({ sheets, panels, warningsByPanel, selected, onSelect, showAll, onShowAll, onPrint }: ResultSheetsProps) {
  const index = Math.max(0, sheets.findIndex((s) => s.panelId === selected));
  const current = sheets[index];
  const panel = panels.find((p) => p.id === current?.panelId);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(150);
  const animated = useRef(false);
  useEffect(() => {
    animated.current = true;
  }, []);

  const go = (delta: number): void => {
    const next = sheets[index + delta];
    if (next !== undefined) onSelect(next.panelId);
  };

  // ← → trocam de folha quando a aba está aberta numa folha só (não em campos nem com a lupa aberta).
  useEffect(() => {
    if (showAll || zoomOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (inEditableContext(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll, zoomOpen, index, sheets]);

  const openInTab = (s: Sheet): void => {
    const url = URL.createObjectURL(new Blob([s.svg], { type: 'image/svg+xml' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="space-y-3">
      <div className="no-print flex items-center gap-2">
        <Checkbox id="show-all" checked={showAll} onCheckedChange={(v) => onShowAll(v === true)} />
        <Label htmlFor="show-all">Show all sheets</Label>
      </div>
      {showAll ? (
        <div className="space-y-4">
          {sheets.map((s) => (
            <SvgView key={s.panelId} svg={s.svg} label={`Sheet ${s.panelId}`} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[200px_1fr]">
          <ul className="no-print max-h-[640px] divide-y divide-line-faint overflow-auto rounded-md border bg-card" aria-label="Sheets">
            {panels.map((p, i) => {
              const warnings = warningsByPanel.get(p.id) ?? 0;
              const isCurrent = p.id === current?.panelId;
              return (
                <li key={p.id} style={animated.current ? undefined : ({ '--i': Math.min(i, STAGGER_MAX) } as React.CSSProperties)} className={animated.current ? undefined : 'stagger'}>
                  <button
                    type="button"
                    onClick={() => onSelect(p.id)}
                    aria-current={isCurrent ? 'true' : undefined}
                    className={cn(
                      'grid w-full grid-cols-[1fr_auto] items-center gap-x-2 border-l-2 border-transparent px-3 py-1.5 text-left transition-colors duration-200 ease-site hover:bg-paper-2',
                      isCurrent && 'border-selection bg-selection/8 text-navy-900',
                    )}
                  >
                    <span className="font-mono text-[13px] font-semibold">{p.id}</span>
                    <span className="flex items-center gap-1.5">
                      {warnings > 0 ? (
                        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-pill border border-gold-700/30 bg-gold-100 px-1 font-mono text-[10px] font-semibold text-gold-700" title={`${warnings} warning${warnings === 1 ? '' : 's'}`}>
                          {warnings}
                        </span>
                      ) : null}
                    </span>
                    <span className="col-span-2 text-[12px] text-ink-2">
                      {formatMeasure(p.length)} · {p.pieces} pcs{p.weightLb !== undefined ? ` · ${Math.round(p.weightLb)} lb` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {current !== undefined ? (
            <div className="min-w-0 space-y-2">
              <div className="no-print flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-sm" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous sheet" title="Previous sheet (←)">
                    <ChevronLeftIcon />
                  </Button>
                  <Button variant="outline" size="icon-sm" onClick={() => go(1)} disabled={index >= sheets.length - 1} aria-label="Next sheet" title="Next sheet (→)">
                    <ChevronRightIcon />
                  </Button>
                </div>
                <p className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-mono font-semibold">{current.panelId}</span>
                  <span className="text-ink-2">
                    {' '}
                    · {index + 1} of {sheets.length}
                    {panel !== undefined ? ` · ${formatMeasure(panel.length)} · ${panel.pieces} pieces${panel.weightLb !== undefined ? ` · ${Math.round(panel.weightLb)} lb` : ''}` : ''}
                  </span>
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" size="xs" onClick={() => setZoomOpen(true)} title="Zoom">
                    <ZoomInIcon /> Zoom
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => openInTab(current)} title="Open the SVG in a new tab">
                    <ExternalLinkIcon /> Open
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => downloadText(baseName(current.path), current.svg, 'image/svg+xml')} title="Download this sheet">
                    <DownloadIcon /> Download
                  </Button>
                  <Button variant="ghost" size="xs" onClick={onPrint} title="Print this sheet">
                    <PrinterIcon /> Print
                  </Button>
                </div>
              </div>
              <SvgView key={current.panelId} svg={current.svg} label={`Sheet ${current.panelId}`} className="animate-fade-in" />
            </div>
          ) : null}
        </div>
      )}

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="flex h-[92dvh] max-w-[96vw] flex-col gap-3 p-4 sm:max-w-[96vw]">
          <DialogHeader className="flex-row items-center gap-3 pr-8 text-left">
            <DialogTitle className="font-mono">{current?.panelId}</DialogTitle>
            <DialogDescription className="sr-only">Fabrication sheet, enlarged</DialogDescription>
            <div className="ml-auto flex items-center gap-1">
              {ZOOMS.map((z) => (
                <Button key={z} variant={zoom === z ? 'secondary' : 'ghost'} size="xs" onClick={() => setZoom(z)}>
                  {z}%
                </Button>
              ))}
              <Button variant="ghost" size="icon-xs" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous sheet">
                <ChevronLeftIcon />
              </Button>
              <Button variant="ghost" size="icon-xs" onClick={() => go(1)} disabled={index >= sheets.length - 1} aria-label="Next sheet">
                <ChevronRightIcon />
              </Button>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-paper-2">
            {current !== undefined ? <div style={{ width: `${zoom}%` }} className="sheet p-2" role="img" aria-label={`Sheet ${current.panelId}, enlarged`} dangerouslySetInnerHTML={{ __html: current.svg }} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
