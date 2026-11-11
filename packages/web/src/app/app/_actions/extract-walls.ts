'use server';

import { z } from 'zod';
import { authActionClient } from '@/lib/safe-action';
import { parseDrawings, parsePages, parsePagesByFile, pickProjectData, uploadFieldsSchema } from '@/schemas/extract';
import { downloadDrawings } from '@/services/drawings.service';
import { fromFiles, type UploadedFile } from '@/services/extract.service';
import type { DrawingRef } from '@/lib/drawings';

export type UploadFormInput = Awaited<ReturnType<typeof readUploadForm>>;

/**
 * Campos de texto e arquivos de um FormData de upload (compartilhado com a prévia, M7). S22.3: quando o
 * navegador subiu os desenhos ao Storage, vem `drawings` (JSON com os caminhos) e nenhum arquivo no corpo — o
 * servidor baixa os bytes do bucket. Sem Storage (desenvolvimento sem chaves), os arquivos vêm no corpo como antes.
 * `userId` liga o cache de downloads (a prévia e a leitura do mesmo envio baixam uma vez).
 */
export async function readUploadForm(form: FormData, userId?: string) {
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
  const drawings: DrawingRef[] = parseDrawings(text('drawings'));
  const files: UploadedFile[] = [];
  let storageError: string | undefined;
  if (drawings.length > 0) {
    const downloaded = await downloadDrawings(drawings, undefined, userId);
    if (downloaded.ok) files.push(...downloaded.files);
    else storageError = downloaded.message;
  } else {
    for (const entry of form.getAll('files')) {
      if (entry instanceof File && entry.size > 0) {
        files.push({ name: entry.name, type: entry.type, bytes: new Uint8Array(await entry.arrayBuffer()) });
      }
    }
  }
  const pages = parsePages(fields.pages);
  const pagesByFile = parsePagesByFile(text('pagesByFile'));
  const level = fields.level === '' ? undefined : Number(fields.level);
  const jobId = text('jobId');
  return { fields, files, drawings, storageError, pages, pagesByFile, level, jobId: /^[A-Za-z0-9-]{8,64}$/.test(jobId) ? jobId : undefined };
}

/**
 * "Extract walls with AI": arquivos (`files`, vários) ou os caminhos dos desenhos no Storage (`drawings`, S22.3)
 * e os campos de texto num FormData; `jobId` (M7) para a tela acompanhar o progresso e recolher o resultado
 * depois de um F5. Sem chave no servidor, devolve `{ ok: false, reason: 'no_key' }` sem ler os arquivos.
 * A leitura que deu certo leva os desenhos consigo (vão para o `.panelizer.json` e para o banco).
 */
export const extractWalls = authActionClient.inputSchema(z.instanceof(FormData)).action(async ({ parsedInput: form, ctx }) => {
  const { fields, files, drawings, storageError, pages, pagesByFile, level, jobId } = await readUploadForm(form, ctx.user?.id);
  if (storageError !== undefined) return { ok: false as const, reason: 'input' as const, message: storageError };
  const given = pickProjectData(fields);
  // S24: o job é do usuário da sessão, e os desenhos entram no resultado guardado (vale também para o recolhido após F5).
  return fromFiles(files, {
    ...(pages === undefined ? {} : { pages }),
    owner: ctx.user?.id,
    drawings,
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
