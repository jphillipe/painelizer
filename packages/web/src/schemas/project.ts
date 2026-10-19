import { z } from 'zod';

/** Entrada do formulário do visualizador e da action `generatePanels` (compartilhado cliente/servidor). */
export const generatePanelsSchema = z.object({
  projectText: z.string().trim().min(2, 'Paste or open a project JSON, or pick an example.'),
});

export type GeneratePanelsInput = z.infer<typeof generatePanelsSchema>;

/** Checagem do editor (S21): mesmo texto, sem gerar arquivos. */
export const checkProjectSchema = generatePanelsSchema;
