'use client';

import { useAction } from 'next-safe-action/hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { projectFileText, type Reading } from '@/lib/editor/project-file';
import type { ServerProject } from '@/lib/editor/project-sync';
import type { EditorState } from '@/lib/editor/state';
import { createProjectAction } from '../_actions/create-project';

/** Quando a criação sai: já, ou na primeira edição (sample, A6). */
export type CreateWhen = 'now' | 'on-edit';

interface CreateRequest {
  generation: number;
  when: CreateWhen;
  /** Só na cópia ("Save as new project"): o nome do projeto novo. */
  name?: string;
}

export interface ProjectCreateApi {
  /** Muda a cada projeto aberto ou "Start over" (a sessão do navegador usa para trocar de chave). */
  generation: number;
  /** Projeto aberto: nova geração e, se ainda não tem id, o pedido de criação (`undefined` = já tem id). */
  opened: (when: CreateWhen | undefined) => void;
  /** "Start over": nova geração, sem pedido; uma criação em voo é ignorada quando responder (A3). */
  cancel: () => void;
  /** Conflito ou projeto apagado (A4): cria um projeto novo com o que está no editor, já. */
  copy: (name: string) => void;
}

/**
 * Criação do projeto no servidor (S22.1, refeita na S23). O texto enviado sai do draft carregado (com a leitura,
 * `.panelizer.json` inteiro), não do texto de entrada, e volta em `ServerProject.text` para ser a baseline do
 * auto-save: uma edição feita enquanto a criação estava em voo sobe logo depois (A2). A resposta só vale para a
 * geração que a pediu: "Start over" ou outro projeto aberto no meio a descartam (A3). Sample só cria na primeira
 * edição (A6): abrir e fechar um exemplo não deixa linha no banco. Sem Supabase (`unconfigured`), nada acontece.
 */
export function useProjectCreate(editor: EditorState, reading: Reading | undefined, onCreated: (project: ServerProject, copyName: string | undefined) => void): ProjectCreateApi {
  const { executeAsync } = useAction(createProjectAction);
  const generationRef = useRef(0);
  const [generation, setGeneration] = useState(0);
  const [request, setRequest] = useState<CreateRequest | undefined>(undefined);
  const inFlight = useRef<CreateRequest | undefined>(undefined);
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;

  const next = useCallback((): number => {
    generationRef.current += 1;
    setGeneration(generationRef.current);
    return generationRef.current;
  }, []);
  const opened = useCallback(
    (when: CreateWhen | undefined) => {
      const g = next();
      setRequest(when === undefined ? undefined : { generation: g, when });
    },
    [next],
  );
  const cancel = useCallback(() => {
    next();
    setRequest(undefined);
  }, [next]);
  const copy = useCallback((name: string) => setRequest({ generation: generationRef.current, when: 'now', name }), []);

  useEffect(() => {
    const r = request;
    if (r === undefined || editor.draft === undefined || inFlight.current === r) return;
    if (r.when === 'on-edit' && !editor.dirty) return;
    inFlight.current = r;
    const text = projectFileText(editor.draft, reading);
    const name = r.name ?? reading?.projectName;
    void executeAsync({ text, ...(name === undefined ? {} : { name }) }).then((res) => {
      if (inFlight.current === r) inFlight.current = undefined;
      // A3: o humano recomeçou (ou abriu outro projeto) enquanto a criação estava em voo.
      if (generationRef.current !== r.generation) return;
      setRequest((current) => (current === r ? undefined : current));
      const data = res.data;
      if (data === undefined) {
        toast.error(res.serverError ?? 'Could not save the project on the server.');
        return;
      }
      if (!data.ok) {
        if (data.reason !== 'unconfigured') toast.error(data.message);
        return;
      }
      onCreatedRef.current({ id: data.id, revision: data.revision, savedAt: data.savedAt, text }, r.name);
    });
  }, [request, editor.draft, editor.dirty, reading, executeAsync]);

  return { generation, opened, cancel, copy };
}
