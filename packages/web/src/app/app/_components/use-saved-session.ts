'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { clearJob, clearSession, describeAge, latestSession, loadJob, saveJob, saveSession, SESSION_KEY, sessionFromState, sessionKey, unsavedEdits, type SavedSession, type StorageLike } from '@/lib/editor/persist';
import type { Reading } from '@/lib/editor/project-file';
import type { EditorState } from '@/lib/editor/state';
import type { ExtractJob } from '@/types/extract';

export const SAVE_DELAY_MS = 500;

/** `localStorage` pode lançar (storage bloqueado, janela privada em alguns browsers): aí a sessão vive só em memória. */
const memory = new Map<string, string>();
const fallback: StorageLike = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
  get length() {
    return memory.size;
  },
  key: (i) => [...memory.keys()][i] ?? null,
};
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
  /** Edições deste navegador sobre a revisão que o servidor devolveu e que ele ainda não tem (S23); ver `unsavedEdits`. */
  unsaved: (id: string, revision: number, serverProjectText: string) => SavedSession | undefined;
  discard: () => void;
}

export interface SavedSessionOptions {
  /** M7: leitura em voo antes do F5 — a tela de espera volta e recolhe o resultado pelo `jobId`. */
  onResumeJob?: (job: ExtractJob) => void;
  /** Projeto salvo no servidor (S22.1): a sessão local lembra o id e a revisão e grava na chave dele (S23). */
  project?: { id: string; revision: number } | undefined;
  /**
   * Muda a cada projeto aberto ou "Start over" (S23). Mesmo valor quando o projeto ganha id no servidor: aí a
   * sessão muda da chave "só no navegador" para a do id, e a antiga é apagada (senão o banner a ofereceria depois).
   */
  generation?: number;
}

/**
 * Auto-save do editor em `localStorage` (M2): cada mudança do draft grava a sessão 500 ms depois (e no
 * `beforeunload` ou ao desmontar, sem esperar); "Start over" apaga. Uma sessão por projeto (S23): abrir um projeto
 * não apaga a de outro; o banner de `/app` oferece a mais recente, depois da limpeza por idade. Um job de extração
 * em voo também fica gravado, com o `jobId`: se a página recarregar no meio, a espera volta (M7, S23) e o resultado
 * é recolhido do servidor; um job sem id (gravado antes da S23) vira aviso de leitura perdida.
 */
export function useSavedSession(editor: EditorState, reading: Reading | undefined, job: ExtractJob | undefined, onResume: (session: SavedSession) => void, options: SavedSessionOptions = {}): SavedSessionApi {
  const { onResumeJob, project, generation = 0 } = options;
  const [saved, setSaved] = useState<SavedSession | undefined>(undefined);
  const pending = useRef<SavedSession | undefined>(undefined);
  /** Onde a última sessão foi gravada, e em que geração (para a troca de chave quando o projeto ganha id). */
  const written = useRef<{ key: string; generation: number } | undefined>(undefined);
  /** Chave do projeto aberto: "Start over" apaga esta (e só esta). */
  const owner = useRef<{ key: string; generation: number } | undefined>(undefined);
  const jobRef = useRef(job);
  jobRef.current = job;
  /** Geração do render que disparou o efeito do draft; mudar só a geração não é uma edição a gravar. */
  const generationRef = useRef(generation);
  generationRef.current = generation;

  const flush = useCallback((): void => {
    const session = pending.current;
    if (session === undefined) return;
    pending.current = undefined;
    const store = storage();
    const key = sessionKey(session.project?.id);
    const before = written.current;
    saveSession(store, session);
    // Projeto que acabou de ganhar id no servidor: a sessão "só no navegador" dele vira lixo.
    if (before !== undefined && before.key === SESSION_KEY && key !== SESSION_KEY && before.generation === generation) clearSession(store, SESSION_KEY);
    written.current = { key, generation };
  }, [generation]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Ao montar: sessão mais recente (com limpeza por idade) e job interrompido.
  useEffect(() => {
    const store = storage();
    const session = latestSession(store, Date.now());
    if (session !== undefined) setSaved(session);
    const interrupted = loadJob(store, Date.now());
    if (interrupted === undefined) return;
    if (interrupted.jobId !== undefined && onResumeJob !== undefined) {
      // M7: a leitura continua no servidor; a tela de espera volta e recolhe o resultado pelo job.
      onResumeJob({ jobId: interrupted.jobId, startedAt: interrupted.startedAt, files: interrupted.files, resumed: true });
      return;
    }
    clearJob(store);
    toast.warning(`The AI read started ${describeAge(interrupted.startedAt, Date.now())} was interrupted when this page reloaded.`, {
      description: 'Its result can’t be recovered. Upload the set again to read it.',
      duration: 12_000,
    });
    // Só na montagem: lê o que o F5 deixou; `onResumeJob` muda a cada render e não deve repetir a retomada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draft → sessão (com debounce). Reset apaga a sessão do projeto que estava aberto; carga que falhou não mexe.
  useEffect(() => {
    if (editor.draft === undefined) {
      if (editor.revision > 0 && editor.loadError === undefined) {
        pending.current = undefined;
        // A chave do projeto e, se ele ganhou id antes da próxima gravação, a de "só no navegador" de onde veio.
        const mine = owner.current !== undefined && written.current?.generation === owner.current.generation ? written.current.key : undefined;
        for (const key of new Set([owner.current?.key, mine])) if (key !== undefined) clearSession(storage(), key);
        owner.current = undefined;
        written.current = undefined;
        setSaved(undefined);
      }
      return;
    }
    owner.current = { key: sessionKey(project?.id), generation: generationRef.current };
    setSaved(undefined);
    pending.current = sessionFromState(editor, reading, Date.now(), project);
    const timer = window.setTimeout(() => flushRef.current(), SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [editor, reading, project]);

  // Job em voo.
  useEffect(() => {
    if (job !== undefined) saveJob(storage(), job);
    else clearJob(storage());
  }, [job]);

  // Sair da página: grava o que estava esperando o debounce; durante uma leitura, pede confirmação. Desmontar (o
  // editor quebrou e o error boundary entrou, S23) também grava — "your work is saved" tem de ser verdade.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      flushRef.current();
      if (jobRef.current !== undefined) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flushRef.current();
    };
  }, []);

  const resume = useCallback(() => {
    if (saved === undefined) return;
    onResume(saved);
    setSaved(undefined);
  }, [saved, onResume]);
  const discard = useCallback(() => {
    if (saved !== undefined) clearSession(storage(), sessionKey(saved.project?.id));
    setSaved(undefined);
  }, [saved]);

  const unsaved = useCallback((id: string, revision: number, serverProjectText: string) => unsavedEdits(storage(), id, revision, serverProjectText), []);

  return { saved, resume, discard, unsaved };
}
