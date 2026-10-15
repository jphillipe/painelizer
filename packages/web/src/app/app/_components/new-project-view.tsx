'use client';

import { OctagonXIcon } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { generatePanels } from '../_actions/generate-panels';
import { AdvancedImport } from './advanced-import';
import { ResultView } from './result-view';
import { SamplePicker } from './sample-picker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { UploadForm } from './upload-form';
import { WallsReview } from './walls-review';
import type { ExtractOutcome } from '@/types/extract';
import type { Example, GenerateResult } from '@/types/panels';

export interface NewProjectViewProps {
  examples: readonly Example[];
  aiEnabled: boolean;
}

/**
 * Fluxo do usuário em três passos (docs/10-design.md §4): 01 desenhos → 02 revisão das paredes →
 * 03 painéis. Exemplo e arquivo de projeto pulam o passo 02.
 */
export function NewProjectView({ examples, aiEnabled }: NewProjectViewProps) {
  const [outcome, setOutcome] = useState<ExtractOutcome | undefined>(undefined);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<GenerateResult | undefined>(undefined);
  const reviewRef = useRef<HTMLElement>(null);
  const panelsRef = useRef<HTMLElement>(null);

  const generate = useAction(generatePanels, {
    onSuccess: ({ data }) => {
      if (data) setResult(data);
    },
    onError: ({ error }) => toast.error(error.serverError ?? error.validationErrors?.projectText?._errors?.[0] ?? 'Could not generate panels.'),
  });

  const onOutcome = (o: ExtractOutcome) => {
    setOutcome(o);
    setResult(undefined);
  };
  const runProject = (projectText: string) => {
    if (projectText.trim() === '') return;
    generate.execute({ projectText });
  };

  useEffect(() => {
    if (outcome) reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [outcome]);
  useEffect(() => {
    if (result) panelsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result]);

  return (
    <div className="space-y-10">
      <section className="no-print">
        <p className="eyebrow">01 · Your drawings</p>
        <h1 className="mt-2">From drawings to panels.</h1>
        <p className="mt-3 mb-6 text-ink-2">Upload the plan set. The AI reads the walls; you check them; the engine builds every panel.</p>
        <Card>
          <CardContent className="space-y-6 pt-6">
            <UploadForm aiEnabled={aiEnabled} onOutcome={onOutcome} onPendingChange={setExtracting} />
            <Separator />
            <SamplePicker examples={examples} disabled={generate.isPending || extracting} onPick={runProject} />
            <AdvancedImport onProjectText={runProject} onOutcome={onOutcome} />
          </CardContent>
        </Card>
      </section>

      {outcome ? (
        <section ref={reviewRef} className="no-print scroll-mt-6">
          <p className="eyebrow">02 · Review walls</p>
          <div className="mt-2">
            {outcome.ok ? (
              <WallsReview outcome={outcome} pending={generate.isPending} onGenerate={runProject} />
            ) : (
              <Alert variant={outcome.reason === 'no_key' ? 'warning' : 'destructive'}>
                <OctagonXIcon />
                <AlertTitle>{outcome.reason === 'no_key' ? 'AI extraction is off' : 'Extraction failed'}</AlertTitle>
                <AlertDescription>
                  <p>{outcome.message}</p>
                  {outcome.rawText ? <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-ink">{outcome.rawText}</pre> : null}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </section>
      ) : null}

      <section ref={panelsRef} className="scroll-mt-6">
        <p className="eyebrow no-print">03 · Panels</p>
        <div className="mt-2">
          <ResultView result={result} pending={generate.isPending} />
        </div>
      </section>
    </div>
  );
}
