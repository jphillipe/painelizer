'use client';

import { ArrowLeftIcon, OctagonXIcon, RotateCcwIcon } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { ExtractOutcome } from '@/types/extract';
import type { Example, GenerateResult } from '@/types/panels';
import { generatePanels } from '../_actions/generate-panels';
import { AdvancedImport } from './advanced-import';
import { PreviewCard } from './preview-card';
import { ResultView } from './result-view';
import { SamplePicker } from './sample-picker';
import { StepBar, type StepId } from './step-bar';
import { UploadForm } from './upload-form';
import { WallsReview } from './walls-review';

export interface NewProjectViewProps {
  examples: readonly Example[];
  aiEnabled: boolean;
  illustration: string | undefined;
}

/**
 * Nova obra em três telas (docs/10-design.md §4): cada passo ocupa a tela sozinho; a barra de passos
 * leva de volta aos passos concluídos. Estado fica no cliente até a S22 (projetos salvos com URL própria).
 */
export function NewProjectView({ examples, aiEnabled, illustration }: NewProjectViewProps) {
  const [step, setStep] = useState<StepId>(1);
  const [outcome, setOutcome] = useState<ExtractOutcome | undefined>(undefined);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<GenerateResult | undefined>(undefined);

  const generate = useAction(generatePanels, {
    onSuccess: ({ data }) => {
      if (data) {
        setResult(data);
        setStep(3);
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? error.validationErrors?.projectText?._errors?.[0] ?? 'Could not generate panels.'),
  });

  const onOutcome = (o: ExtractOutcome) => {
    setOutcome(o);
    setResult(undefined);
    if (o.ok) setStep(2);
    else toast.error(o.message);
  };
  const runProject = (projectText: string) => {
    if (projectText.trim() === '') return;
    generate.execute({ projectText });
  };
  const startOver = () => {
    setOutcome(undefined);
    setResult(undefined);
    setStep(1);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const done: StepId[] = [...(outcome?.ok ? [1 as const] : []), ...(result ? [1 as const, 2 as const] : [])];

  return (
    <div className="space-y-8">
      <header className="no-print space-y-3">
        <p className="eyebrow">New project</p>
        <h1>From drawings to panels.</h1>
        <p className="max-w-2xl text-ink-2">
          Upload the plan set. The AI reads the walls, you check them, and the engine builds every fabrication sheet. Nothing is
          built before your review.
        </p>
      </header>

      <StepBar active={step} done={done} onGo={setStep} />

      {step === 1 ? (
        <section key="upload" className="step-enter no-print grid gap-6 lg:grid-cols-[5fr_7fr] lg:items-start">
          <div className="space-y-4">
            <div className="rounded-md border bg-card p-6 shadow-1">
              <UploadForm aiEnabled={aiEnabled} onOutcome={onOutcome} onPendingChange={setExtracting} />
            </div>
            <div className="space-y-4 rounded-md border bg-card p-6">
              <SamplePicker examples={examples} disabled={generate.isPending || extracting} onPick={runProject} />
              <Separator />
              <AdvancedImport onProjectText={runProject} onOutcome={onOutcome} />
            </div>
          </div>
          <PreviewCard illustration={illustration} outcome={outcome} />
        </section>
      ) : null}

      {step === 2 ? (
        <section key="review" className="step-enter no-print space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">02 · Review walls</p>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              <ArrowLeftIcon /> Back to drawings
            </Button>
          </div>
          {outcome?.ok ? (
            <WallsReview outcome={outcome} pending={generate.isPending} onGenerate={runProject} />
          ) : (
            <Alert variant="destructive">
              <OctagonXIcon />
              <AlertTitle>Nothing to review</AlertTitle>
              <AlertDescription>{outcome?.message ?? 'Upload drawings or pick a sample first.'}</AlertDescription>
            </Alert>
          )}
        </section>
      ) : null}

      {step === 3 ? (
        <section key="panels" className="step-enter space-y-4">
          <div className="no-print flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">03 · Panels</p>
            <div className="flex gap-2">
              {outcome?.ok ? (
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                  <ArrowLeftIcon /> Back to review
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={startOver}>
                <RotateCcwIcon /> Start over
              </Button>
            </div>
          </div>
          <ResultView result={result} pending={generate.isPending} />
        </section>
      ) : null}
    </div>
  );
}
