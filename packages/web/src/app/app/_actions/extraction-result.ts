'use server';

import { authActionClient } from '@/lib/safe-action';
import { jobIdSchema } from '@/schemas/extract';
import { takeResult } from '@/services/extract-jobs';

/** Resultado de uma leitura terminada enquanto a página não estava lá (M7: F5 no meio; S24: também deploy ou restart); entregue uma vez, só ao dono. */
export const extractionResult = authActionClient.inputSchema(jobIdSchema).action(async ({ parsedInput, ctx }) => (await takeResult(parsedInput.jobId, ctx.user?.id)) ?? null);
