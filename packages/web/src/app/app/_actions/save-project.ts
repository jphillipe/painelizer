'use server';

import { authActionClient } from '@/lib/safe-action';
import { saveProjectSchema } from '@/schemas/project';
import { saveProject } from '@/services/projects.service';

/** S22.1: auto-save de cada edição, com a revisão carregada; revisão divergente volta como `conflict`, sem gravar. */
export const saveProjectAction = authActionClient.inputSchema(saveProjectSchema).action(async ({ parsedInput }) => {
  return saveProject({ id: parsedInput.id, revision: parsedInput.revision, name: parsedInput.name, text: parsedInput.text });
});
