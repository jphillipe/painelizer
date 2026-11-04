'use client';

import { useAction } from 'next-safe-action/hooks';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ExtractJob, ExtractOutcome } from '@/types/extract';
import { cancelExtraction } from '../_actions/cancel-extraction';
import { extractionResult } from '../_actions/extraction-result';

export interface ExtractionJobApi {
  /** Leitura em curso (M7): a tela de espera do passo 01. */
  job: ExtractJob | undefined;
  setJob: (job: ExtractJob | undefined) => void;
  extracting: boolean;
  cancel: () => void;
  /** Job retomado depois de um F5 terminou: recolhe o resultado do servidor e o entrega. */
  onResumedDone: () => Promise<void>;
  onResumedEnded: (status: 'failed' | 'cancelled' | 'unknown', message: string | undefined) => void;
}

/**
 * Leitura da IA em curso (S30, saída do `new-project-view.tsx`): o job, cancelar e — para um job retomado depois de
 * um F5 (M7) — recolher o resultado do servidor quando ele termina. `deliver` recebe a leitura recolhida.
 */
export function useExtractionJob(deliver: (outcome: ExtractOutcome) => void): ExtractionJobApi {
  const [job, setJob] = useState<ExtractJob | undefined>(undefined);
  const { execute: cancelRead } = useAction(cancelExtraction);
  const { executeAsync: fetchResult } = useAction(extractionResult);
  // `deliver` é recriado a cada render de quem chama; o callback usa o do render mais recente.
  const deliverRef = useRef(deliver);
  deliverRef.current = deliver;
  const onResumedDone = useCallback(async () => {
    const current = job;
    if (current === undefined) return;
    const r = await fetchResult({ jobId: current.jobId });
    setJob(undefined);
    if (r.data === null || r.data === undefined)
      toast.warning('The read finished, but its result was already collected or has expired.');
    else deliverRef.current(r.data);
  }, [job, fetchResult]);
  const onResumedEnded = useCallback((status: 'failed' | 'cancelled' | 'unknown', message: string | undefined) => {
    setJob(undefined);
    if (status === 'unknown')
      toast.warning('The server no longer knows this read (it may have restarted). Upload the set again.');
    else if (status === 'cancelled') toast(message ?? 'Read cancelled.');
    else toast.error(message ?? 'The read failed.');
  }, []);
  return {
    job,
    setJob,
    extracting: job !== undefined,
    cancel: () => {
      if (job !== undefined) cancelRead({ jobId: job.jobId });
    },
    onResumedDone,
    onResumedEnded,
  };
}
