'use server';

import { revalidatePath } from 'next/cache';
import { PROJECTS_HREF } from '@/lib/projects';
import { authActionClient } from '@/lib/safe-action';
import { renameProjectSchema } from '@/schemas/project';
import { renameProject } from '@/services/projects.service';

/** S22.2: renomear pela lista; o service troca o nome na linha e dentro do arquivo, subindo a revisão. */
export const renameProjectAction = authActionClient.inputSchema(renameProjectSchema).action(async ({ parsedInput }) => {
  const result = await renameProject({ id: parsedInput.id, name: parsedInput.name });
  if (result.ok) revalidatePath(PROJECTS_HREF);
  return result;
});
