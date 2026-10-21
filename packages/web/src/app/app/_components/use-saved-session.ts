'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { clearJob, clearSession, describeAge, loadJob, loadSession, saveJob, saveSession, sessionFromState, type SavedSession, type StorageLike } from '@/lib/editor/persist';
import type { Reading } from '@/lib/editor/project-file';
import type { EditorState } from '@/lib/editor/state';
import type { ExtractJob } from '@/types/extract';

export const SAVE_DELAY_MS = 500;

/** `localStorage` pode lançar (storage bloqueado, janela privada em alguns browsers): aí a sessão vive só em memória. */
const memory = new Map<string, string>();
const fallback: StorageLike = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) };
function storage(): StorageLike {
  try {
    return window.localStorage;
  } catch {
    return fallback;
  }
}

export interface SavedSessionApi {
  /** Sessão gravada neste navegador, enquanto nenhum projeto está aberto: alimenta o banner "Resume". */
  saved: SavedSession | undefined;
  resume: () => void;
  discard: () => void;
}

/**
 * Auto-save do editor em `localStorage` (M2): cada mudança do draft grava a sessão 500 ms depois (e no
 * `beforeunload`, sem esperar); "Start over" apaga. Ao abrir `/app` sem projeto, a sessão gravada vira o banner
 * de retomada. Um job de extração em voo também fica gravado: se a página recarregar no meio, o humano fica
 * sabendo que a leitura se perdeu (a server action não tem como entregar o resultado a uma página nova).
 */
export function useSavedSession(editor: EditorState, reading: Reading | undefined, job: ExtractJob | undefined, onResume: (session: SavedSession) => void, onResumeJob?: (job: ExtractJob) => void): SavedSessionApi {
  const [saved, setSaved] = useState<SavedSession | undefined>(undefined);
  const pending = useRef<SavedSession | undefined>(undefined);
  const jobRef = useRef(job);
  jobRef.current = job;

  // Ao montar: sessão gravada e job interrompido.
  useEffect(() => {
    const store = storage();
    const session = loadSession(store);
    if (session !== undefined) setSaved(session);
    const interrupted = loadJob(store, Date.now());
    if (interrupted !== undefined && onResumeJob !== undefined && typeof (interrupted as { jobId?: unknown }).jobId === 'string') {
      // M7: a leitura continua no servidor; a tela de espera volta e recolhe o resultado pelo job.
      onResumeJob({ ...(interrupted as ExtractJob), resumed: true });
    } else if (interrupted !== undefined) {
      clearJob(store);
      toast.warning(`The AI read started ${describeAge(interrupted.startedAt, Date.now())} was interrupted when this page reloaded.`, {
        description: 'Its result can’t be recovered. Upload the set again to read it.',
        duration: 12_000,
      });
    }
  }, []);

  // Draft → sessão (com debounce). Reset apaga; carga que falhou não mexe no que estava gravado.
  useEffect(() => {
    const store = storage();
    if (editor.draft === undefined) {
      if (editor.revision > 0 && editor.loadError === undefined) {
        clearSession(store);
        setSaved(undefined);
      }
      return;
    }
    setSaved(undefined);
    const session = sessionFromState(editor, reading, Date.now());
    pending.current = session;
    const timer = window.setTimeout(() => {
      if (pending.current !== undefined) saveSession(store, pending.current);
      pending.current = undefined;
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [editor, reading]);

  // Job em voo.
  useEffect(() => {
    if (job !== undefined) saveJob(storage(), job);
    else clearJob(storage());
  }, [job]);

  // Sair da página: grava o que estava esperando o debounce; durante uma leitura, pede confirmação.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (pending.current !== undefined) {
        saveSession(storage(), pending.current);
        pending.current = undefined;
      }
      if (jobRef.current !== undefined) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const resume = useCallback(() => {
    if (saved === undefined) return;
    onResume(saved);
    setSaved(undefined);
  }, [saved, onResume]);
  const discard = useCallback(() => {
    clearSession(storage());
    setSaved(undefined);
  }, []);

  return { saved, resume, discard };
}
