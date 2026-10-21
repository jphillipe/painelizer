'use client';

import { FileImageIcon, FileTextIcon, Loader2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Rect } from '@/lib/editor/geometry';
import { DEFAULT_UNDERLAY_OPACITY, initialTransform, underlayKb, type Underlay } from '@/lib/editor/underlay';
import { isPdfFile, loadPdf, renderImageFile, renderPdfPage } from '@/lib/pdf-render';
import { cn } from '@/lib/utils';
import { formatBytes } from '../drop-zone';

export interface UnderlayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Arquivos soltos no passo 01 (quando ainda estão na memória): oferecidos primeiro. */
  sourceFiles: readonly File[];
  /** Caixa das paredes, para a imagem nascer do tamanho da casa. */
  bounds: Rect | undefined;
  onPick: (underlay: Underlay) => void;
}

/** Largura da planta por baixo: legível ao dar zoom sem passar de ~400 KB em JPEG. */
const UNDERLAY_PX = 2400;
const THUMB_PX = 160;

/**
 * Escolher a planta por baixo (M6): um arquivo dos soltos no passo 01 ou outro do disco; PDF mostra as páginas em
 * miniatura, uma é a escolhida; imagem entra direto. A página é renderizada em 2 400 px e vai para o draft.
 */
export function UnderlayDialog({ open, onOpenChange, sourceFiles, bounds, onPick }: UnderlayDialogProps) {
  const [file, setFile] = useState<File | undefined>(undefined);
  const [thumbs, setThumbs] = useState<{ page: number; url: string }[] | undefined>(undefined);
  const [page, setPage] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setFile(undefined);
      setThumbs(undefined);
      setPage(undefined);
    }
  }, [open]);

  // PDF: miniaturas das páginas; imagem: nada a escolher.
  useEffect(() => {
    if (file === undefined || !isPdfFile(file)) {
      setThumbs(undefined);
      return;
    }
    let cancelled = false;
    setThumbs([]);
    void (async () => {
      try {
        const doc = await loadPdf(file);
        const out: { page: number; url: string }[] = [];
        for (let n = 1; n <= Math.min(doc.numPages, 40); n += 1) {
          const r = await renderPdfPage(doc, n, THUMB_PX);
          if (cancelled) return;
          out.push({ page: n, url: r.dataUrl });
          setThumbs([...out]);
        }
      } catch (e) {
        if (!cancelled) toast.error(`Couldn’t read ${file.name}: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const use = async (): Promise<void> => {
    if (file === undefined) return;
    setBusy(true);
    try {
      const rendered = isPdfFile(file) ? await renderPdfPage(await loadPdf(file), page ?? 1, UNDERLAY_PX, 'jpeg') : await renderImageFile(file, UNDERLAY_PX);
      const t = initialTransform(rendered.width, rendered.height, bounds);
      const underlay: Underlay = {
        version: 1,
        source: isPdfFile(file) ? { name: file.name, page: page ?? 1 } : { name: file.name },
        image: rendered.dataUrl,
        width: rendered.width,
        height: rendered.height,
        ...t,
        opacity: DEFAULT_UNDERLAY_OPACITY,
        visible: true,
      };
      onPick(underlay);
      toast.success(`Drawing placed under the plan (${underlayKb(underlay)} KB). Now set its scale: click two points of a known dimension.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(`Couldn’t render the drawing: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const canUse = file !== undefined && (!isPdfFile(file) || page !== undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Drawing under the plan</DialogTitle>
          <DialogDescription>Pick the architect’s floor plan. It shows behind the walls at low opacity so you can check the reading against the drawing. It is saved with the project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Source</Label>
            <div className="flex flex-wrap gap-2">
              {sourceFiles.map((f) => (
                <button key={`${f.name}:${f.size}`} type="button" onClick={() => setFile(f)} aria-pressed={file === f} className={cn('flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] transition-colors', file === f ? 'border-selection bg-selection/8 text-navy-900' : 'border-line hover:border-line-strong')}>
                  {isPdfFile(f) ? <FileTextIcon className="size-4 text-navy-900" /> : <FileImageIcon className="size-4 text-gold-600" />}
                  <span className="font-mono">{f.name}</span>
                  <span className="text-ink-3">{formatBytes(f.size)}</span>
                </button>
              ))}
              <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
                Choose a file…
              </Button>
              <input
                ref={input}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f !== undefined) setFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            {file !== undefined && !sourceFiles.includes(file) ? (
              <p className="text-[13px] text-ink-2">
                <span className="font-mono">{file.name}</span> · {formatBytes(file.size)}
              </p>
            ) : null}
          </div>
          {file !== undefined && isPdfFile(file) ? (
            <div className="space-y-2">
              <Label>Page</Label>
              {thumbs === undefined || thumbs.length === 0 ? (
                <p className="flex items-center gap-2 text-[13px] text-ink-3">
                  <Loader2Icon className="size-3.5 animate-spin" /> Rendering pages…
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2" aria-label="Pages">
                  {thumbs.map((t) => (
                    <li key={t.page}>
                      <button type="button" aria-pressed={page === t.page} onClick={() => setPage(t.page)} className={cn('relative block overflow-hidden rounded-sm border bg-paper-2 transition-[border-color,box-shadow] duration-200', page === t.page ? 'border-selection shadow-[0_0_0_2px_var(--color-selection)]' : 'border-line hover:border-line-strong')} title={`Page ${t.page}`}>
                        <img src={t.url} alt={`Page ${t.page}`} width={THUMB_PX} className="block" />
                        <span className={cn('absolute right-1 bottom-1 rounded-sm px-1 font-mono text-[11px] font-semibold', page === t.page ? 'bg-selection text-paper' : 'bg-paper/90 text-ink')}>{t.page}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="accent" disabled={!canUse || busy} onClick={() => void use()}>
            {busy ? (
              <>
                <Loader2Icon className="animate-spin" /> Rendering…
              </>
            ) : (
              'Use this drawing'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
