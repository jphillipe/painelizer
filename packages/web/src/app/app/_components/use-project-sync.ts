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
  /** Conflito (S23, A4): grava as edições daqui por cima da revisão que outra pessoa gravou. */
  overwrite: () => void;
}

/**
 * Auto-save no servidor (S22.1): quando o `.panelizer.json` do editor difere do último texto gravado (ou carregado),
 * grava 500 ms depois com a revisão carregada; a resposta traz a próxima. A baseline é o TEXTO, não a revisão do
 * editor: carregar um projeto (rota, retomada) não grava nada, reconverter a leitura grava, e uma edição desfeita
 * de volta ao texto gravado também não grava. Projeto recém-criado (S23, A2) traz em `project.text` o texto que foi
 * no `create`: essa é a baseline, e uma edição feita enquanto a criação estava em voo sai logo depois. Uma
 * gravação por vez: edição durante a gravação sai em seguida. Conflito (outra pessoa gravou antes) ou projeto
 * apagado param o auto-save até o humano escolher (recarregar, salvar como cópia ou sobrescrever); a sessão do
 * navegador (`use-saved-session`) continua guardando as edições como buffer de queda.
 */
export function useProjectSync(editor: EditorState, reading: Reading | undefined, project: ServerProject | undefined, onProject: (p: ServerProject) => void): ProjectSyncApi {
  const [status, setStatus] = useState<SaveStatus>(project === undefined ? { kind: 'local' } : { kind: 'saved', at: Date.parse(project.savedAt) || Date.now() });
  const { executeAsync } = useAction(saveProjectAction);
  /** Texto que o servidor tem (gravado por nós, enviado na criação ou carregado); `undefined` até o primeiro draft com projeto. */
  const savedText = useRef<string | undefined>(undefined);
  const inFlight = useRef(false);
  const latest = useRef({ editor, reading, project, onProject, status });
  latest.current = { editor, reading, project, onProject, status };

  const currentText = (): string | undefined => {
    const { editor: ed, reading: rd } = latest.current;
    return ed.draft === undefined ? undefined : projectFileText(ed.draft, rd);
  };

  /** `revision` só no "Overwrite": a revisão do conflito, para a gravação condicional passar por cima. */
  const save = useCallback(
    async (revision?: number) => {
      const { editor: ed, reading: rd, project: pr } = latest.current;
      if (pr === undefined || ed.draft === undefined || inFlight.current) return;
      const text = projectFileText(ed.draft, rd);
      inFlight.current = true;
      setStatus({ kind: 'saving' });
      const name = ed.draft.name ?? rd?.projectName;
      const result = await executeAsync({ id: pr.id, revision: revision ?? pr.revision, ...(name === undefined ? {} : { name }), text });
      inFlight.current = false;
      const next = statusAfterSave(result.data, result.serverError, Date.now());
      if (result.data?.ok === true) {
        savedText.current = text;
        latest.current.onProject({ id: pr.id, revision: result.data.revision, savedAt: result.data.savedAt });
      }
      setStatus(next);
      // Editou enquanto gravava: grava de novo com a revisão nova que acabou de chegar.
      if (next.kind === 'saved' && currentText() !== text) window.setTimeout(() => void save(), 0);
    },
    [executeAsync],
  );

  // Projeto novo (criado agora ou carregado pela URL): a baseline é o texto que o servidor tem — o enviado na
  // criação (S23) ou, sem ele, o que está no editor. Se o editor já mudou desde o envio, grava.
  const projectId = project?.id;
  useEffect(() => {
    const sent = latest.current.project?.text;
    savedText.current = projectId === undefined ? undefined : (sent ?? currentText());
    setStatus(projectId === undefined ? { kind: 'local' } : { kind: 'saved', at: Date.parse(latest.current.project?.savedAt ?? '') || Date.now() });
    if (projectId === undefined || sent === undefined || currentText() === sent) return;
    const timer = window.setTimeout(() => void save(), SYNC_DELAY_MS);
    return () => window.clearTimeout(timer);
    // Só quando o projeto muda: a baseline não se refaz se `save` (deps [executeAsync]) ganhar identidade nova.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

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

  const overwrite = useCallback(() => {
    const current = latest.current.status;
    if (latest.current.project === undefined || current.kind !== 'conflict') return;
    void save(current.revision);
  }, [save]);

  return { status, retry, overwrite };
}
