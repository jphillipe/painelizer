'use server';

import { authActionClient } from '@/lib/safe-action';
import { jobIdSchema } from '@/schemas/extract';
import { jobProgress } from '@/services/extract-jobs';

/** Progresso de uma leitura em curso (M7), consultado pela tela de espera a cada poucos segundos. S24: só o dono; job de outro é `unknown`. */
export const extractionProgress = authActionClient.inputSchema(jobIdSchema).action(async ({ parsedInput, ctx }) => jobProgress(parsedInput.jobId, ctx.user?.id));
