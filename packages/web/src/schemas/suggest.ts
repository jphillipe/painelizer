import { z } from 'zod';
import { MAX_OCCURRENCES } from '@/lib/ai/fix-suggestion';
import { PROJECT_TEXT_MAX } from './project';

/** Entrada da action `suggestFix` (S51): o projeto como está no editor, a causa e as notas da leitura. */
export const suggestFixSchema = z.object({
  projectText: z.string().min(2).max(PROJECT_TEXT_MAX),
  issue: z.object({
    family: z.string().min(1).max(100),
    severity: z.enum(['problem', 'warning']),
    title: z.string().max(300),
    what: z.string().max(1000).optional(),
    fix: z.string().max(1000).optional(),
    summary: z.string().max(1000).optional(),
    total: z.number().int().min(0),
    occurrences: z
      .array(
        z.object({
          wallId: z.string().max(200).optional(),
          openingId: z.string().max(200).optional(),
          message: z.string().max(2000),
          params: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .max(MAX_OCCURRENCES),
  }),
  notes: z.array(z.string().max(4000)).max(100).optional(),
});

export type SuggestFixInput = z.infer<typeof suggestFixSchema>;
