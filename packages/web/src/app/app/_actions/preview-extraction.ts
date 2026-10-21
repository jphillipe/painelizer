'use server';

import { z } from 'zod';
import { actionClient } from '@/lib/safe-action';
import { preview } from '@/services/extract.service';
import { readUploadForm } from './extract-walls';

/** Prévia do que será enviado à IA (M7): páginas escolhidas, folhas fora, tamanho — sem chamar a API. */
export const previewExtraction = actionClient.inputSchema(z.instanceof(FormData)).action(async ({ parsedInput: form }) => {
  const { files, pages, pagesByFile, level } = await readUploadForm(form);
  return preview(files, { ...(pages === undefined ? {} : { pages }), pagesByFile, ...(level === undefined ? {} : { hints: { level } }) });
});
