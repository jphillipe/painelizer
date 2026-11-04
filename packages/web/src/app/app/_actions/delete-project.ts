'use server';

import { revalidatePath } from 'next/cache';
import { PROJECTS_HREF } from '@/lib/projects';
import { authActionClient } from '@/lib/safe-action';
import { projectIdSchema } from '@/schemas/project';
import { deleteProject } from '@/services/projects.service';

/** S22.2; S32: apagar de vez, só da lixeira e só admin (a RLS recusa o resto), depois da confirmação na tela. */
export const deleteProjectAction = authActionClient.inputSchema(projectIdSchema).action(async ({ parsedInput }) => {
  const result = await deleteProject(parsedInput.id);
  if (result.ok) revalidatePath(PROJECTS_HREF);
  return result;
});
