'use server';

import { actionClient } from '@/lib/safe-action';
import { applyProjectDataSchema } from '@/schemas/extract';
import { reconvert } from '@/services/extract.service';

/** Revisão: reaplica altura e dados estruturais à leitura já feita, sem chamar a IA. */
export const applyProjectData = actionClient.inputSchema(applyProjectDataSchema).action(async ({ parsedInput }) => {
  if (parsedInput.output === undefined || parsedInput.output === null) {
    return {
      ok: false as const,
      reason: 'input' as const,
      message: 'This reading has no saved AI response (it was made before the app was updated). Run the extraction again; from now on the response is kept with the reading.',
    };
  }
  return reconvert(parsedInput.output, parsedInput.data, parsedInput.meta);
});
