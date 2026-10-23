'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon, SparklesIcon, TriangleAlertIcon } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { estimateCost, formatUsd } from '@/lib/extract-cost';
import { recordDuration } from '@/lib/extract-timing';
import { uploadFieldsSchema, type UploadFields } from '@/schemas/extract';
import { EMPTY_PROJECT_DATA, type ExtractJob, type ExtractOutcome, type ExtractPreview } from '@/types/extract';
import { extractWalls } from '../_actions/extract-walls';
import { previewExtraction } from '../_actions/preview-extraction';
import { DropZone } from './drop-zone';
import { PlanReadSketch } from './plan-read-sketch';
import { ProjectDataFields } from './project-data-fields';

export interface UploadFormProps {
  aiEnabled: boolean;
  onOutcome: (outcome: ExtractOutcome) => void;
  /** A leitura em andamento (tela de espera), ou `undefined` quando acaba. */
  onJobChange: (job: ExtractJob | undefined) => void;
  /** "or try a sample" na linha do botão (M5): leva ao seletor de exemplos, quando ele existe. */
  onSample?: (() => void) | undefined;
  /** Arquivos atuais, para o editor oferecer a planta por baixo (M6). */
  onFilesChange?: ((files: File[]) => void) | undefined;
}

const AUTO = 'auto';
/** Acima disto a prévia (que sobe os arquivos) só sob pedido. */
const AUTO_PREVIEW_BYTES = 40 * 1024 * 1024;
const PREVIEW_DELAY_MS = 800;

function newJobId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Passo 1: os desenhos (vários arquivos) e os detalhes do projeto → action `extractWalls`.
 * Fica montado (escondido) durante a leitura, para o humano voltar com arquivos e campos se ela falhar.
 * M7: prévia do que vai ser enviado (só para o custo no botão, desde 2026-10-23) antes de pagar; a leitura leva um `jobId` para a tela de espera acompanhar e recolher depois de um F5.
 */
export function UploadForm({ aiEnabled, onOutcome, onJobChange, onSample, onFilesChange }: UploadFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [filesError, setFilesError] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<ExtractPreview | undefined>(undefined);
  const [previewing, setPreviewing] = useState(false);
  const [previewWanted, setPreviewWanted] = useState(false);
  const startedAt = useRef(0);
  const previewSeq = useRef(0);
  const form = useForm<UploadFields>({
    resolver: zodResolver(uploadFieldsSchema),
    defaultValues: { level: '', projectName: '', pages: '', notes: '', ...EMPTY_PROJECT_DATA },
  });
  const pagesField = form.watch('pages');
  const levelField = form.watch('level');
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const previewAuto = totalBytes <= AUTO_PREVIEW_BYTES;

  const { execute, isPending } = useAction(extractWalls, {
    onSettled: () => onJobChange(undefined),
    onSuccess: ({ data }) => {
      if (data?.ok) recordDuration(Date.now() - startedAt.current);
      if (data) onOutcome(data);
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not extract walls.'),
  });
  const { executeAsync: runPreview } = useAction(previewExtraction);

  const formData = (fields?: UploadFields): FormData => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    if (fields !== undefined) for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    else {
      fd.set('pages', pagesField);
      fd.set('level', levelField);
    }
    return fd;
  };

  // Prévia (M7): 800 ms depois da última mudança em arquivos, páginas ou pavimento; sem arquivos, nada.
  useEffect(() => {
    if (files.length === 0 || (!previewAuto && !previewWanted)) {
      setPreview(undefined);
      return;
    }
    const seq = (previewSeq.current += 1);
    setPreviewing(true);
    const timer = setTimeout(() => {
      void runPreview(formData()).then((r) => {
        if (seq !== previewSeq.current) return;
        setPreviewing(false);
        setPreview(r.data ?? { ok: false, message: r.serverError ?? 'Could not preview the set.' });
      });
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, pagesField, levelField, previewAuto, previewWanted]);

  const submit = (fields: UploadFields) => {
    if (files.length === 0) {
      setFilesError('Add at least one PDF or image.');
      return;
    }
    const fd = formData(fields);
    const jobId = newJobId();
    fd.set('jobId', jobId);
    startedAt.current = Date.now();
    onJobChange({ jobId, startedAt: startedAt.current, files: files.map((f) => ({ name: f.name, size: f.size })) });
    execute(fd);
  };
  const onFiles = (next: File[]): void => {
    setFiles(next);
    onFilesChange?.(next);
    if (next.length > 0) setFilesError(undefined);
  };
  const estimate = preview?.ok ? estimateCost(preview.pagesTotal, preview.images) : undefined;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
        {aiEnabled ? null : (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>AI reading is off on this server</AlertTitle>
            <AlertDescription>
              No API key is configured, so drawings can’t be read here.
              {onSample !== undefined ? ' Try a sample project below, or open a project file under Advanced.' : ' Open a project file saved from the editor, or ask whoever runs this server to add the key.'}
            </AlertDescription>
          </Alert>
        )}

        <section className="zone-pulse grid overflow-hidden rounded-lg border-2 border-dashed border-gold/70 bg-card shadow-1 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-stretch" aria-label="Your drawings">
          <div className="login-surface relative flex min-h-[300px] flex-col justify-center gap-3 p-5 text-paper lg:min-h-[320px]">
            <PlanReadSketch className="w-full" />
            <div className="relative h-5 font-mono text-[12px] text-paper/75" aria-hidden>
              <span className="read-caption" style={{ '--c': 0 } as React.CSSProperties}>01 · the sheets are picked by their title block</span>
              <span className="read-caption" style={{ '--c': 1 } as React.CSSProperties}>02 · the AI traces each wall; you confirm every one</span>
              <span className="read-caption" style={{ '--c': 2 } as React.CSSProperties}>03 · the engine frames, splits and numbers the panels</span>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-3 p-5 sm:p-6">
            <DropZone files={files} onFiles={onFiles} disabled={isPending} error={filesError} variant="hero" />
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-2">Drawing checklist</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
                <li>Floor plan of the level to panelize, with dimensions readable.</li>
                <li>Wall type sheet (partition types) and door and window schedules.</li>
                <li>Elevations or sections when head heights and sill heights matter.</li>
                <li>Structural notes (snow load, wind, species) if you have them: the engine sizes headers by code tables.</li>
              </ul>
            </details>
          </div>
        </section>

        <section className="space-y-4 rounded-md border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="eyebrow">Project details</p>
            <p className="text-[13px] text-ink-3">everything optional now — the review step asks for what the engine needs</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Level</FormLabel>
                  <Select value={field.value || AUTO} onValueChange={(v) => field.onChange(v === AUTO ? '' : v)}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue>{field.value === '' ? 'Identify from drawings' : `Level ${field.value}`}</SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={AUTO}>Identify from drawings</SelectItem>
                      <SelectItem value="1">Level 1</SelectItem>
                      <SelectItem value="2">Level 2</SelectItem>
                      <SelectItem value="3">Level 3</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="projectName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Maple St duplex" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pages"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PDF pages</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. 3,15 — empty: by title block" className="font-mono" />
                  </FormControl>
                  <FormDescription>Page numbers, for every PDF. Empty: the floor plan and schedule sheets are picked by their title block.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="space-y-3 border-t border-line-faint pt-4">
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-ink">
                Wall height &amp; structural data <span className="font-normal text-ink-3">· optional now; you can add them at review</span>
              </summary>
              <div className="mt-3">
                <ProjectDataFields control={form.control} compact />
              </div>
            </details>
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-ink">
                Notes for the AI <span className="font-normal text-ink-3">· optional</span>
              </summary>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="mt-2">
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder="e.g. Ignore the garage. North is up." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </details>
          </div>
        </section>

        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <Button type="submit" variant="accent" size="lg" className="h-14 px-9 text-[17px] shadow-2" disabled={!aiEnabled || isPending}>
            {isPending ? (
              <>
                <Loader2Icon className="animate-spin" /> Reading the set…
              </>
            ) : (
              <>
                <SparklesIcon className="size-5" /> Extract walls with AI{estimate !== undefined ? <span className="font-medium opacity-80"> · about {formatUsd(estimate.usd)}</span> : null}
              </>
            )}
          </Button>
          <p className="text-sm text-ink-3">
            {preview?.ok ? `${preview.pagesTotal} page${preview.pagesTotal === 1 ? '' : 's'} go to the AI · ` : ''}
            The read takes several minutes and can be cancelled. You review every wall before anything is built.
            {onSample !== undefined ? (
              <>
                {' '}
                <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={onSample}>
                  Or try a sample
                </Button>
                .
              </>
            ) : null}
          </p>
        </div>
      </form>
    </Form>
  );
}
