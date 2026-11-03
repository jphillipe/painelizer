'use server';

import { revalidatePath } from 'next/cache';
import { PROJECTS_HREF } from '@/lib/projects';
import { authActionClient } from '@/lib/safe-action';
import { projectIdSchema } from '@/schemas/project';
import { duplicateProject } from '@/services/projects.service';

/** S22.2: cópia "Copy of <nome>" com o mesmo conteúdo; o autor da cópia é quem está logado (`ctx.user`). */
export const duplicateProjectAction = authActionClient.inputSchema(projectIdSchema).action(async ({ parsedInput, ctx }) => {
  const result = await duplicateProject(parsedInput.id, ctx.user);
  if (result.ok) revalidatePath(PROJECTS_HREF);
  return result;
});
