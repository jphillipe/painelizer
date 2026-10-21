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
import { PdfPages } from './pdf-pages';
import { ProjectDataFields } from './project-data-fields';
import { SendPreview } from './send-preview';

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

/** Páginas marcadas nas miniaturas → texto do campo (`3,15`), união entre os PDFs (o campo vale para os sem marca). */
export function pagesText(selected: ReadonlyMap<string, ReadonlySet<number>>): string {
  const all = new Set<number>();
  for (const s of selected.values()) for (const p of s) all.add(p);
  return [...all].sort((a, b) => a - b).join(',');
}

/** Páginas por arquivo (M7), como o FormData leva. */
export function pagesByFileJson(selected: ReadonlyMap<string, ReadonlySet<number>>): string {
  const out: Record<string, number[]> = {};
  for (const [name, s] of selected) if (s.size > 0) out[name] = [...s].sort((a, b) => a - b);
  return Object.keys(out).length === 0 ? '' : JSON.stringify(out);
}

/** Páginas que a prévia diz que vão, por arquivo (para as miniaturas marcarem). */
export function sentPages(preview: ExtractPreview | undefined): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  if (preview === undefined || !preview.ok) return out;
  for (const f of preview.files) if (f.kind === 'pdf') out.set(f.name, new Set(f.pages.map((p) => p.page)));
  return out;
}

function newJobId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Passo 1: os desenhos (vários arquivos) e os detalhes do projeto → action `extractWalls`.
 * Fica montado (escondido) durante a leitura, para o humano voltar com arquivos e campos se ela falhar.
 * M7: prévia do que vai ser enviado (páginas, folhas fora, tamanho, custo estimado) antes de pagar; páginas por
 * arquivo; a leitura leva um `jobId` para a tela de espera acompanhar e recolher depois de um F5.
 */
export function UploadForm({ aiEnabled, onOutcome, onJobChange, onSample, onFilesChange }: UploadFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [filesError, setFilesError] = useState<string | undefined>(undefined);
  const [picked, setPicked] = useState<Map<string, Set<number>>>(new Map());
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
    fd.set('pagesByFile', pagesByFileJson(picked));
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
  }, [files, picked, pagesField, levelField, previewAuto, previewWanted]);

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
    // Arquivo removido: suas páginas marcadas saem do campo.
    const names = new Set(next.map((f) => f.name));
    const kept = new Map([...picked].filter(([name]) => names.has(name)));
    if (kept.size !== picked.size) {
      setPicked(kept);
      form.setValue('pages', pagesText(kept), { shouldDirty: true });
    }
  };
  const togglePage = (file: string, page: number): void => {
    const next = new Map(picked);
    const set = new Set(next.get(file) ?? []);
    if (set.has(page)) set.delete(page);
    else set.add(page);
    if (set.size === 0) next.delete(file);
    else next.set(file, set);
    setPicked(next);
    form.setValue('pages', pagesText(next), { shouldDirty: true });
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

        <section className="space-y-3">
          <h3>Your drawings</h3>
          <DropZone files={files} onFiles={onFiles} disabled={isPending} error={filesError} />
          <PdfPages files={files} selected={picked} sent={sentPages(preview)} onToggle={togglePage} />
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-2">Drawing checklist</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
              <li>Floor plan of the level to panelize, with dimensions readable.</li>
              <li>Wall type sheet (partition types) and door and window schedules.</li>
              <li>Elevations or sections when head heights and sill heights matter.</li>
              <li>Structural notes (snow load, wind, species) if you have them: the engine sizes headers by code tables.</li>
            </ul>
          </details>
        </section>

        <section className="space-y-4">
          <h3>Project details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
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
                  <FormLabel>
                    Project name <span className="font-normal text-ink-3">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Maple St duplex" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="pages"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  PDF pages <span className="font-normal text-ink-3">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g. 3,15" className="font-mono sm:w-60" />
                </FormControl>
                <FormDescription>Click page thumbnails above (per file), or type numbers here for every PDF without a click. Empty: the floor plan and schedule sheets are picked by their title block.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-2">Wall height and structural data (optional now; you can add them at review)</summary>
            <p className="mt-2 mb-3 text-ink-3">Only used where the drawings say nothing. The engine sizes headers by the IRC tables.</p>
            <ProjectDataFields control={form.control} />
          </details>
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-2">Add notes for the AI (optional)</summary>
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
        </section>

        {files.length > 0 ? (
          <SendPreview preview={preview} previewing={previewing} estimate={estimate} needsRequest={!previewAuto && !previewWanted} totalBytes={totalBytes} onRequest={() => setPreviewWanted(true)} />
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="accent" disabled={!aiEnabled || isPending}>
            {isPending ? (
              <>
                <Loader2Icon className="animate-spin" /> Reading the set…
              </>
            ) : (
              <>
                <SparklesIcon /> Extract walls with AI{estimate !== undefined ? <span className="font-medium opacity-80"> · about {formatUsd(estimate.usd)}</span> : null}
              </>
            )}
          </Button>
          {onSample !== undefined ? (
            <Button type="button" variant="link" className="px-0" onClick={onSample}>
              or try a sample
            </Button>
          ) : null}
          <span className="text-sm text-ink-3">The read takes several minutes and can be cancelled. You review every wall before anything is built.</span>
        </div>
      </form>
    </Form>
  );
}
