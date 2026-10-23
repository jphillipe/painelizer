'use server';

import { authActionClient } from '@/lib/safe-action';
import { jobIdSchema } from '@/schemas/extract';
import { takeResult } from '@/services/extract-jobs';

/** Resultado de uma leitura terminada enquanto a página não estava lá (M7: F5 no meio); entregue uma vez. */
export const extractionResult = authActionClient.inputSchema(jobIdSchema).action(async ({ parsedInput }) => takeResult(parsedInput.jobId) ?? null);
