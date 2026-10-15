'use server';

import { actionClient } from '@/lib/safe-action';
import { finishResponseSchema } from '@/schemas/extract';
import { fromRecorded } from '@/services/extract.service';
import type { ExtractOutcome } from '@/types/extract';

/** Advanced: resposta gravada do modelo (JSON) → mesma revisão da extração real, sem chave. */
export const finishResponse = actionClient.inputSchema(finishResponseSchema).action(async ({ parsedInput }): Promise<ExtractOutcome> => {
  let raw: unknown;
  try {
    raw = JSON.parse(parsedInput.responseJson);
  } catch (e) {
    return { ok: false, reason: 'input', message: `Not valid JSON: ${(e as Error).message}` };
  }
  return fromRecorded(raw);
});
