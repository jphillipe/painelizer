'use client';

import { ArrowLeftIcon, HistoryIcon, OctagonXIcon, RotateCcwIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ParsedProjectFile, Reading } from '@/lib/editor/project-file';
import { describeAge, type SavedSession } from '@/lib/editor/persist';
import type { DraftSource } from '@/lib/editor/state';
import type { SupabaseEnv } from '@/lib/supabase/env';
import type { ExtractJob, ExtractOutcome } from '@/types/extract';
import type { Example } from '@/types/panels';
import { AdvancedImport } from './advanced-import';
import { OriginalText } from './editor/issue-text';
import { SampleCards } from './sample-cards';
import { UploadForm } from './upload-form';

/**
 * As telas da nova obra fora do editor (S30, saídas do `new-project-view.tsx`): o passo 01 (upload, samples,
 * Advanced), os avisos do topo (leitura pronta, sessão para retomar), o passo 02 sem projeto aberto e a moldura do
 * passo 03. Só apresentação: o estado continua no `NewProjectView`.
 */

/**
 * Passo 01. Fica montado em todo passo (escondido): arquivos e campos do upload sobrevivem a ir ao editor e voltar,
 * e à espera da leitura. Com `hidden` por classe, não por atributo (o `grid` venceria o atributo).
 */
export function UploadStep({
  visible,
  aiEnabled,
  devTools,
  storage,
  examples,
  busy,
  onOutcome,
  onJobChange,
  onFilesChange,
  onSample,
  onSampleOutcome,
  onProjectFile,
}: {
  visible: boolean;
  aiEnabled: boolean;
  devTools: boolean;
  storage: SupabaseEnv | undefined;
  examples: readonly Example[];
  busy: boolean;
  onOutcome: (o: ExtractOutcome) => void;
  onJobChange: (job: ExtractJob | undefined) => void;
  onFilesChange: (files: File[]) => void;
  onSample: (text: string) => void;
  onSampleOutcome: (o: ExtractOutcome) => void;
  onProjectFile: (file: ParsedProjectFile) => void;
}) {
  return (
    <section
      key="upload"
      className={visible ? 'step-enter no-print mx-auto w-full max-w-[1040px] space-y-5' : 'hidden'}
      aria-hidden={!visible}
    >
      <UploadForm
        aiEnabled={aiEnabled}
        onOutcome={onOutcome}
        onJobChange={onJobChange}
        onFilesChange={onFilesChange}
        storage={storage}
        onSample={devTools ? () => document.getElementById('sample')?.focus() : undefined}
      />
      <SampleCards examples={examples} disabled={busy} onPick={onSample} onOutcome={onSampleOutcome} />
      {devTools ? (
        <Card className="gap-3 p-5">
          <AdvancedImport onProjectFile={onProjectFile} onOutcome={onOutcome} />
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
}

/** O hero só no passo 01 (M3; refeito em 2026-10-23: rail de passos no topo, título em display, centrado). */
export function UploadHero() {
  return (
    <header className="no-print mx-auto max-w-2xl space-y-3 pb-4 text-center">
      <p className="eyebrow">New project</p>
      <h1 className="font-display text-5xl leading-[.98] tracking-[-1px] text-navy-900 sm:text-6xl">
        Drop the drawings.
        <br />
        Get the panels.
      </h1>
      <p className="mx-auto max-w-xl text-lg text-ink-2">
        The AI reads the set, you check every wall, and the engine frames each panel. Nothing is built before your
        review.
      </p>
    </header>
  );
}

/** Passo 01 com uma leitura já aberta: o caminho de volta ao editor. */
export function ReadReadyAlert({ reading, onReview }: { reading: Reading; onReview: () => void }) {
  return (
    <Alert className="no-print mx-auto max-w-[1040px]">
      <HistoryIcon />
      <AlertTitle>Walls read from your set</AlertTitle>
      <AlertDescription>
        <p>
          {reading.walls.length} walls · {reading.openingTypes.length} opening types · level {reading.level}. Nothing is
          built until you generate.
        </p>
        <div className="mt-1">
          <Button variant="accent" size="sm" onClick={onReview}>
            Review walls
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

const SOURCE_LABEL: Record<DraftSource, string> = {
  extraction: 'from an AI reading',
  sample: 'a sample project',
  file: 'from a project file',
};

/** Sessão gravada neste navegador (M2): oferece retomar antes de qualquer coisa. */
export function ResumeBanner({
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

/** Cabeçalho de um passo fora do editor: rótulo e os botões de volta / recomeçar. */
function StepHeader({
  label,
  back,
  onStartOver,
}: {
  label: string;
  back?: { label: string; onClick: () => void } | undefined;
  onStartOver: () => void;
}) {
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3">
      <p className="eyebrow">{label}</p>
      <div className="flex gap-2">
        {back !== undefined ? (
          <Button variant="ghost" size="sm" onClick={back.onClick}>
            <ArrowLeftIcon /> {back.label}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={onStartOver}>
          <RotateCcwIcon /> Start over
        </Button>
      </div>
    </div>
  );
}

/** Passo 02 sem projeto aberto (com draft, o passo 02 é o workspace): por que não abriu. */
export function ReviewUnavailable({
  loadError,
  outcome,
  onBack,
  onStartOver,
}: {
  loadError: string | undefined;
  outcome: ExtractOutcome | undefined;
  onBack: () => void;
  onStartOver: () => void;
}) {
  const failed = outcome !== undefined && !outcome.ok ? outcome : undefined;
  return (
    <section key="review" className="step-enter no-print space-y-4">
      <StepHeader
        label="02 · Review walls"
        back={{ label: 'Back to drawings', onClick: onBack }}
        onStartOver={onStartOver}
      />
      <Alert variant="destructive">
        <OctagonXIcon />
        <AlertTitle>{loadError !== undefined ? 'This project can’t be opened' : 'Nothing to review'}</AlertTitle>
        <AlertDescription>
          {loadError ?? failed?.message ?? 'Upload drawings or pick a sample first.'}
          {loadError === undefined && failed?.detail !== undefined ? <OriginalText text={failed.detail} /> : null}
        </AlertDescription>
      </Alert>
    </section>
  );
}

/** Passo 03: a moldura (voltar ao editor, recomeçar) em volta do resultado. */
export function PanelsStep({
  onBack,
  onStartOver,
  children,
}: {
  onBack: (() => void) | undefined;
  onStartOver: () => void;
  children: ReactNode;
}) {
  return (
    <section key="panels" className="step-enter space-y-4">
      <StepHeader
        label="03 · Panels"
        back={onBack === undefined ? undefined : { label: 'Back to review', onClick: onBack }}
        onStartOver={onStartOver}
      />
      {children}
    </section>
  );
}
