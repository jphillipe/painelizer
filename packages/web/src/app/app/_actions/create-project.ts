'use server';

import { authActionClient } from '@/lib/safe-action';
import { createProjectSchema } from '@/schemas/project';
import { createProject } from '@/services/projects.service';

/** S22.1: o projeto ganha id no servidor na primeira abertura; o autor vem da sessão (`ctx.user`). */
export const createProjectAction = authActionClient.inputSchema(createProjectSchema).action(async ({ parsedInput, ctx }) => {
  return createProject({ name: parsedInput.name, text: parsedInput.text }, ctx.user);
});
