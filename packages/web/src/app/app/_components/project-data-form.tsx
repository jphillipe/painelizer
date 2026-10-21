'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import type { ProjectDataNeeds, RequiredField } from '@/lib/editor/requirements';
import { projectDataSchema } from '@/schemas/extract';
import { EMPTY_PROJECT_DATA, type ExtractOutcome, type ProjectData } from '@/types/extract';
import { applyProjectData } from '../_actions/apply-project-data';
import { ProjectDataFields } from './project-data-fields';

export interface ProjectDataFormProps {
  outcome: Extract<ExtractOutcome, { ok: true }>;
  onOutcome: (outcome: ExtractOutcome) => void;
  /**
   * `card`: dentro das configurações do projeto. `setup`: o card "Before you review" (S21.4) que ocupa o centro do
   * workspace enquanto falta o que o motor exige — pede tudo de uma vez, obrigatório marcado, o resto recolhido.
   */
  variant?: 'card' | 'setup';
  /** Há edições no editor: aplicar reconstrói o projeto a partir da leitura e as descarta — confirmar antes (S21). */
  confirm?: boolean;
  /** `setup`: deixa a planta aparecer sem aplicar (os dados podem ser dados parede a parede). */
  onSkip?: () => void;
  /** `setup`: o que o motor exige deste projeto (lib/editor/requirements). */
  needs?: ProjectDataNeeds;
  /** Só estes campos (M5: nas configurações, o que não tem campo próprio no projeto). */
  fields?: readonly (keyof ProjectData)[] | undefined;
}

const REQUIRED_KEY: Record<RequiredField, keyof ProjectData> = { wallHeight: 'wallHeight', snow: 'snow', width: 'width', floors: 'floors', floorSpan: 'floorSpan' };

/**
 * Revisão: o que os desenhos não trazem, aplicado à leitura já feita sem chamar a IA de novo. O resultado
 * recarrega o projeto no editor; com edições pendentes, pede confirmação.
 */
export function ProjectDataForm({ outcome, onOutcome, variant = 'card', confirm = false, onSkip, needs, fields }: ProjectDataFormProps) {
  // `given` pode faltar numa leitura feita antes desta tela existir.
  const form = useForm<ProjectData>({ resolver: zodResolver(projectDataSchema), defaultValues: { ...EMPTY_PROJECT_DATA, ...(outcome.given ?? {}) } });
  const [pendingData, setPendingData] = useState<ProjectData | undefined>(undefined);
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
  const apply = (data: ProjectData): void => execute({ output: outcome.output, meta: { model: outcome.model, pagesSent: outcome.pagesSent ?? [] }, data });
  const setup = variant === 'setup';
  const required = needs?.required ?? [];

  const submit = (data: ProjectData): void => {
    // No card de setup o obrigatório é obrigatório: o motor não gera sem ele.
    let missing = false;
    for (const r of required) {
      const key = REQUIRED_KEY[r];
      // Sem pavimento acima a tabela não distingue center-bearing de clear span: o vão do piso deixa de importar.
      if (key === 'floorSpan' && data.floors === '0') continue;
      if (data[key] === '') {
        form.setError(key, { type: 'required', message: 'Required for this project.' });
        missing = true;
      }
    }
    if (missing) return;
    if (confirm) setPendingData(data);
    else apply(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className={setup ? 'space-y-5' : 'rounded-md border bg-card p-5'}>
        {setup && needs !== undefined ? (
          <div className="space-y-2">
            <p className="eyebrow">Before you review</p>
            <h2>The drawings don’t give everything the engine needs.</h2>
            <ul className="max-w-prose list-disc space-y-1 pl-5 text-ink-2">
              {needs.wallsWithoutHeight.length > 0 ? (
                <li>
                  <strong>Wall height</strong> — {needs.wallsWithoutHeight.length} wall{needs.wallsWithoutHeight.length === 1 ? ' has' : 's have'} none. One value goes to every wall without
                  a height; you can change any wall afterwards.
                </li>
              ) : null}
              {needs.buildingMissing || needs.wallsWithoutFloors.length > 0 || needs.wallsWithoutFloorSpan.length > 0 ? (
                <li>
                  <strong>
                    {[needs.buildingMissing ? 'Snow load and building width' : '', needs.wallsWithoutFloors.length > 0 ? 'floors above this level' : '', needs.wallsWithoutFloorSpan.length > 0 ? 'floor span' : '']
                      .filter(Boolean)
                      .join(', ')}
                  </strong>{' '}
                  —{' '}
                  {needs.tableHeaderWalls.length} bearing wall{needs.tableHeaderWalls.length === 1 ? ' has' : 's have'} openings with no header in the schedule, so the engine picks
                  the header from the IRC table ({needs.tableHeaderWalls.join(', ')}). Or give each opening its own header in the editor.
                </li>
              ) : null}
            </ul>
          </div>
        ) : setup ? null : (
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base">{fields === undefined ? 'Project data the drawings don’t have' : 'Defaults applied through the reading'}</h3>
            <span className="text-sm text-ink-3">{confirm ? 'Rebuilds the project from the reading.' : 'Applied instantly, no new AI call.'}</span>
          </div>
        )}
        <ProjectDataFields control={form.control} layout={setup ? 'setup' : 'compact'} required={required} fields={fields} />
        <div className={setup ? 'flex flex-wrap items-center gap-4' : 'mt-4 flex items-center gap-3'}>
          <Button type="submit" variant={setup ? 'accent' : 'default'} size={setup ? 'default' : 'sm'} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2Icon className="animate-spin" /> Applying…
              </>
            ) : setup ? (
              'Apply and open the editor'
            ) : (
              'Apply to this reading'
            )}
          </Button>
          {setup && onSkip !== undefined ? (
            <Button type="button" variant="link" className="px-0" onClick={onSkip}>
              Skip — set it per wall instead
            </Button>
          ) : null}
          {setup ? <span className="text-sm text-ink-3">No new AI call.</span> : null}
        </div>
      </form>
      <Dialog open={pendingData !== undefined} onOpenChange={(open) => !open && setPendingData(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard your edits?</DialogTitle>
            <DialogDescription>
              Applying project data rebuilds the project from the AI reading. Every change you made in the editor is discarded and the undo
              history is cleared. Heights can also be set per wall in the editor without rebuilding.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingData(undefined)}>
              Keep my edits
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingData !== undefined) apply(pendingData);
                setPendingData(undefined);
              }}
            >
              Rebuild from the reading
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Form>
  );
}
