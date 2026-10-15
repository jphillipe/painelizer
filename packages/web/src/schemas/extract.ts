import { z } from 'zod';

/** Campos do formulário de upload (a lista de arquivos vai no FormData; aqui só o que é texto). */
export const uploadFieldsSchema = z.object({
  /** '' = identificar pelos desenhos. */
  level: z.string().trim().regex(/^$|^[1-9]\d*$/, 'Level must be a whole number'),
  projectName: z.string().trim().max(120, 'Keep the name under 120 characters'),
  /** Altura da parede quando o conjunto não tem cortes; texto em pés-pol, validado pelo parser do CLI. */
  wallHeight: z.string().trim().max(32, 'Use feet and inches, e.g. 9\'-1 1/8"'),
  /** Dados do estrutural; vazios quando o conjunto não traz. */
  snow: z.string().trim().regex(/^$|^\d+(\.\d+)?$/, 'Snow load in psf, e.g. 30'),
  width: z.string().trim().max(32, 'Use feet and inches, e.g. 29\''),
  wind: z.string().trim().regex(/^$|^\d+$/, 'Wind speed in mph, e.g. 130'),
  exposure: z.enum(['', 'B', 'C', 'D']),
  floors: z.string().trim().regex(/^$|^\d+$/, 'Whole number of floors above, e.g. 2'),
  floorSpan: z.enum(['', 'center', 'clear']),
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
