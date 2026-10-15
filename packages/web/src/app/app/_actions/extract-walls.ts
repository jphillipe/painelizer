'use server';

import { z } from 'zod';
import { actionClient } from '@/lib/safe-action';
import { parsePages, uploadFieldsSchema } from '@/schemas/extract';
import { fromFiles, type UploadedFile } from '@/services/extract.service';

/**
 * "Extract walls with AI": arquivos (`files`, vários) e os campos de texto num FormData.
 * Sem chave no servidor, devolve `{ ok: false, reason: 'no_key' }` sem ler os arquivos.
 */
export const extractWalls = actionClient.inputSchema(z.instanceof(FormData)).action(async ({ parsedInput: form }) => {
  const fields = uploadFieldsSchema.parse({
    level: form.get('level') ?? '',
    projectName: form.get('projectName') ?? '',
    wallHeight: form.get('wallHeight') ?? '',
    snow: form.get('snow') ?? '',
    width: form.get('width') ?? '',
    wind: form.get('wind') ?? '',
    exposure: form.get('exposure') ?? '',
    floors: form.get('floors') ?? '',
    floorSpan: form.get('floorSpan') ?? '',
    pages: form.get('pages') ?? '',
    notes: form.get('notes') ?? '',
  });
  const files: UploadedFile[] = [];
  for (const entry of form.getAll('files')) {
    if (entry instanceof File && entry.size > 0) {
      files.push({ name: entry.name, type: entry.type, bytes: new Uint8Array(await entry.arrayBuffer()) });
    }
  }
  const pages = parsePages(fields.pages);
  const level = fields.level === '' ? undefined : Number(fields.level);
  const building = {
    ...(fields.snow === '' ? {} : { groundSnowLoad: Number(fields.snow) }),
    ...(fields.width === '' ? {} : { buildingWidth: fields.width }),
    ...(fields.wind === '' ? {} : { windSpeed: Number(fields.wind) }),
    ...(fields.exposure === '' ? {} : { exposure: fields.exposure }),
  };
  const convert = {
    ...(fields.wallHeight === '' ? {} : { wallHeight: fields.wallHeight }),
    ...(Object.keys(building).length === 0 ? {} : { building }),
    ...(fields.floors === '' ? {} : { floorsSupported: Number(fields.floors) }),
    ...(fields.floorSpan === '' ? {} : { floorSpan: fields.floorSpan }),
  };
  return fromFiles(files, {
    ...(pages === undefined ? {} : { pages }),
    ...(Object.keys(convert).length === 0 ? {} : { convert }),
    hints: {
      ...(level === undefined ? {} : { level }),
      ...(fields.projectName === '' ? {} : { projectName: fields.projectName }),
      ...(fields.notes === '' ? {} : { extra: fields.notes }),
    },
  });
});
