'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon, SparklesIcon, TriangleAlertIcon } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { uploadFieldsSchema, type UploadFields } from '@/schemas/extract';
import type { ExtractOutcome } from '@/types/extract';
import { extractWalls } from '../_actions/extract-walls';
import { DropZone } from './drop-zone';

export interface UploadFormProps {
  aiEnabled: boolean;
  onOutcome: (outcome: ExtractOutcome) => void;
  onPendingChange: (pending: boolean) => void;
}

const AUTO = 'auto';

/** Passo 1: os desenhos (vários arquivos) e os detalhes do projeto → action `extractWalls`. */
export function UploadForm({ aiEnabled, onOutcome, onPendingChange }: UploadFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const form = useForm<UploadFields>({
    resolver: zodResolver(uploadFieldsSchema),
    defaultValues: { level: '', projectName: '', pages: '', notes: '' },
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
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    execute(fd);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
        {aiEnabled ? null : (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>AI extraction is off on this server</AlertTitle>
            <AlertDescription>ANTHROPIC_API_KEY is not set. Try a sample below, or import a project file under Advanced.</AlertDescription>
          </Alert>
        )}

        <section className="space-y-3">
          <h3>Your drawings</h3>
          <DropZone files={files} onFiles={setFiles} disabled={isPending} />
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
                  <Select value={field.value === '' ? undefined : field.value} onValueChange={(v) => field.onChange(v === AUTO ? '' : v)}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Identify from drawings" />
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
                <FormDescription>Empty: the floor plan and schedule sheets are picked by their title block.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
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

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="accent" disabled={!aiEnabled || isPending}>
            {isPending ? (
              <>
                <Loader2Icon className="animate-spin" /> Reading the set…
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
