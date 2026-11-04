'use client';

import { useAction } from 'next-safe-action/hooks';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useWorkspaceLayout } from '@/components/shell-layout';
import { draftFromText } from '@/lib/editor/draft';
import type { SavedSession } from '@/lib/editor/persist';
import { idIndex } from '@/lib/editor/problems';
import { parseProjectFile, projectFileText, type ParsedProjectFile, type Reading } from '@/lib/editor/project-file';
import type { ServerProject } from '@/lib/editor/project-sync';
import { editorReducer, initialEditorState, type DraftSource } from '@/lib/editor/state';
import { prefersReducedMotion } from '@/lib/motion';
import { wantsNewProject } from '@/lib/site-nav';
import type { SupabaseEnv } from '@/lib/supabase/env';
import type { ExtractOutcome } from '@/types/extract';
import type { Example, GenerateResult } from '@/types/panels';
import { generatePanels } from '../_actions/generate-panels';
import { ConfirmDialog } from './confirm-dialog';
import { ProjectIOContext, type ProjectIO } from './editor/editor-context';
import { engineText, useProjectCheck } from './editor/use-project-check';
import { WallEditor } from './editor/wall-editor';
import { ExtractProgress } from './extract-progress';
import { PanelsStep, ReadReadyAlert, ResumeBanner, ReviewUnavailable, UploadHero, UploadStep } from './new-project-steps';
import { ResultView } from './result-view';
import { doneSteps, StepBar, type StepId } from './step-bar';
import type { CreateWhen } from './use-project-create';
import { useExtractionJob } from './use-extraction-job';
import { useServerProject } from './use-server-project';

export interface NewProjectViewProps {
  examples: readonly Example[];
  aiEnabled: boolean;
  /** 'Advanced' (M5): só em desenvolvimento ou com PANELIZER_DEV_TOOLS=1. Os exemplos aparecem sempre (2026-10-23). */
  devTools?: boolean;
  /** Projeto salvo no servidor (S22.1), carregado pela rota `/app/projects/[id]`: a tela abre no editor com ele. */
  project?: { id: string; name: string; revision: number; text: string; savedAt: string };
  /** Com `project`: 2 = editor, 3 = painéis (gera ao abrir). */
  initialStep?: 2 | 3;
  /** URL e chave publicável do Supabase (S22.3), lidas no servidor a cada request: desenhos sobem e descem direto do Storage. */
  storage?: SupabaseEnv | undefined;
}

/**
 * Nova obra em três telas (docs/10-design.md §4): cada passo ocupa a tela sozinho; a barra de passos leva de
 * volta aos concluídos. O passo 02 é o editor (S21): o projeto vive no `editorReducer` (draft, seleção,
 * histórico) e a leitura da IA (`outcome`) fica como proveniência. Com Supabase o projeto vive no servidor
 * (`useServerProject`: id, auto-save, sessão no navegador como buffer de F5 com banner de retomada); a leitura em
 * curso em `useExtractionJob`; as telas fora do editor em `new-project-steps.tsx` (S30).
 */
export function NewProjectView({ examples, aiEnabled, devTools = false, project, initialStep, storage }: NewProjectViewProps) {
  const [step, setStep] = useState<StepId>(project === undefined ? 1 : (initialStep ?? 2));
  const [outcome, setOutcome] = useState<ExtractOutcome | undefined>(undefined);
  // Arquivos do passo 01 (M6): a planta por baixo das paredes escolhe entre eles.
  const [uploaded, setUploaded] = useState<File[]>([]);
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

  // A leitura recolhida de um job retomado e a sessão retomada chamam funções definidas mais abaixo (que dependem
  // da identidade no servidor): passam por refs, com a versão do render mais recente.
  const outcomeRef = useRef<(o: ExtractOutcome) => void>(() => {});
  const openRef = useRef<OpenProject | undefined>(undefined);
  const extraction = useExtractionJob((o) => outcomeRef.current(o));
  const onResume = useCallback(
    (s: SavedSession) =>
      openRef.current?.(s.text, s.source, s.reading, s.dirty, s.project === undefined ? undefined : { id: s.project.id, revision: s.project.revision, savedAt: new Date(s.savedAt).toISOString() }),
    [],
  );
  const remote = useServerProject({
    initial: project === undefined ? undefined : { id: project.id, revision: project.revision, savedAt: project.savedAt },
    editor,
    dispatch,
    reading: okOutcome,
    job: extraction.job,
    step,
    onResume,
    onResumeJob: extraction.setJob,
  });
  const { identify, forget, session, sync, saveActions } = remote;

  const openProject = useCallback<OpenProject>(
    (text, source, reading, dirty = false, existing, createWhen = source === 'sample' ? 'on-edit' : 'now') => {
      identify(existing, createWhen);
      setOutcome(reading);
      dispatch({ type: 'load', text, source, dirty });
      setResult(undefined);
      setStep(2);
    },
    [identify],
  );
  openRef.current = openProject;
  const onOutcome = (o: ExtractOutcome): void => {
    // Reconverter a leitura (project data) de um projeto já salvo mantém a identidade no servidor; uma leitura nova
    // (passo 01, sem projeto aberto) cria o projeto.
    if (o.ok) openProject(o.projectText, 'extraction', o, false, remote.server);
    else if (o.reason === 'cancelled') {
      // M7: cancelar não é erro; o passo 01 volta com arquivos e campos intactos.
      setOutcome(undefined);
      toast(o.message);
    } else {
      setOutcome(o);
      toast.error(o.message);
    }
  };
  outcomeRef.current = onOutcome;
  const openFile = (file: ParsedProjectFile): void => {
    if (file.projectText.trim() !== '') openProject(file.projectText, file.reading === undefined ? 'file' : 'extraction', file.reading);
  };
  // Leitura gravada de exemplo (S23, A6): projeto novo — mesmo com outro aberto — que só vai ao banco na primeira edição.
  const onSampleOutcome = (o: ExtractOutcome): void => {
    if (o.ok) openProject(o.projectText, 'extraction', o, false, undefined, 'on-edit');
    else onOutcome(o);
  };
  const openSample = (text: string): void => {
    if (text.trim() !== '') openProject(text, 'sample', undefined);
  };
  const runProject = (): void => {
    if (editor.draft === undefined) return;
    generatedFrom.current = editor.revision;
    generate.execute({ projectText: engineText(editor.draft) });
  };
  const startOver = (): void => {
    forget();
    setConfirmingStartOver(false);
    setOutcome(undefined);
    setResult(undefined);
    dispatch({ type: 'reset' });
    setStep(1);
    if (window.location.pathname !== '/app') window.history.replaceState(null, '', '/app');
  };
  // Há o que perder: edições, um resultado, ou uma leitura paga.
  const hasWork = editor.draft !== undefined && (editor.dirty || result !== undefined || okOutcome !== undefined);
  const requestStartOver = (): void => (hasWork ? setConfirmingStartOver(true) : startOver());

  // "New project" no header leva a /app?new=1: já nesta tela, o Link não remonta nada, então é o parâmetro que
  // pede a volta ao passo 01 (com a confirmação de sempre quando há trabalho) e some da URL em seguida.
  const router = useRouter();
  const wantsNew = wantsNewProject(useSearchParams());
  const requestStartOverRef = useRef(requestStartOver);
  requestStartOverRef.current = requestStartOver;
  useEffect(() => {
    if (!wantsNew) return;
    router.replace('/app');
    requestStartOverRef.current();
  }, [wantsNew, router]);

  // Projeto vindo da rota (S22.1): abre no editor; no passo 03 gera os painéis assim que o draft carrega.
  const loadedFromRoute = useRef(false);
  useEffect(() => {
    if (project === undefined || loadedFromRoute.current) return;
    loadedFromRoute.current = true;
    const file = parseProjectFile(project.text);
    const identity: ServerProject = { id: project.id, revision: project.revision, savedAt: project.savedAt };
    // S23: edições deste navegador que não chegaram ao servidor (F5 no meio do debounce, rede, editor quebrado)
    // sobre a mesma revisão voltam no lugar da versão do servidor; a baseline do auto-save é o texto do servidor, e
    // as edições sobem logo em seguida.
    const local = session.unsaved(project.id, project.revision, file.projectText);
    const onServer = local === undefined ? undefined : draftFromText(file.projectText);
    const source = file.reading === undefined ? 'file' : 'extraction';
    if (local !== undefined && onServer?.ok === true) {
      openProject(local.text, source, file.reading, true, { ...identity, text: projectFileText(onServer.draft, file.reading) });
      toast('Restored your changes from this browser that hadn’t reached the server yet. Saving them now.');
    } else {
      openProject(file.projectText, source, file.reading, false, identity);
    }
    if (initialStep === 3) setStep(3);
    // Uma vez por montagem (`loadedFromRoute`): `session` muda depois sem pedir nova carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, initialStep, openProject]);
  const autoGenerated = useRef(false);
  useEffect(() => {
    if (initialStep !== 3 || autoGenerated.current || editor.draft === undefined || step !== 3) return;
    autoGenerated.current = true;
    generatedFrom.current = editor.revision;
    generate.execute({ projectText: engineText(editor.draft) });
    // Uma vez (`autoGenerated`), quando o draft da rota chega ao passo 03; `generate` e `revision` não disparam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStep, editor.draft, step]);

  const { extracting } = extraction;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [step, extracting]);

  const done = doneSteps(editor.draft !== undefined, result !== undefined);
  const ids = useMemo(() => (editor.draft === undefined ? undefined : idIndex(editor.draft)), [editor.draft]);
  const workspace = step === 2 && editor.draft !== undefined;
  useWorkspaceLayout(workspace);

  const io: ProjectIO = {
    outcome: okOutcome,
    onOutcome,
    pending: generate.isPending,
    onGenerate: runProject,
    steps: <StepBar active={step} done={done} onGo={setStep} compact />,
    onStartOver: requestStartOver,
    sourceFiles: uploaded,
    storedDrawings: okOutcome?.drawings ?? [],
    storage,
    save: sync.status,
    onRetrySave: sync.retry,
    saveActions,
  };

  return (
    <>
      {workspace ? (
        <ProjectIOContext value={io}>
          <WallEditor state={editor} dispatch={dispatch} check={check} />
        </ProjectIOContext>
      ) : (
        <div className="space-y-8">
          {step === 1 ? (
            <>
              <StepBar active={step} done={done} onGo={setStep} rail />
              <UploadHero />
            </>
          ) : (
            <>
              <h1 className="sr-only">{step === 2 ? 'Review walls' : 'Panels'}</h1>
              <StepBar active={step} done={done} onGo={setStep} />
            </>
          )}
          {step === 1 && okOutcome !== undefined && editor.draft !== undefined && !extracting ? <ReadReadyAlert reading={okOutcome} onReview={() => setStep(2)} /> : null}
          {step === 1 && !extracting && editor.draft === undefined && session.saved !== undefined ? <ResumeBanner saved={session.saved} onResume={session.resume} onDiscard={session.discard} /> : null}
          {step === 1 && extraction.job !== undefined ? <ExtractProgress job={extraction.job} onCancel={extraction.cancel} onResumedDone={extraction.onResumedDone} onResumedEnded={extraction.onResumedEnded} /> : null}
          {step === 2 ? <ReviewUnavailable loadError={editor.loadError} outcome={outcome} onBack={() => setStep(1)} onStartOver={requestStartOver} /> : null}
          {step === 3 ? (
            <PanelsStep onBack={editor.draft !== undefined ? () => setStep(2) : undefined} onStartOver={requestStartOver}>
              <ResultView
                result={result}
                pending={generate.isPending}
                projectFile={editor.draft === undefined ? undefined : projectFileText(editor.draft, okOutcome)}
                stale={result !== undefined && resultRevision !== editor.revision}
                canRegenerate={check.status === 'done' && !check.stale && check.result?.ok === true && !generate.isPending}
                onRegenerate={runProject}
                ids={ids}
              />
            </PanelsStep>
          ) : null}
        </div>
      )}

      <UploadStep
        visible={step === 1 && !extracting}
        aiEnabled={aiEnabled}
        devTools={devTools}
        storage={storage}
        examples={examples}
        busy={generate.isPending || extracting}
        onOutcome={onOutcome}
        onJobChange={extraction.setJob}
        onFilesChange={setUploaded}
        onSample={openSample}
        onSampleOutcome={onSampleOutcome}
        onProjectFile={openFile}
      />

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

/** Abre um texto de projeto no editor (amostra, arquivo, leitura, sessão retomada ou projeto da rota). */
type OpenProject = (
  text: string,
  source: DraftSource,
  reading: Reading | undefined,
  dirty?: boolean,
  existing?: ServerProject,
  /** Sample (A6): só ganha linha no banco na primeira edição. */
  createWhen?: CreateWhen,
) => void;
