'use client';

import { useAction } from 'next-safe-action/hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { canSave, statusAfterSave, type SaveStatus, type ServerProject } from '@/lib/editor/project-sync';
import { projectFileText, type Reading } from '@/lib/editor/project-file';
import type { EditorState } from '@/lib/editor/state';
import { saveProjectAction } from '../_actions/save-project';

export const SYNC_DELAY_MS = 500;

export interface ProjectSyncApi {
  status: SaveStatus;
  /** Tenta gravar de novo depois de um erro (botão do chip). */
  retry: () => void;
}

/**
 * Auto-save no servidor (S22.1): quando o `.panelizer.json` do editor difere do último texto gravado (ou carregado),
 * grava 500 ms depois com a revisão carregada; a resposta traz a próxima. A baseline é o TEXTO, não a revisão do
 * editor: carregar um projeto (rota, retomada, criação) não grava nada, reconverter a leitura grava, e uma edição
 * desfeita de volta ao texto gravado também não grava. Uma gravação por vez: edição durante a gravação sai em
 * seguida. Conflito (outra pessoa gravou antes) ou projeto apagado param o auto-save; a sessão do navegador
 * (`use-saved-session`) continua guardando as edições como buffer de queda.
 */
export function useProjectSync(editor: EditorState, reading: Reading | undefined, project: ServerProject | undefined, onProject: (p: ServerProject) => void): ProjectSyncApi {
  const [status, setStatus] = useState<SaveStatus>(project === undefined ? { kind: 'local' } : { kind: 'saved', at: Date.parse(project.savedAt) || Date.now() });
  const { executeAsync } = useAction(saveProjectAction);
  /** Texto que o servidor tem (gravado por nós ou carregado); `undefined` até o primeiro draft com projeto. */
  const savedText = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const latest = useRef({ editor, reading, project, onProject });
  latest.current = { editor, reading, project, onProject };

  const currentText = (): string | undefined => {
    const { editor: ed, reading: rd } = latest.current;
    return ed.draft === undefined ? undefined : projectFileText(ed.draft, rd);
  };

  // Projeto novo (criado agora ou carregado pela URL): o que está no editor é o que o servidor tem.
  const projectId = project?.id;
  useEffect(() => {
    savedText.current = projectId === undefined ? undefined : currentText();
    setStatus(projectId === undefined ? { kind: 'local' } : { kind: 'saved', at: Date.parse(latest.current.project?.savedAt ?? '') || Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const save = useCallback(async () => {
    const { editor: ed, reading: rd, project: pr } = latest.current;
    if (pr === undefined || ed.draft === undefined || inFlight.current) return;
    const text = projectFileText(ed.draft, rd);
    inFlight.current = true;
    setStatus({ kind: 'saving' });
    const name = ed.draft.name ?? rd?.projectName;
    const result = await executeAsync({ id: pr.id, revision: pr.revision, ...(name === undefined ? {} : { name }), text });
    inFlight.current = false;
    const next = statusAfterSave(result.data, result.serverError, Date.now());
    if (result.data?.ok === true) {
      savedText.current = text;
      latest.current.onProject({ id: pr.id, revision: result.data.revision, savedAt: result.data.savedAt });
    }
    setStatus(next);
    // Editou enquanto gravava: grava de novo com a revisão nova que acabou de chegar.
    if (next.kind === 'saved' && currentText() !== text) window.setTimeout(() => void save(), 0);
  }, [executeAsync]);

  useEffect(() => {
    if (project === undefined || editor.draft === undefined) return;
    const text = currentText();
    if (savedText.current === undefined) {
      // Primeiro draft depois de o projeto existir (rota carregando): é a baseline, não uma edição.
      savedText.current = text;
      return;
    }
    if (text === savedText.current || !canSave(status)) return;
    const timer = window.setTimeout(() => void save(), SYNC_DELAY_MS);
    return () => window.clearTimeout(timer);
    // `status` de propósito fora das deps: uma mudança de status não é uma edição.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.revision, editor.draft, reading, project, save]);

  const retry = useCallback(() => {
    if (latest.current.project === undefined) return;
    void save();
  }, [save]);

  return { status, retry };
}
