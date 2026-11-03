"use client";

import {
  ArrowLeftIcon,
  HistoryIcon,
  OctagonXIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useRouter, useSearchParams } from "next/navigation";
import { wantsNewProject } from "@/lib/site-nav";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWorkspaceLayout } from "@/components/shell-layout";
import { engineText } from "./editor/use-project-check";
import { describeAge, type SavedSession } from "@/lib/editor/persist";
import {
  parseProjectFile,
  projectFileText,
  type ParsedProjectFile,
  type Reading,
} from "@/lib/editor/project-file";
import { projectPath, type ServerProject } from "@/lib/editor/project-sync";
import { idIndex } from "@/lib/editor/problems";
import {
  editorReducer,
  initialEditorState,
  type DraftSource,
} from "@/lib/editor/state";
import { prefersReducedMotion } from "@/lib/motion";
import type { ExtractJob, ExtractOutcome } from "@/types/extract";
import type { Example, GenerateResult } from "@/types/panels";
import { cancelExtraction } from "../_actions/cancel-extraction";
import { createProjectAction } from "../_actions/create-project";
import { extractionResult } from "../_actions/extraction-result";
import { generatePanels } from "../_actions/generate-panels";
import { AdvancedImport } from "./advanced-import";
import { ConfirmDialog } from "./confirm-dialog";
import { useProjectCheck } from "./editor/use-project-check";
import { WallEditor } from "./editor/wall-editor";
import { ExtractProgress } from "./extract-progress";
import { ResultView } from "./result-view";
import { SampleCards } from './sample-cards';
import { doneSteps, StepBar, type StepId } from "./step-bar";
import { UploadForm } from "./upload-form";
import { useProjectSync } from "./use-project-sync";
import { useSavedSession } from "./use-saved-session";

export interface NewProjectViewProps {
  examples: readonly Example[];
  aiEnabled: boolean;
  /** 'Advanced' (M5): só em desenvolvimento ou com PANELIZER_DEV_TOOLS=1. Os exemplos aparecem sempre (2026-10-23). */
  devTools?: boolean;
  /** Projeto salvo no servidor (S22.1), carregado pela rota `/app/projects/[id]`: a tela abre no editor com ele. */
  project?: { id: string; name: string; revision: number; text: string; savedAt: string };
  /** Com `project`: 2 = editor, 3 = painéis (gera ao abrir). */
  initialStep?: 2 | 3;
}

const SOURCE_LABEL: Record<DraftSource, string> = {
  extraction: "from an AI reading",
  sample: "a sample project",
  file: "from a project file",
};

/**
 * Nova obra em três telas (docs/10-design.md §4): cada passo ocupa a tela sozinho; a barra de passos leva de
 * volta aos concluídos. O passo 02 é o editor (S21): o projeto vive no `editorReducer` (draft, seleção,
 * histórico) e a leitura da IA (`outcome`) fica como proveniência. Estado no cliente até a S22 — com auto-save
 * no navegador e banner de retomada (M2), para uma leitura de 10 minutos não morrer num F5.
 */
export function NewProjectView({
  examples,
  aiEnabled,
  devTools = false,
  project,
  initialStep,
}: NewProjectViewProps) {
  const [step, setStep] = useState<StepId>(project === undefined ? 1 : (initialStep ?? 2));
  // Identidade no servidor (S22.1): id, revisão a mandar na próxima gravação e quando gravou.
  const [server, setServer] = useState<ServerProject | undefined>(
    project === undefined ? undefined : { id: project.id, revision: project.revision, savedAt: project.savedAt },
  );
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
    onError: ({ error }) =>
      toast.error(
        error.serverError ??
          error.validationErrors?.projectText?._errors?.[0] ??
          "Could not generate panels.",
      ),
  });

  const { executeAsync: createOnServer } = useAction(createProjectAction);
  const openProject = useCallback(
    (
      text: string,
      source: DraftSource,
      reading: Reading | undefined,
      dirty = false,
      existing?: ServerProject,
    ) => {
      setOutcome(reading);
      dispatch({ type: "load", text, source, dirty });
      setResult(undefined);
      setStep(2);
      setServer(existing);
      if (existing !== undefined) {
        window.history.replaceState(null, "", projectPath(existing.id));
        return;
      }
      // S22.1: o projeto ganha id no servidor na primeira abertura; a URL troca sem remontar a tela (os arquivos
      // soltos no passo 01 continuam disponíveis para a planta de fundo). Sem Supabase, segue só no navegador.
      void createOnServer({ text, ...(reading?.projectName === undefined ? {} : { name: reading.projectName }) }).then((r) => {
        const data = r.data;
        if (data === undefined) {
          toast.error(r.serverError ?? "Could not save the project on the server.");
          return;
        }
        if (!data.ok) {
          if (data.reason !== "unconfigured") toast.error(data.message);
          return;
        }
        setServer({ id: data.id, revision: data.revision, savedAt: data.savedAt });
        window.history.replaceState(null, "", projectPath(data.id));
      });
    },
    [createOnServer],
  );
  const onOutcome = (o: ExtractOutcome) => {
    // Reconverter a leitura (project data) de um projeto já salvo mantém a identidade no servidor; uma leitura nova
    // (passo 01, sem projeto aberto) cria o projeto.
    if (o.ok) openProject(o.projectText, "extraction", o, false, server);
    else if (o.reason === "cancelled") {
      // M7: cancelar não é erro; o passo 01 volta com arquivos e campos intactos.
      setOutcome(undefined);
      toast(o.message);
    } else {
      setOutcome(o);
      toast.error(o.message);
    }
  };
  // M7: leitura em curso — cancelar e, para um job retomado depois de um F5, recolher o resultado do servidor.
  const { execute: cancelRead } = useAction(cancelExtraction);
  const { executeAsync: fetchResult } = useAction(extractionResult);
  const onResumedDone = useCallback(async () => {
    const current = job;
    if (current === undefined) return;
    const r = await fetchResult({ jobId: current.jobId });
    setJob(undefined);
    if (r.data === null || r.data === undefined)
      toast.warning(
        "The read finished, but its result was already collected or has expired.",
      );
    else onOutcome(r.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, fetchResult]);
  const onResumedEnded = useCallback(
    (
      status: "failed" | "cancelled" | "unknown",
      message: string | undefined,
    ) => {
      setJob(undefined);
      if (status === "unknown")
        toast.warning(
          "The server no longer knows this read (it may have restarted). Upload the set again.",
        );
      else if (status === "cancelled") toast(message ?? "Read cancelled.");
      else toast.error(message ?? "The read failed.");
    },
    [],
  );
  const openFile = (file: ParsedProjectFile) => {
    if (file.projectText.trim() === "") return;
    openProject(
      file.projectText,
      file.reading === undefined ? "file" : "extraction",
      file.reading,
    );
  };
  const openSample = (text: string) => {
    if (text.trim() !== "") openProject(text, "sample", undefined);
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
    dispatch({ type: "reset" });
    setServer(undefined);
    setStep(1);
    if (window.location.pathname !== "/app") window.history.replaceState(null, "", "/app");
  };
  // Há o que perder: edições, um resultado, ou uma leitura paga.
  const hasWork =
    editor.draft !== undefined &&
    (editor.dirty || result !== undefined || okOutcome !== undefined);
  const requestStartOver = () =>
    hasWork ? setConfirmingStartOver(true) : startOver();

  // "New project" no header leva a /app?new=1: já nesta tela, o Link não remonta nada, então é o parâmetro que
  // pede a volta ao passo 01 (com a confirmação de sempre quando há trabalho) e some da URL em seguida.
  const router = useRouter();
  const searchParams = useSearchParams();
  const wantsNew = wantsNewProject(searchParams);
  const requestStartOverRef = useRef(requestStartOver);
  requestStartOverRef.current = requestStartOver;
  useEffect(() => {
    if (!wantsNew) return;
    router.replace("/app");
    requestStartOverRef.current();
  }, [wantsNew, router]);

  const onResume = useCallback(
    (s: SavedSession) =>
      openProject(
        s.text,
        s.source,
        s.reading,
        s.dirty,
        s.project === undefined ? undefined : { id: s.project.id, revision: s.project.revision, savedAt: new Date(s.savedAt).toISOString() },
      ),
    [openProject],
  );
  const onResumeJob = useCallback((j: ExtractJob) => setJob(j), []);
  const session = useSavedSession(
    editor,
    okOutcome,
    job,
    onResume,
    onResumeJob,
    server,
  );
  const sync = useProjectSync(editor, okOutcome, server, setServer);

  // Projeto vindo da rota (S22.1): abre no editor; no passo 03 gera os painéis assim que o draft carrega.
  const loadedFromRoute = useRef(false);
  useEffect(() => {
    if (project === undefined || loadedFromRoute.current) return;
    loadedFromRoute.current = true;
    const file = parseProjectFile(project.text);
    openProject(file.projectText, file.reading === undefined ? "file" : "extraction", file.reading, false, {
      id: project.id,
      revision: project.revision,
      savedAt: project.savedAt,
    });
    if (initialStep === 3) setStep(3);
  }, [project, initialStep, openProject]);
  const autoGenerated = useRef(false);
  useEffect(() => {
    if (initialStep !== 3 || autoGenerated.current || editor.draft === undefined || step !== 3) return;
    autoGenerated.current = true;
    generatedFrom.current = editor.revision;
    generate.execute({ projectText: engineText(editor.draft) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStep, editor.draft, step]);

  // A URL acompanha o passo do projeto salvo: /app/projects/<id> no editor, /panels no passo 03.
  useEffect(() => {
    if (server === undefined) return;
    const target = step === 3 ? projectPath(server.id, 3) : projectPath(server.id);
    if (step >= 2 && window.location.pathname !== target) window.history.replaceState(null, "", target);
  }, [step, server]);

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [step, extracting]);

  const done = doneSteps(editor.draft !== undefined, result !== undefined);
  const resultStale =
    result !== undefined && resultRevision !== editor.revision;
  const canRegenerate =
    check.status === "done" &&
    !check.stale &&
    check.result?.ok === true &&
    !generate.isPending;
  const projectFile =
    editor.draft === undefined
      ? undefined
      : projectFileText(editor.draft, okOutcome);
  const ids = useMemo(
    () => (editor.draft === undefined ? undefined : idIndex(editor.draft)),
    [editor.draft],
  );

  const workspace = step === 2 && editor.draft !== undefined;
  useWorkspaceLayout(workspace);

  // O passo 1 fica montado em todo passo (escondido): arquivos e campos do upload sobrevivem a ir ao editor e
  // voltar, e à espera da leitura. Com `hidden` por classe, não por atributo (o `grid` venceria o atributo).
  const uploadVisible = step === 1 && !extracting;
  const upload = (
    <section
      key="upload"
      className={
        uploadVisible
          ? "step-enter no-print mx-auto w-full max-w-[1040px] space-y-5"
          : "hidden"
      }
      aria-hidden={!uploadVisible}
    >
      <UploadForm
        aiEnabled={aiEnabled}
        onOutcome={onOutcome}
        onJobChange={setJob}
        onFilesChange={setUploaded}
        onSample={
          devTools
            ? () => document.getElementById("sample")?.focus()
            : undefined
        }
      />
      <SampleCards examples={examples} disabled={generate.isPending || extracting} onPick={openSample} onOutcome={onOutcome} />
      {devTools ? (
        <Card className="gap-3 p-5">
          <AdvancedImport onProjectFile={openFile} onOutcome={onOutcome} />
        </Card>
      ) : null}
      <ul className="flex flex-wrap justify-center gap-x-8 gap-y-2 pt-2 text-[13px] text-ink-2">
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-1.5 rounded-pill bg-gold" />
          The read takes several minutes and can be cancelled
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-1.5 rounded-pill bg-gold" />
          Every wall shows its confidence and the dimension it came from
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-1.5 rounded-pill bg-gold" />
          Deterministic engine · IRC 2021 R602.7
        </li>
      </ul>
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
          save={sync.status}
          onRetrySave={sync.retry}
        />
      ) : (
        <div className="space-y-8">
          {step === 1 ? (
            // O hero só no passo 01 (M3; refeito em 2026-10-23: rail de passos no topo, título em display, centrado).
            <>
              <StepBar active={step} done={done} onGo={setStep} rail />
              <header className="no-print mx-auto max-w-2xl space-y-3 text-center pb-4">
                <p className="eyebrow">New project</p>
                <h1 className="font-display text-5xl leading-[.98] tracking-[-1px] text-navy-900 sm:text-6xl">
                  Drop the drawings.
                  <br />
                  Get the panels.
                </h1>
                <p className="mx-auto max-w-xl text-lg text-ink-2">
                  The AI reads the set, you check every wall, and the engine
                  frames each panel. Nothing is built before your review.
                </p>
              </header>
            </>
          ) : (
            <>
              <h1 className="sr-only">
                {step === 2 ? "Review walls" : "Panels"}
              </h1>
              <StepBar active={step} done={done} onGo={setStep} />
            </>
          )}

          {step === 1 &&
          okOutcome !== undefined &&
          editor.draft !== undefined &&
          !extracting ? (
            <Alert className="no-print mx-auto max-w-[1040px]">
              <HistoryIcon />
              <AlertTitle>Walls read from your set</AlertTitle>
              <AlertDescription>
                <p>
                  {okOutcome.walls.length} walls ·{" "}
                  {okOutcome.openingTypes.length} opening types · level{" "}
                  {okOutcome.level}. Nothing is built until you generate.
                </p>
                <div className="mt-1">
                  <Button variant="accent" size="sm" onClick={() => setStep(2)}>
                    Review walls
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          {step === 1 &&
          !extracting &&
          editor.draft === undefined &&
          session.saved !== undefined ? (
            <ResumeBanner
              saved={session.saved}
              onResume={session.resume}
              onDiscard={session.discard}
            />
          ) : null}

          {step === 1 && job ? (
            <ExtractProgress
              job={job}
              onCancel={() => cancelRead({ jobId: job.jobId })}
              onResumedDone={onResumedDone}
              onResumedEnded={onResumedEnded}
            />
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={requestStartOver}
                  >
                    <RotateCcwIcon /> Start over
                  </Button>
                </div>
              </div>
              <Alert variant="destructive">
                <OctagonXIcon />
                <AlertTitle>
                  {editor.loadError !== undefined
                    ? "This project can’t be opened"
                    : "Nothing to review"}
                </AlertTitle>
                <AlertDescription>
                  {editor.loadError ??
                    (outcome && !outcome.ok
                      ? outcome.message
                      : "Upload drawings or pick a sample first.")}
                </AlertDescription>
              </Alert>
            </section>
          ) : null}

          {step === 3 ? (
            <section key="panels" className="step-enter space-y-4">
              <div className="no-print flex flex-wrap items-center justify-between gap-3">
                <p className="eyebrow">03 · Panels</p>
                <div className="flex gap-2">
                  {editor.draft !== undefined ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep(2)}
                    >
                      <ArrowLeftIcon /> Back to review
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={requestStartOver}
                  >
                    <RotateCcwIcon /> Start over
                  </Button>
                </div>
              </div>
              <ResultView
                result={result}
                pending={generate.isPending}
                projectFile={projectFile}
                stale={resultStale}
                canRegenerate={canRegenerate}
                onRegenerate={runProject}
                ids={ids}
              />
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
            ? "This closes the project and its AI reading. A read takes several minutes and costs money; save the project file from the menu first if you may want it back."
            : "This closes the project and discards your edits and the generated panels."
        }
        confirmLabel="Start over"
        destructive
        onConfirm={startOver}
      />
    </>
  );
}

/** Sessão gravada neste navegador (M2): oferece retomar antes de qualquer coisa. */
function ResumeBanner({
  saved,
  onResume,
  onDiscard,
}: {
  saved: SavedSession;
  onResume: () => void;
  onDiscard: () => void;
}) {
  return (
    <Alert className="step-enter no-print">
      <HistoryIcon />
      <AlertTitle>Resume “{saved.name}”?</AlertTitle>
      <AlertDescription>
        <p>
          Saved in this browser {describeAge(saved.savedAt, Date.now())} ·{" "}
          {SOURCE_LABEL[saved.source]}
          {saved.dirty ? " · with your edits" : ""}
          {saved.reading !== undefined
            ? ` · ${saved.reading.walls.length} walls read`
            : ""}
          .
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
