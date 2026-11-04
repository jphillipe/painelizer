'use server';

import { authActionClient } from '@/lib/safe-action';
import { jobIdSchema } from '@/schemas/extract';
import { cancelJob } from '@/services/extract-jobs';

/**
 * Cancela a leitura em curso (M7): aborta a chamada à API; a action original devolve `cancelled`. S24: só o dono;
 * noutra instância do servidor, marca o pedido no banco e a instância que roda aborta no próximo batimento.
 */
export const cancelExtraction = authActionClient.inputSchema(jobIdSchema).action(async ({ parsedInput, ctx }) => ({ cancelled: await cancelJob(parsedInput.jobId, ctx.user?.id) }));
