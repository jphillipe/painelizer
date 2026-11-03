'use server';

import { revalidatePath } from 'next/cache';
import { PROJECTS_HREF } from '@/lib/projects';
import { authActionClient } from '@/lib/safe-action';
import { projectIdSchema } from '@/schemas/project';
import { deleteProject } from '@/services/projects.service';

/** S22.2: apagar pela lista, depois da confirmação na tela. Sem lixeira: a linha some (decisão em 04-decisoes). */
export const deleteProjectAction = authActionClient.inputSchema(projectIdSchema).action(async ({ parsedInput }) => {
  const result = await deleteProject(parsedInput.id);
  if (result.ok) revalidatePath(PROJECTS_HREF);
  return result;
});
