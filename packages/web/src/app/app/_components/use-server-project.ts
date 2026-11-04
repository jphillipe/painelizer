'use client';

import { useCallback, useEffect, useState, type Dispatch } from 'react';
import { toast } from 'sonner';
import type { Reading } from '@/lib/editor/project-file';
import { projectPath, type ServerProject } from '@/lib/editor/project-sync';
import type { SavedSession } from '@/lib/editor/persist';
import type { EditorAction, EditorState } from '@/lib/editor/state';
import { copyName } from '@/lib/projects';
import type { ExtractJob } from '@/types/extract';
import type { SaveConflictActions } from './editor/editor-top-bar';
import type { StepId } from './step-bar';
import { useProjectCreate, type CreateWhen } from './use-project-create';
import { useProjectSync } from './use-project-sync';
import { useSavedSession, type SavedSessionApi } from './use-saved-session';
import type { ProjectSyncApi } from './use-project-sync';

export interface ServerProjectApi {
  /** Identidade no servidor (S22.1): id, revisão a mandar na próxima gravação e quando gravou. */
  server: ServerProject | undefined;
  /**
   * Um projeto entrou no editor: com `existing`, ele já tem linha no banco (a URL vai para ela); sem, ganha uma
   * agora ou na primeira edição (`createWhen`, A6).
   */
  identify: (existing: ServerProject | undefined, createWhen: CreateWhen) => void;
  /** "Start over": descarta a criação em voo (A3) e a identidade. */
  forget: () => void;
  /** Sessão neste navegador (M2): banner "Resume", F5 no meio de uma leitura, edições que não chegaram ao servidor. */
  session: SavedSessionApi;
  /** Auto-save (S22.1): o chip da top bar e o "Retry". */
  sync: ProjectSyncApi;
  /** Conflito ou projeto apagado (S23, A4): "Save as new project" e "Overwrite". */
  saveActions: SaveConflictActions;
}

/**
 * O projeto no servidor (S30, saído do `new-project-view.tsx`): ganha id na primeira abertura (a URL troca sem
 * remontar a tela — os arquivos soltos no passo 01 continuam disponíveis para a planta de fundo), auto-save com
 * conflito, sessão no navegador como buffer de F5 e a URL acompanhando o passo (`/app/projects/<id>` no editor,
 * `/panels` no 03). Sem Supabase, segue só no navegador.
 */
export function useServerProject({
  initial,
  editor,
  dispatch,
  reading,
  job,
  step,
  onResume,
  onResumeJob,
}: {
  initial: ServerProject | undefined;
  editor: EditorState;
  dispatch: Dispatch<EditorAction>;
  reading: Reading | undefined;
  job: ExtractJob | undefined;
  step: StepId;
  onResume: (session: SavedSession) => void;
  onResumeJob: (job: ExtractJob) => void;
}): ServerProjectApi {
  const [server, setServer] = useState<ServerProject | undefined>(initial);
  // S23: o texto enviado é a baseline do auto-save (A2), "Start over" descarta a resposta em voo (A3), sample só
  // cria na primeira edição (A6) — ver `useProjectCreate`.
  const creation = useProjectCreate(editor, reading, (created, copy) => {
    setServer(created);
    window.history.replaceState(null, '', projectPath(created.id));
    if (copy !== undefined) toast.success(`Saved as “${copy}”.`);
  });
  const session = useSavedSession(editor, reading, job, onResume, {
    onResumeJob,
    project: server,
    generation: creation.generation,
  });
  const sync = useProjectSync(editor, reading, server, setServer);
  // Estáveis: `openProject` (e o `onResume` da sessão) dependem deles.
  const { opened, cancel } = creation;
  const identify = useCallback(
    (existing: ServerProject | undefined, createWhen: CreateWhen): void => {
      opened(existing === undefined ? createWhen : undefined);
      setServer(existing);
      if (existing !== undefined) window.history.replaceState(null, '', projectPath(existing.id));
    },
    [opened],
  );
  const forget = useCallback((): void => {
    cancel();
    setServer(undefined);
  }, [cancel]);

  useEffect(() => {
    if (server === undefined) return;
    const target = step === 3 ? projectPath(server.id, 3) : projectPath(server.id);
    if (step >= 2 && window.location.pathname !== target) window.history.replaceState(null, '', target);
  }, [step, server]);

  return {
    server,
    identify,
    forget,
    session,
    sync,
    saveActions: {
      saveAsCopy: () => {
        if (editor.draft === undefined) return;
        const name = copyName(editor.draft.name ?? reading?.projectName ?? 'Untitled project');
        dispatch({ type: 'updateProject', patch: { name } });
        creation.copy(name);
      },
      overwrite: sync.overwrite,
    },
  };
}
