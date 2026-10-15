'use server';

import { actionClient } from '@/lib/safe-action';
import { generatePanelsSchema } from '@/schemas/project';
import { generate } from '@/services/panels.service';

/** "Generate panels": valida a entrada e delega ao service. Problemas de projeto voltam em `data.ok === false`. */
export const generatePanels = actionClient.inputSchema(generatePanelsSchema).action(async ({ parsedInput }) => {
  return generate(parsedInput.projectText);
});
