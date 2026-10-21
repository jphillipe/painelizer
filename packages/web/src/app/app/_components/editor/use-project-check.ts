'use client';

import { useAction } from 'next-safe-action/hooks';
import { useEffect, useRef, useState } from 'react';
import { textFromDraft, withoutEditorKeys, type ProjectDraft } from '@/lib/editor/draft';
import type { CheckResult } from '@/types/panels';
import { checkProject } from '../../_actions/check-project';

export interface CheckState {
  status: 'idle' | 'checking' | 'done' | 'error';
  /** Último resultado aplicado (pode ser de uma revisão anterior: ver `stale`). */
  result: CheckResult | undefined;
  /** Revisão do draft a que `result` se refere. */
  revision: number;
  /** `result` não é desta revisão do draft. */
  stale: boolean;
  error?: string;
}

export const CHECK_DELAY_MS = 600;

/**
 * O que vai ao motor: o draft sem as chaves `$…` do editor (`$underlay`, `$reviewed`), que o parser do CLI ignora.
 * M6 tirava só o underlay (a imagem pesa); M10 mostrou que marcar "Reviewed" ainda mudava o texto e reenviava o
 * projeto — agora qualquer edição que o motor não enxerga não vai ao servidor.
 */
export function engineText(draft: ProjectDraft): string {
  return textFromDraft(withoutEditorKeys(draft));
}

/**
 * Checagem do motor com debounce (S21): `delayMs` depois da última mudança do draft, manda o projeto para a
 * action `checkProject`. Cada pedido leva a revisão do draft; uma resposta mais antiga que a última aplicada
 * é descartada, e o resultado fica marcado como `stale` até a revisão atual ser checada. Uma revisão cujo
 * texto para o motor é igual ao já checado (M6: opacidade do underlay, marca "Reviewed") não vai ao servidor.
 */
export function useProjectCheck(draft: ProjectDraft | undefined, revision: number, delayMs = CHECK_DELAY_MS): CheckState {
  const { executeAsync } = useAction(checkProject);
  const [state, setState] = useState<Omit<CheckState, 'stale'>>({ status: 'idle', result: undefined, revision: 0 });
  const applied = useRef(0);
  const checkedText = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (draft === undefined) {
      applied.current = revision;
      checkedText.current = undefined;
      setState({ status: 'idle', result: undefined, revision });
      return;
    }
    const text = engineText(draft);
    if (text === checkedText.current) {
      // Mesma entrada do motor: o resultado anterior vale para esta revisão.
      applied.current = revision;
      setState((s) => (s.status === 'done' ? { ...s, revision } : s));
      return;
    }
    setState((s) => ({ ...s, status: 'checking' }));
    const timer = setTimeout(() => {
      void executeAsync({ projectText: text }).then((r) => {
        if (revision < applied.current) return;
        applied.current = revision;
        if (r.data !== undefined) {
          checkedText.current = text;
          setState({ status: 'done', result: r.data, revision });
        } else setState({ status: 'error', result: undefined, revision, error: r.serverError ?? 'Could not check the project.' });
      });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [draft, revision, delayMs, executeAsync]);

  return { ...state, stale: state.revision !== revision };
}
