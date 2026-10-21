'use server';

import { actionClient } from '@/lib/safe-action';
import { jobIdSchema } from '@/schemas/extract';
import { jobProgress } from '@/services/extract-jobs';

/** Progresso de uma leitura em curso (M7), consultado pela tela de espera a cada poucos segundos. */
export const extractionProgress = actionClient.inputSchema(jobIdSchema).action(async ({ parsedInput }) => jobProgress(parsedInput.jobId));
