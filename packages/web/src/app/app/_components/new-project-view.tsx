'use client';

import { ArrowLeftIcon, OctagonXIcon, RotateCcwIcon } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useEffect, useReducer, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useWorkspaceLayout } from '@/components/shell-layout';
import { textFromDraft } from '@/lib/editor/draft';
import { editorReducer, initialEditorState, type DraftSource } from '@/lib/editor/state';
import type { ExtractJob, ExtractOutcome } from '@/types/extract';
import type { Example, GenerateResult } from '@/types/panels';
import { generatePanels } from '../_actions/generate-panels';
import { AdvancedImport } from './advanced-import';
import { useProjectCheck } from './editor/use-project-check';
import { WallEditor } from './editor/wall-editor';
import { ExtractProgress } from './extract-progress';
import { PreviewCard } from './preview-card';
import { ResultView } from './result-view';
import { SamplePicker } from './sample-picker';
import { StepBar, type StepId } from './step-bar';
import { UploadForm } from './upload-form';

export interface NewProjectViewProps {
  examples: readonly Example[];
  aiEnabled: boolean;
  illustration: string | undefined;
}

/**
 * Nova obra em três telas (docs/10-design.md §4): cada passo ocupa a tela sozinho; a barra de passos leva de
 * volta aos passos concluídos. O passo 02 é o editor (S21): o projeto vive no `editorReducer` (draft, seleção,
 * histórico) e a leitura da IA (`outcome`) fica como proveniência. Estado no cliente até a S22.
 */
export function NewProjectView({ examples, aiEnabled, illustration }: NewProjectViewProps) {
  const [step, setStep] = useState<StepId>(1);
  const [outcome, setOutcome] = useState<ExtractOutcome | undefined>(undefined);
  const [job, setJob] = useState<ExtractJob | undefined>(undefined);
  const extracting = job !== undefined;
  const [result, setResult] = useState<GenerateResult | undefined>(undefined);
  const [editor, dispatch] = useReducer(editorReducer, initialEditorState);
  const check = useProjectCheck(editor.draft, editor.revision);

  const generate = useAction(generatePanels, {
    onSuccess: ({ data }) => {
      if (data) {
        setResult(data);
        setStep(3);
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? error.validationErrors?.projectText?._errors?.[0] ?? 'Could not generate panels.'),
  });

  const openProject = (text: string, source: DraftSource) => {
    dispatch({ type: 'load', text, source });
    setResult(undefined);
    setStep(2);
  };
  const onOutcome = (o: ExtractOutcome) => {
    setOutcome(o);
    if (o.ok) openProject(o.projectText, 'extraction');
    else toast.error(o.message);
  };
  const openFile = (text: string, source: DraftSource) => {
    if (text.trim() === '') return;
    setOutcome(undefined);
    openProject(text, source);
  };
  const runProject = () => {
    if (editor.draft === undefined) return;
    generate.execute({ projectText: textFromDraft(editor.draft) });
  };
  const startOver = () => {
    setOutcome(undefined);
    setResult(undefined);
    dispatch({ type: 'reset' });
    setStep(1);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, extracting]);

  const done: StepId[] = [...(editor.draft !== undefined ? [1 as const] : []), ...(result ? [1 as const, 2 as const] : [])];
  const okOutcome = outcome?.ok ? outcome : undefined;

  const workspace = step === 2 && editor.draft !== undefined;
  useWorkspaceLayout(workspace);

  if (workspace) {
    return (
      <WallEditor
        state={editor}
        dispatch={dispatch}
        outcome={okOutcome}
        check={check}
        pending={generate.isPending}
        onGenerate={runProject}
        onOutcome={onOutcome}
        steps={<StepBar active={step} done={done} onGo={setStep} compact />}
        onStartOver={startOver}
      />
    );
  }

  return (
    <div className="space-y-8">
      <header className="no-print space-y-3">
        <p className="eyebrow">New project</p>
        <h1>From drawings to panels.</h1>
        <p className="max-w-2xl text-ink-2">
          Upload the plan set. The AI reads the walls, you check and fix them in the editor, and the engine builds every
          fabrication sheet. Nothing is built before your review.
        </p>
      </header>

      <StepBar active={step} done={done} onGo={setStep} />

      {step === 1 && job ? <ExtractProgress job={job} /> : null}

      {step === 1 ? (
        // Escondido (não desmontado) durante a leitura: arquivos e campos voltam intactos se ela falhar.
        <section
          key="upload"
          className={extracting ? 'hidden' : 'step-enter no-print grid gap-6 lg:grid-cols-[5fr_7fr] lg:items-start'}
        >
          <div className="space-y-4">
            <Card className="gap-0 p-6">
              <UploadForm aiEnabled={aiEnabled} onOutcome={onOutcome} onJobChange={setJob} />
            </Card>
            <Card className="gap-4 p-6">
              <SamplePicker examples={examples} disabled={generate.isPending || extracting} onPick={(text) => openFile(text, 'sample')} />
              <Separator />
              <AdvancedImport onProjectText={(text) => openFile(text, 'file')} onOutcome={onOutcome} />
            </Card>
          </div>
          <PreviewCard illustration={illustration} outcome={outcome} />
        </section>
      ) : null}

      {step === 2 ? (
        // Com draft aberto o passo 02 é o workspace (retorno acima); aqui só o que não abriu.
        <section key="review" className="step-enter no-print space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">02 · Review walls</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeftIcon /> Back to drawings
              </Button>
              <Button variant="outline" size="sm" onClick={startOver}>
                <RotateCcwIcon /> Start over
              </Button>
            </div>
          </div>
          <Alert variant="destructive">
            <OctagonXIcon />
            <AlertTitle>{editor.loadError !== undefined ? 'This project can’t be opened' : 'Nothing to review'}</AlertTitle>
            <AlertDescription>{editor.loadError ?? (outcome && !outcome.ok ? outcome.message : 'Upload drawings or pick a sample first.')}</AlertDescription>
          </Alert>
        </section>
      ) : null}

      {step === 3 ? (
        <section key="panels" className="step-enter space-y-4">
          <div className="no-print flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">03 · Panels</p>
            <div className="flex gap-2">
              {editor.draft !== undefined ? (
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
