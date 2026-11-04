'use server';

import { devToolsEnabled } from '@/lib/dev-tools';
import { authActionClient } from '@/lib/safe-action';
import { finishResponseSchema } from '@/schemas/extract';
import { replayRecorded } from '@/services/extract.service';
import { listExamples } from '@/services/panels.service';
import type { ExtractOutcome } from '@/types/extract';

/**
 * Resposta gravada do modelo → mesma revisão da extração real, sem chave. Sample de leitura pelo id (sempre); JSON
 * colado do Advanced só com `devToolsEnabled()` no servidor (S23, A9).
 */
export const finishResponse = authActionClient.inputSchema(finishResponseSchema).action(async ({ parsedInput }): Promise<ExtractOutcome> => {
  return replayRecorded(parsedInput, {
    devTools: devToolsEnabled(),
    sample: (id) => listExamples().find((e) => e.kind === 'reading' && e.id === id)?.text,
  });
});
