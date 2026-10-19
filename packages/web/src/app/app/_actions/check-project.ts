'use server';

import { actionClient } from '@/lib/safe-action';
import { checkProjectSchema } from '@/schemas/project';
import { check } from '@/services/panels.service';

/** Editor (S21): checagem do motor com debounce — problemas e avisos desta versão do projeto, sem arquivos. */
export const checkProject = actionClient.inputSchema(checkProjectSchema).action(async ({ parsedInput }) => {
  return check(parsedInput.projectText);
});
