'use server';

import { authActionClient } from '@/lib/safe-action';
import { jobIdSchema } from '@/schemas/extract';
import { cancelJob } from '@/services/extract-jobs';

/** Cancela a leitura em curso (M7): aborta a chamada à API; a action original devolve `cancelled`. */
export const cancelExtraction = authActionClient.inputSchema(jobIdSchema).action(async ({ parsedInput }) => ({ cancelled: cancelJob(parsedInput.jobId) }));
