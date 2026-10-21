'use client';

import { Loader2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface PdfPagesProps {
  files: readonly File[];
  /** Páginas marcadas (1-based), por nome de arquivo. */
  selected: ReadonlyMap<string, ReadonlySet<number>>;
  /** Páginas que a prévia diz que vão (M7): marcadas em verde mesmo sem clique (escolha automática). */
  sent?: ReadonlyMap<string, ReadonlySet<number>> | undefined;
  onToggle: (file: string, page: number) => void;
}

const THUMB_WIDTH = 150;
/** Acima disto, miniaturas só sob pedido (um conjunto de 300 folhas travaria a aba). */
const MAX_AUTO_PAGES = 60;

interface Thumb {
  page: number;
  url: string;
}

const isPdf = (f: File): boolean => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

/**
 * Miniaturas das páginas de cada PDF solto (M5): clicar marca a folha para a leitura, no lugar de digitar
 * "3,15". Renderizadas no cliente com pdf.js (o mesmo que a extração usa no servidor), uma vez por arquivo.
 */
export function PdfPages({ files, selected, sent, onToggle }: PdfPagesProps) {
  const pdfs = files.filter(isPdf);
  if (pdfs.length === 0) return null;
  return (
    <div className="space-y-3">
      {pdfs.map((f) => (
        <PdfFile key={`${f.name}:${f.size}`} file={f} selected={selected.get(f.name) ?? new Set()} sent={sent?.get(f.name)} onToggle={(p) => onToggle(f.name, p)} />
      ))}
    </div>
  );
}

function PdfFile({ file, selected, sent, onToggle }: { file: File; selected: ReadonlySet<number>; sent: ReadonlySet<number> | undefined; onToggle: (page: number) => void }) {
  const [thumbs, setThumbs] = useState<Thumb[] | undefined>(undefined);
  const [count, setCount] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [wanted, setWanted] = useState(false);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        if (cancelled) return;
        setCount(doc.numPages);
        if (doc.numPages > MAX_AUTO_PAGES && !wanted) return;
        const out: Thumb[] = [];
        for (let n = 1; n <= doc.numPages; n += 1) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext('2d');
          if (ctx === null) break;
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          const url = canvas.toDataURL('image/png');
          urls.current.push(url);
          out.push({ page: n, url });
          if (cancelled) return;
          setThumbs([...out]);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [file, wanted]);

  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
        <span className="min-w-0 truncate font-mono">{file.name}</span>
        <span className="text-ink-2">
          {count === undefined ? (error === undefined ? 'reading…' : '') : `${count} page${count === 1 ? '' : 's'}`}
          {selected.size > 0 ? ` · ${selected.size} picked` : ''}
        </span>
      </div>
      {error !== undefined ? <p className="text-[13px] text-destructive">Couldn’t render this PDF: {error}</p> : null}
      {count !== undefined && count > MAX_AUTO_PAGES && !wanted ? (
        <button type="button" className="text-[13px] text-navy-600 underline-offset-2 hover:underline" onClick={() => setWanted(true)}>
          Show {count} page thumbnails
        </button>
      ) : null}
      {thumbs === undefined && error === undefined && (count === undefined || count <= MAX_AUTO_PAGES || wanted) ? (
        <p className="flex items-center gap-2 text-[13px] text-ink-3">
          <Loader2Icon className="size-3.5 animate-spin" /> Rendering pages…
        </p>
      ) : null}
      {thumbs !== undefined ? (
        <ul className="flex flex-wrap gap-2" aria-label={`Pages of ${file.name}`}>
          {thumbs.map((t) => {
            const on = selected.has(t.page);
            const goes = sent?.has(t.page) === true;
            return (
              <li key={t.page}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(t.page)}
                  className={cn('group relative block overflow-hidden rounded-sm border bg-paper-2 transition-[border-color,box-shadow] duration-200', on ? 'border-selection shadow-[0_0_0_2px_var(--color-selection)]' : goes ? 'border-ok/60' : 'border-line hover:border-line-strong')}
                  title={`Page ${t.page}${on ? ' (picked)' : goes ? ' (will be sent)' : ''}`}
                >
                  <img src={t.url} alt={`Page ${t.page}`} width={THUMB_WIDTH} className={cn('block', !on && !goes && sent !== undefined && 'opacity-60')} />
                  <span className={cn('absolute right-1 bottom-1 rounded-sm px-1 font-mono text-[11px] font-semibold', on ? 'bg-selection text-paper' : 'bg-paper/90 text-ink')}>{t.page}</span>
                  {goes ? <span className="absolute top-1 left-1 rounded-sm bg-ok/90 px-1 text-[10px] font-semibold text-paper">sends</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
