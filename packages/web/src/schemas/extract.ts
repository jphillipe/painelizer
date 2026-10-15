import { z } from 'zod';

/** Campos do formulário de upload (a lista de arquivos vai no FormData; aqui só o que é texto). */
export const uploadFieldsSchema = z.object({
  /** '' = identificar pelos desenhos. */
  level: z.string().trim().regex(/^$|^[1-9]\d*$/, 'Level must be a whole number'),
  projectName: z.string().trim().max(120, 'Keep the name under 120 characters'),
  pages: z.string().trim().regex(/^$|^\d+(\s*,\s*\d+)*$/, 'Use page numbers separated by commas, e.g. 3,15'),
  notes: z.string().trim().max(2000, 'Keep notes under 2000 characters'),
});

export type UploadFields = z.infer<typeof uploadFieldsSchema>;

export function parsePages(s: string): number[] | undefined {
  const t = s.trim();
  if (t === '') return undefined;
  return t.split(',').map((p) => Number(p.trim()));
}

/** Resposta gravada do modelo, como texto JSON (Advanced). */
export const finishResponseSchema = z.object({
  responseJson: z.string().min(2, 'Paste or open the recorded response JSON.'),
});
