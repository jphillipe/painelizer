'use server';

import { z } from 'zod';
import { authActionClient } from '@/lib/safe-action';
import { parsePages, parsePagesByFile, pickProjectData, uploadFieldsSchema } from '@/schemas/extract';
import { fromFiles, type UploadedFile } from '@/services/extract.service';

/** Campos de texto e arquivos de um FormData de upload (compartilhado com a prévia, M7). */
export async function readUploadForm(form: FormData) {
  const text = (k: string) => (typeof form.get(k) === 'string' ? (form.get(k) as string) : '');
  const fields = uploadFieldsSchema.parse({
    level: text('level'),
    projectName: text('projectName'),
    wallHeight: text('wallHeight'),
    headerHeight: text('headerHeight'),
    sillHeight: text('sillHeight'),
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
  const pagesByFile = parsePagesByFile(text('pagesByFile'));
  const level = fields.level === '' ? undefined : Number(fields.level);
  const jobId = text('jobId');
  return { fields, files, pages, pagesByFile, level, jobId: /^[A-Za-z0-9-]{8,64}$/.test(jobId) ? jobId : undefined };
}

/**
 * "Extract walls with AI": arquivos (`files`, vários) e os campos de texto num FormData; `jobId` (M7) para a
 * tela acompanhar o progresso e recolher o resultado depois de um F5.
 * Sem chave no servidor, devolve `{ ok: false, reason: 'no_key' }` sem ler os arquivos.
 */
export const extractWalls = authActionClient.inputSchema(z.instanceof(FormData)).action(async ({ parsedInput: form }) => {
  const { fields, files, pages, pagesByFile, level, jobId } = await readUploadForm(form);
  const given = pickProjectData(fields);
  return fromFiles(files, {
    ...(pages === undefined ? {} : { pages }),
    pagesByFile,
    given,
    ...(jobId === undefined ? {} : { jobId }),
    hints: {
      ...(level === undefined ? {} : { level }),
      ...(fields.projectName === '' ? {} : { projectName: fields.projectName }),
      ...(fields.notes === '' ? {} : { extra: fields.notes }),
    },
  });
});
