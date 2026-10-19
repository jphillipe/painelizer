'use client';

import { useAction } from 'next-safe-action/hooks';
import { useEffect, useRef, useState } from 'react';
import { textFromDraft, type ProjectDraft } from '@/lib/editor/draft';
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
 * Checagem do motor com debounce (S21): `delayMs` depois da última mudança do draft, manda o projeto para a
 * action `checkProject`. Cada pedido leva a revisão do draft; uma resposta mais antiga que a última aplicada
 * é descartada, e o resultado fica marcado como `stale` até a revisão atual ser checada.
 */
export function useProjectCheck(draft: ProjectDraft | undefined, revision: number, delayMs = CHECK_DELAY_MS): CheckState {
  const { executeAsync } = useAction(checkProject);
  const [state, setState] = useState<Omit<CheckState, 'stale'>>({ status: 'idle', result: undefined, revision: 0 });
  const applied = useRef(0);

  useEffect(() => {
    if (draft === undefined) {
      applied.current = revision;
      setState({ status: 'idle', result: undefined, revision });
      return;
    }
    setState((s) => ({ ...s, status: 'checking' }));
    const text = textFromDraft(draft);
    const timer = setTimeout(() => {
      void executeAsync({ projectText: text }).then((r) => {
        if (revision < applied.current) return;
        applied.current = revision;
        if (r.data !== undefined) setState({ status: 'done', result: r.data, revision });
        else setState({ status: 'error', result: undefined, revision, error: r.serverError ?? 'Could not check the project.' });
      });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [draft, revision, delayMs, executeAsync]);

  return { ...state, stale: state.revision !== revision };
}
