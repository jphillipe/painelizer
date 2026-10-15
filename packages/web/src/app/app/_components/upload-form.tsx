'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon, SparklesIcon, TriangleAlertIcon } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { extractWalls } from '../_actions/extract-walls';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { uploadFieldsSchema, type UploadFields } from '@/schemas/extract';
import { ACCEPTED_UPLOAD_EXTENSIONS, type ExtractOutcome } from '@/types/extract';

export interface UploadFormProps {
  aiEnabled: boolean;
  onOutcome: (outcome: ExtractOutcome) => void;
  onPendingChange: (pending: boolean) => void;
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Passo 01: os desenhos (PDFs e imagens, vários) → action `extractWalls` → revisão de paredes. */
export function UploadForm({ aiEnabled, onOutcome, onPendingChange }: UploadFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const form = useForm<UploadFields>({
    resolver: zodResolver(uploadFieldsSchema),
    defaultValues: { pages: '', level: '', notes: '' },
  });

  const { execute, isPending } = useAction(extractWalls, {
    onExecute: () => onPendingChange(true),
    onSettled: () => onPendingChange(false),
    onSuccess: ({ data }) => {
      if (data) onOutcome(data);
    },
    onError: ({ error }) => toast.error(error.serverError ?? 'Could not extract walls.'),
  });

  const submit = (fields: UploadFields) => {
    if (files.length === 0) {
      toast.error('Add at least one PDF or image.');
      return;
    }
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    fd.set('pages', fields.pages);
    fd.set('level', fields.level);
    fd.set('notes', fields.notes);
    execute(fd);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
        {aiEnabled ? null : (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>AI extraction is off on this server</AlertTitle>
            <AlertDescription>
              ANTHROPIC_API_KEY is not set. You can still try a sample below, or import a project file under Advanced.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="files">Drawings</Label>
          <Input
            id="files"
            type="file"
            multiple
            accept={ACCEPTED_UPLOAD_EXTENSIONS.join(',')}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <p className="text-sm text-ink-3">
            PDF (vector sets work best), PNG or JPG. Floor plan, wall types, door and window schedules, elevations.
          </p>
          {files.length > 0 ? (
            <ul className="divide-y divide-line-faint rounded-md border bg-card text-sm">
              {files.map((f) => (
                <li key={`${f.name}-${f.size}`} className="flex items-center justify-between px-3 py-1.5">
                  <span className="truncate font-mono text-[13px]">{f.name}</span>
                  <span className="text-ink-3">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="pages"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PDF pages (optional)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g. 3,15" className="font-mono" />
                </FormControl>
                <FormDescription>Empty: the floor plan and schedule sheets are picked by their title block.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="level"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Level (optional)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="1" inputMode="numeric" className="font-mono" />
                </FormControl>
                <FormDescription>Which floor to extract when the set has several.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes for the AI (optional)</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} placeholder="e.g. Ignore the garage. North is up." />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="accent" disabled={!aiEnabled || isPending}>
            {isPending ? (
              <>
                <Loader2Icon className="animate-spin" /> Extracting…
              </>
            ) : (
              <>
                <SparklesIcon /> Extract walls with AI
              </>
            )}
          </Button>
          <span className="text-sm text-ink-3">{isPending ? 'This can take a few minutes.' : 'You review every wall before anything is built.'}</span>
        </div>
      </form>
    </Form>
  );
}
