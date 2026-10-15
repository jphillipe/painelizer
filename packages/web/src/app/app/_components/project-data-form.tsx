'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { projectDataSchema } from '@/schemas/extract';
import { EMPTY_PROJECT_DATA, type ExtractOutcome, type ProjectData } from '@/types/extract';
import { applyProjectData } from '../_actions/apply-project-data';
import { ProjectDataFields } from './project-data-fields';

export interface ProjectDataFormProps {
  outcome: Extract<ExtractOutcome, { ok: true }>;
  onOutcome: (outcome: ExtractOutcome) => void;
  highlight: boolean;
}

/** Revisão: o que os desenhos não trazem, aplicado à leitura já feita sem chamar a IA de novo. */
export function ProjectDataForm({ outcome, onOutcome, highlight }: ProjectDataFormProps) {
  // `given` pode faltar numa leitura feita antes desta tela existir.
  const form = useForm<ProjectData>({ resolver: zodResolver(projectDataSchema), defaultValues: { ...EMPTY_PROJECT_DATA, ...(outcome.given ?? {}) } });
  const { execute, isPending } = useAction(applyProjectData, {
    onSuccess: ({ data }) => {
      if (!data) return;
      if (data.ok) {
        onOutcome(data);
        toast.success('Project data applied.');
      } else {
        toast.error(data.message);
      }
    },
    onError: ({ error }) => {
      const field = error.validationErrors ? Object.values(error.validationErrors).find((v) => typeof v === 'object' && v && '_errors' in v) : undefined;
      const fieldMsg = field && typeof field === 'object' && '_errors' in field ? (field as { _errors?: string[] })._errors?.[0] : undefined;
      toast.error(error.serverError ?? fieldMsg ?? 'Could not apply the project data.');
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((data) => execute({ output: outcome.output, meta: { model: outcome.model, pagesSent: outcome.pagesSent ?? [] }, data }))}
        className={highlight ? 'rounded-md border border-warning/50 bg-gold-100/40 p-5' : 'rounded-md border bg-card p-5'}
      >
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3>Project data the drawings don’t have</h3>
          <span className="text-sm text-ink-3">Applied instantly, no new AI call.</span>
        </div>
        <ProjectDataFields control={form.control} compact />
        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" variant={highlight ? 'accent' : 'default'} size="sm" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2Icon className="animate-spin" /> Applying…
              </>
            ) : (
              'Apply to this reading'
            )}
          </Button>
          {highlight ? <span className="text-sm text-ink-2">The engine needs at least the wall height.</span> : null}
        </div>
      </form>
    </Form>
  );
}
