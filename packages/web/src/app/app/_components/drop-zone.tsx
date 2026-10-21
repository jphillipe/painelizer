'use client';

import { FileImageIcon, FileTextIcon, UploadIcon, XIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ACCEPTED_UPLOAD_EXTENSIONS } from '@/types/extract';

export interface DropZoneProps {
  files: readonly File[];
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCEPT = ACCEPTED_UPLOAD_EXTENSIONS.join(',');
const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

/** Zona de soltar arquivos: tracejada, cantos marcados, ícone navy; responde a hover e arraste. Acumula arquivos. */
export function DropZone({ files, onFiles, disabled = false }: DropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const add = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const seen = new Set(files.map((f) => `${f.name}:${f.size}`));
    onFiles([...files, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))]);
  };
  const remove = (file: File) => onFiles(files.filter((f) => f !== file));

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && input.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) add(e.dataTransfer.files);
        }}
        className={cn(
          'group relative flex cursor-pointer items-center gap-5 rounded-md border border-dashed border-line-strong bg-paper-2 px-6 py-7',
          'transition-[border-color,background-color,transform,box-shadow] duration-200 ease-site',
          'hover:border-gold hover:bg-gold-100/50 hover:shadow-1 focus-visible:border-gold',
          over && 'scale-[1.01] border-gold bg-gold-100/70 shadow-1 motion-reduce:scale-100',
          disabled && 'cursor-not-allowed opacity-60 hover:border-line-strong hover:bg-paper-2 hover:shadow-none',
        )}
      >
        <Corner className="top-2 left-2 border-t border-l" over={over} />
        <Corner className="top-2 right-2 border-t border-r" over={over} />
        <Corner className="bottom-2 left-2 border-b border-l" over={over} />
        <Corner className="bottom-2 right-2 border-b border-r" over={over} />
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-md bg-navy-900 text-paper transition-transform duration-200 ease-site',
            'group-hover:-translate-y-0.5 group-hover:scale-105',
            over && 'scale-110 bg-gold-600 motion-reduce:scale-100',
          )}
        >
          <UploadIcon className={cn('size-5 transition-transform duration-200', over && '-translate-y-0.5')} />
        </span>
        <span>
          <span className="block text-lg font-medium tracking-tight">{over ? 'Release to add' : 'Drop your drawings here'}</span>
          <span className="block text-ink-2">or click to choose files</span>
        </span>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <p className="text-[13px] text-ink-3">
        PDF, PNG or JPG · up to 300 MB · send the whole set (many files or one big PDF): plans, schedules, elevations, sections and structural. The useful sheets are picked by their title block.
      </p>
      {files.length > 0 ? (
        <ul className="divide-y divide-line-faint rounded-md border bg-card text-sm">
          {files.map((f, i) => (
            <li
              key={`${f.name}:${f.size}`}
              style={{ '--i': i } as React.CSSProperties}
              className="stagger group/row flex items-center gap-3 px-3 py-2 transition-colors duration-200 hover:bg-paper-2"
            >
              {isPdf(f) ? <FileTextIcon className="size-4 shrink-0 text-navy-900" /> : <FileImageIcon className="size-4 shrink-0 text-gold-600" />}
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{f.name}</span>
              <span className="text-ink-3">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => remove(f)}
                disabled={disabled}
                aria-label={`Remove ${f.name}`}
                className="rounded-pill p-1 text-ink-3 opacity-60 transition-[opacity,background-color,color] duration-200 group-hover/row:opacity-100 hover:bg-paper-3 hover:text-destructive"
              >
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Corner({ className, over }: { className: string; over: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute size-3 border-navy-900 transition-[border-color,transform] duration-200 ease-site group-hover:border-gold-600',
        over && 'scale-125 border-gold-600',
        className,
      )}
    />
  );
}
