'use server';

import { revalidatePath } from 'next/cache';
import { PROJECTS_HREF } from '@/lib/projects';
import { authActionClient } from '@/lib/safe-action';
import { projectIdSchema, projectRevisionSchema } from '@/schemas/project';
import { listRevisions, restoreRevision } from '@/services/projects.service';

/** S32: os retratos de um projeto, para o dialog "History" da lista. */
export const projectHistoryAction = authActionClient.inputSchema(projectIdSchema).action(async ({ parsedInput }) => listRevisions(parsedInput.id));

/** S32: um retrato do histórico vira projeto novo; o autor é quem restaurou. */
export const restoreRevisionAction = authActionClient.inputSchema(projectRevisionSchema).action(async ({ parsedInput, ctx }) => {
  const result = await restoreRevision(parsedInput, ctx.user);
  if (result.ok) revalidatePath(PROJECTS_HREF);
  return result;
});
