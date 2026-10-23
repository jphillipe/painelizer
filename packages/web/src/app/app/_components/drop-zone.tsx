'use client';

import { FileImageIcon, FileTextIcon, UploadIcon, XIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ACCEPTED_UPLOAD_EXTENSIONS, ACCEPTED_UPLOAD_TYPES } from '@/types/extract';

export interface DropZoneProps {
  files: readonly File[];
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Erro do formulário (sem arquivo ao enviar), mostrado embaixo da zona (M5), não em toast. */
  error?: string | undefined;
  /** `hero` (2026-10-23): dentro da zona-herói do passo 01 — sem moldura própria (a moldura tracejada é do pai), convite maior e vertical. */
  variant?: 'card' | 'hero';
}

/** Limite do envio (`serverActions.bodySizeLimit`, S20.2). */
export const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const ACCEPT = ACCEPTED_UPLOAD_EXTENSIONS.join(',');
const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

/** Aceito por tipo MIME ou, quando o browser não o dá, pela extensão. */
export function isAccepted(f: File): boolean {
  if ((ACCEPTED_UPLOAD_TYPES as readonly string[]).includes(f.type)) return true;
  const name = f.name.toLowerCase();
  return ACCEPTED_UPLOAD_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Separa o que entra do que não entra (M5): tipo não aceito, repetido, ou o total passando do limite. Devolve a
 * lista nova e o motivo de cada recusa, para a zona dizer em vez de ignorar em silêncio.
 */
export function mergeFiles(current: readonly File[], incoming: readonly File[]): { files: File[]; rejected: { name: string; reason: string }[] } {
  const seen = new Set(current.map((f) => `${f.name}:${f.size}`));
  const files = [...current];
  const rejected: { name: string; reason: string }[] = [];
  let total = current.reduce((n, f) => n + f.size, 0);
  for (const f of incoming) {
    if (seen.has(`${f.name}:${f.size}`)) {
      rejected.push({ name: f.name, reason: 'already added' });
      continue;
    }
    if (!isAccepted(f)) {
      rejected.push({ name: f.name, reason: 'not a PDF or image' });
      continue;
    }
    if (total + f.size > MAX_UPLOAD_BYTES) {
      rejected.push({ name: f.name, reason: `would pass the ${formatBytes(MAX_UPLOAD_BYTES)} limit` });
      continue;
    }
    seen.add(`${f.name}:${f.size}`);
    files.push(f);
    total += f.size;
  }
  return { files, rejected };
}

/** Zona de soltar arquivos: tracejada, cantos marcados, ícone navy; responde a hover e arraste. Acumula arquivos. */
export function DropZone({ files, onFiles, disabled = false, error, variant = 'card' }: DropZoneProps) {
  const hero = variant === 'hero';
  const input = useRef<HTMLInputElement>(null);
  // Contador de dragenter/dragleave (M5): o leave dispara ao passar sobre os filhos e fazia o estado piscar.
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([]);
  const total = files.reduce((n, f) => n + f.size, 0);

  const add = (list: FileList | null) => {
    if (!list) return;
    const r = mergeFiles(files, Array.from(list));
    setRejected(r.rejected);
    if (r.files.length !== files.length) onFiles(r.files);
  };
  const remove = (file: File) => onFiles(files.filter((f) => f !== file));
  const leave = (): void => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  };

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={error !== undefined ? 'drop-zone-error' : undefined}
        onClick={() => !disabled && input.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current += 1;
          if (!disabled) setOver(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={leave}
        onDrop={(e) => {
          e.preventDefault();
          depth.current = 0;
          setOver(false);
          if (!disabled) add(e.dataTransfer.files);
        }}
        className={cn(
          'group relative flex cursor-pointer items-center gap-5 rounded-md transition-[border-color,background-color,transform,box-shadow] duration-200 ease-site',
          hero ? 'flex-col items-start gap-3 px-1 py-1' : 'border border-dashed border-line-strong bg-paper-2 px-6 py-7 hover:border-gold hover:bg-gold-100/50 hover:shadow-1 focus-visible:border-gold',
          over && (hero ? 'bg-gold-100/40' : 'scale-[1.01] border-gold bg-gold-100/70 shadow-1 motion-reduce:scale-100'),
          error !== undefined && !hero && 'border-destructive',
          disabled && 'cursor-not-allowed opacity-60 hover:border-line-strong hover:bg-paper-2 hover:shadow-none',
        )}
      >
        {hero ? null : (
          <>
            <Corner className="top-2 left-2 border-t border-l" over={over} />
            <Corner className="top-2 right-2 border-t border-r" over={over} />
            <Corner className="bottom-2 left-2 border-b border-l" over={over} />
            <Corner className="bottom-2 right-2 border-b border-r" over={over} />
          </>
        )}
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md bg-navy-900 text-paper transition-transform duration-200 ease-site',
            hero ? 'size-12' : 'size-12',
            'group-hover:-translate-y-0.5 group-hover:scale-105',
            over && 'scale-110 bg-gold-600 motion-reduce:scale-100',
          )}
        >
          <UploadIcon className={cn('size-5 transition-transform duration-200', over && '-translate-y-0.5')} />
        </span>
        <span>
          <span className={cn('block font-medium tracking-tight', hero ? 'text-xl font-semibold' : 'text-lg')}>{over ? 'Release to add' : 'Drop your drawings here'}</span>
          <span className={cn('block text-ink-2', hero && 'text-base')}>or click to choose files</span>
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
      {error !== undefined ? (
        <p id="drop-zone-error" className="text-[13px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <p className="text-[13px] text-ink-3">
        PDF, PNG, JPG, WebP or GIF · up to {formatBytes(MAX_UPLOAD_BYTES)} per upload · send the whole set (many files or one big PDF): plans, schedules, elevations, sections and structural. The useful sheets are picked by their title block.
      </p>
      {hero && files.length === 0 ? (
        <ul className="flex flex-wrap gap-2 text-[12px] font-semibold text-ink-2" aria-label="What to send">
          {['A-1xx plans', 'A-8xx schedules', 'S-xxx structural', 'elevations', 'sections'].map((k) => (
            <li key={k} className="rounded-pill border bg-paper px-2.5 py-1">
              {k}
            </li>
          ))}
        </ul>
      ) : null}
      {rejected.length > 0 ? (
        <ul className="rounded-md border border-warning/40 bg-gold-100/40 px-3 py-2 text-[13px] text-ink-2" role="status">
          {rejected.map((r) => (
            <li key={r.name}>
              <span className="font-mono">{r.name}</span> skipped: {r.reason}.
            </li>
          ))}
        </ul>
      ) : null}
      {files.length > 0 ? (
        <div className="space-y-1">
          <ul className={cn('divide-y divide-line-faint rounded-md border bg-card text-sm', hero && 'max-h-44 overflow-auto')}>
            {files.map((f, i) => (
              <li key={`${f.name}:${f.size}`} style={{ '--i': Math.min(i, 12) } as React.CSSProperties} className="stagger group/row flex items-center gap-3 px-3 py-2 transition-colors duration-200 hover:bg-paper-2">
                {isPdf(f) ? <FileTextIcon className="size-4 shrink-0 text-navy-900" /> : <FileImageIcon className="size-4 shrink-0 text-gold-600" />}
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{f.name}</span>
                <span className="text-ink-3">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => remove(f)}
                  disabled={disabled}
                  aria-label={`Remove ${f.name}`}
                  className="rounded-pill p-1 text-ink-2 transition-[background-color,color] duration-200 hover:bg-paper-3 hover:text-destructive"
                >
                  <XIcon className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-right text-[12px] text-ink-2">
            {files.length} file{files.length === 1 ? '' : 's'} · {formatBytes(total)} of {formatBytes(MAX_UPLOAD_BYTES)}
          </p>
        </div>
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
