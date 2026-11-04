'use server';

import { revalidatePath } from 'next/cache';
import { PROJECTS_HREF } from '@/lib/projects';
import { authActionClient } from '@/lib/safe-action';
import { projectIdSchema } from '@/schemas/project';
import { restoreProject, trashProject } from '@/services/projects.service';

/** S32: "Move to trash" na lista (antes "Delete" apagava de vez). Qualquer membro do time. */
export const trashProjectAction = authActionClient.inputSchema(projectIdSchema).action(async ({ parsedInput }) => {
  const result = await trashProject(parsedInput.id);
  if (result.ok) revalidatePath(PROJECTS_HREF);
  return result;
});

/** S32: tirar da lixeira. Qualquer membro do time. */
export const restoreProjectAction = authActionClient.inputSchema(projectIdSchema).action(async ({ parsedInput }) => {
  const result = await restoreProject(parsedInput.id);
  if (result.ok) revalidatePath(PROJECTS_HREF);
  return result;
});
