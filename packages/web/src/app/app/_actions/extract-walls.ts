'use server';

import { z } from 'zod';
import { actionClient } from '@/lib/safe-action';
import { parsePages, pickProjectData, toConvertOptions, uploadFieldsSchema } from '@/schemas/extract';
import { fromFiles, type UploadedFile } from '@/services/extract.service';

/**
 * "Extract walls with AI": arquivos (`files`, vários) e os campos de texto num FormData.
 * Sem chave no servidor, devolve `{ ok: false, reason: 'no_key' }` sem ler os arquivos.
 */
export const extractWalls = actionClient.inputSchema(z.instanceof(FormData)).action(async ({ parsedInput: form }) => {
  const text = (k: string) => (typeof form.get(k) === 'string' ? (form.get(k) as string) : '');
  const fields = uploadFieldsSchema.parse({
    level: text('level'),
    projectName: text('projectName'),
    wallHeight: text('wallHeight'),
    floors: text('floors'),
    floorSpan: text('floorSpan'),
    snow: text('snow'),
    width: text('width'),
    wind: text('wind'),
    exposure: text('exposure'),
    pages: text('pages'),
    notes: text('notes'),
  });
  const files: UploadedFile[] = [];
  for (const entry of form.getAll('files')) {
    if (entry instanceof File && entry.size > 0) {
      files.push({ name: entry.name, type: entry.type, bytes: new Uint8Array(await entry.arrayBuffer()) });
    }
  }
  const pages = parsePages(fields.pages);
  const level = fields.level === '' ? undefined : Number(fields.level);
  const given = pickProjectData(fields);
  return fromFiles(files, {
    ...(pages === undefined ? {} : { pages }),
    given,
    hints: {
      ...(level === undefined ? {} : { level }),
      ...(fields.projectName === '' ? {} : { projectName: fields.projectName }),
      ...(fields.notes === '' ? {} : { extra: fields.notes }),
    },
  });
});
