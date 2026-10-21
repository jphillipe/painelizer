'use client';

import { ArrowLeftIcon, HistoryIcon, OctagonXIcon, RotateCcwIcon } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useWorkspaceLayout } from '@/components/shell-layout';
import { engineText } from './editor/use-project-check';
import { describeAge, type SavedSession } from '@/lib/editor/persist';
import { projectFileText, type ParsedProjectFile, type Reading } from '@/lib/editor/project-file';
import { idIndex } from '@/lib/editor/problems';
import { editorReducer, initialEditorState, type DraftSource } from '@/lib/editor/state';
import { prefersReducedMotion } from '@/lib/motion';
import type { ExtractJob, ExtractOutcome } from '@/types/extract';
import type { Example, GenerateResult } from '@/types/panels';
import { generatePanels } from '../_actions/generate-panels';
import { AdvancedImport } from './advanced-import';
import { ConfirmDialog } from './confirm-dialog';
import { useProjectCheck } from './editor/use-project-check';
import { WallEditor } from './editor/wall-editor';
import { ExtractProgress } from './extract-progress';
import { PreviewCard } from './preview-card';
import { ResultView } from './result-view';
import { SamplePicker } from './sample-picker';
import { doneSteps, StepBar, type StepId } from './step-bar';
import { UploadForm } from './upload-form';
import { useSavedSession } from './use-saved-session';

export interface NewProjectViewProps {
  examples: readonly Example[];
  aiEnabled: boolean;
  illustration: string | undefined;
  /** Exemplos e 'Advanced' (M5): só em desenvolvimento ou com PANELIZER_DEV_TOOLS=1. */
  devTools?: boolean;
}

const SOURCE_LABEL: Record<DraftSource, string> = { extraction: 'from an AI reading', sample: 'a sample project', file: 'from a project file' };

/**
 * Nova obra em três telas (docs/10-design.md §4): cada passo ocupa a tela sozinho; a barra de passos leva de
 * volta aos concluídos. O passo 02 é o editor (S21): o projeto vive no `editorReducer` (draft, seleção,
 * histórico) e a leitura da IA (`outcome`) fica como proveniência. Estado no cliente até a S22 — com auto-save
 * no navegador e banner de retomada (M2), para uma leitura de 10 minutos não morrer num F5.
 */
export function NewProjectView({ examples, aiEnabled, illustration, devTools = false }: NewProjectViewProps) {
  const [step, setStep] = useState<StepId>(1);
  const [outcome, setOutcome] = useState<ExtractOutcome | undefined>(undefined);
  const [job, setJob] = useState<ExtractJob | undefined>(undefined);
  // Arquivos do passo 01 (M6): a planta por baixo das paredes escolhe entre eles.
  const [uploaded, setUploaded] = useState<File[]>([]);
  const extracting = job !== undefined;
  const [result, setResult] = useState<GenerateResult | undefined>(undefined);
  // Revisão do draft de que `result` saiu: editar depois marca o resultado como desatualizado.
  const [resultRevision, setResultRevision] = useState(0);
  const generatedFrom = useRef(0);
  const [confirmingStartOver, setConfirmingStartOver] = useState(false);
  const [editor, dispatch] = useReducer(editorReducer, initialEditorState);
  const check = useProjectCheck(editor.draft, editor.revision);
  const okOutcome: Reading | undefined = outcome?.ok ? outcome : undefined;

  const generate = useAction(generatePanels, {
    onSuccess: ({ data }) => {
      if (data) {
        setResult(data);
        setResultRevision(generatedFrom.current);
        setStep(3);
      }
    },
    onError: ({ error }) => toast.error(error.serverError ?? error.validationErrors?.projectText?._errors?.[0] ?? 'Could not generate panels.'),
  });

  const openProject = useCallback((text: string, source: DraftSource, reading: Reading | undefined, dirty = false) => {
    setOutcome(reading);
    dispatch({ type: 'load', text, source, dirty });
    setResult(undefined);
    setStep(2);
  }, []);
  const onOutcome = (o: ExtractOutcome) => {
    if (o.ok) openProject(o.projectText, 'extraction', o);
    else {
      setOutcome(o);
      toast.error(o.message);
    }
  };
  const openFile = (file: ParsedProjectFile) => {
    if (file.projectText.trim() === '') return;
    openProject(file.projectText, file.reading === undefined ? 'file' : 'extraction', file.reading);
  };
  const openSample = (text: string) => {
    if (text.trim() !== '') openProject(text, 'sample', undefined);
  };
  const runProject = () => {
    if (editor.draft === undefined) return;
    generatedFrom.current = editor.revision;
    generate.execute({ projectText: engineText(editor.draft) });
  };
  const startOver = () => {
    setConfirmingStartOver(false);
    setOutcome(undefined);
    setResult(undefined);
    dispatch({ type: 'reset' });
    setStep(1);
  };
  // Há o que perder: edições, um resultado, ou uma leitura paga.
  const hasWork = editor.draft !== undefined && (editor.dirty || result !== undefined || okOutcome !== undefined);
  const requestStartOver = () => (hasWork ? setConfirmingStartOver(true) : startOver());

  const onResume = useCallback((s: SavedSession) => openProject(s.text, s.source, s.reading, s.dirty), [openProject]);
  const session = useSavedSession(editor, okOutcome, job, onResume);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [step, extracting]);

  const done = doneSteps(editor.draft !== undefined, result !== undefined);
  const resultStale = result !== undefined && resultRevision !== editor.revision;
  const canRegenerate = check.status === 'done' && !check.stale && check.result?.ok === true && !generate.isPending;
  const projectFile = editor.draft === undefined ? undefined : projectFileText(editor.draft, okOutcome);
  const ids = useMemo(() => (editor.draft === undefined ? undefined : idIndex(editor.draft)), [editor.draft]);

  const workspace = step === 2 && editor.draft !== undefined;
  useWorkspaceLayout(workspace);

  // O passo 1 fica montado em todo passo (escondido): arquivos e campos do upload sobrevivem a ir ao editor e
  // voltar, e à espera da leitura. Com `hidden` por classe, não por atributo (o `grid` venceria o atributo).
  const uploadVisible = step === 1 && !extracting;
  const upload = (
    <section key="upload" className={uploadVisible ? 'step-enter no-print mt-8 grid gap-6 lg:grid-cols-[5fr_7fr] lg:items-start' : 'hidden'} aria-hidden={!uploadVisible}>
      <div className="space-y-4">
        <Card className="gap-0 p-6">
          <UploadForm aiEnabled={aiEnabled} onOutcome={onOutcome} onJobChange={setJob} onFilesChange={setUploaded} onSample={devTools ? () => document.getElementById('sample')?.focus() : undefined} />
        </Card>
        {devTools ? (
          <Card className="lift gap-4 p-6">
            <SamplePicker examples={examples} disabled={generate.isPending || extracting} onPick={openSample} />
            <Separator />
            <AdvancedImport onProjectFile={openFile} onOutcome={onOutcome} />
          </Card>
        ) : (
          <Card className="gap-3 p-6">
            <AdvancedImport onProjectFile={openFile} onOutcome={onOutcome} />
          </Card>
        )}
      </div>
      <PreviewCard illustration={illustration} outcome={outcome} />
    </section>
  );

  return (
    <>
      {workspace ? (
        <WallEditor
          state={editor}
          dispatch={dispatch}
          outcome={okOutcome}
          check={check}
          pending={generate.isPending}
          onGenerate={runProject}
          onOutcome={onOutcome}
          steps={<StepBar active={step} done={done} onGo={setStep} compact />}
          onStartOver={requestStartOver}
          sourceFiles={uploaded}
        />
      ) : (
        <div className="space-y-8">
          {step === 1 ? (
            // O hero só no passo 01 (M3): nos outros, o eyebrow do passo já diz onde se está.
            <header className="no-print space-y-3">
              <p className="eyebrow">New project</p>
              <h1>From drawings to panels.</h1>
              <p className="max-w-2xl text-ink-2">
                Upload the plan set. The AI reads the walls, you check and fix them in the editor, and the engine builds every
                fabrication sheet. Nothing is built before your review.
              </p>
            </header>
          ) : (
            <h1 className="sr-only">{step === 2 ? 'Review walls' : 'Panels'}</h1>
          )}

          <StepBar active={step} done={done} onGo={setStep} />

          {step === 1 && !extracting && editor.draft === undefined && session.saved !== undefined ? (
            <ResumeBanner saved={session.saved} onResume={session.resume} onDiscard={session.discard} />
          ) : null}

          {step === 1 && job ? <ExtractProgress job={job} /> : null}

          {step === 2 ? (
            // Com draft aberto o passo 02 é o workspace (retorno acima); aqui só o que não abriu.
            <section key="review" className="step-enter no-print space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="eyebrow">02 · Review walls</p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                    <ArrowLeftIcon /> Back to drawings
                  </Button>
                  <Button variant="outline" size="sm" onClick={requestStartOver}>
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
                  <Button variant="outline" size="sm" onClick={requestStartOver}>
                    <RotateCcwIcon /> Start over
                  </Button>
                </div>
              </div>
              <ResultView result={result} pending={generate.isPending} projectFile={projectFile} stale={resultStale} canRegenerate={canRegenerate} onRegenerate={runProject} ids={ids} />
            </section>
          ) : null}
        </div>
      )}

      {upload}

      <ConfirmDialog
        open={confirmingStartOver}
        onOpenChange={setConfirmingStartOver}
        title="Start over?"
        description={
          okOutcome !== undefined
            ? 'This closes the project and its AI reading. A read takes several minutes and costs money; save the project file from the menu first if you may want it back.'
            : 'This closes the project and discards your edits and the generated panels.'
        }
        confirmLabel="Start over"
        destructive
        onConfirm={startOver}
      />
    </>
  );
}

/** Sessão gravada neste navegador (M2): oferece retomar antes de qualquer coisa. */
function ResumeBanner({ saved, onResume, onDiscard }: { saved: SavedSession; onResume: () => void; onDiscard: () => void }) {
  return (
    <Alert className="step-enter no-print">
      <HistoryIcon />
      <AlertTitle>Resume “{saved.name}”?</AlertTitle>
      <AlertDescription>
        <p>
          Saved in this browser {describeAge(saved.savedAt, Date.now())} · {SOURCE_LABEL[saved.source]}
          {saved.dirty ? ' · with your edits' : ''}
          {saved.reading !== undefined ? ` · ${saved.reading.walls.length} walls read` : ''}.
        </p>
        <div className="mt-1 flex gap-2">
          <Button variant="accent" size="sm" onClick={onResume}>
            Resume
          </Button>
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            Discard
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
