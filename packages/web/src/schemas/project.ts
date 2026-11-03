import { z } from 'zod';

/** Entrada do formulário do visualizador e da action `generatePanels` (compartilhado cliente/servidor). */
export const generatePanelsSchema = z.object({
  projectText: z.string().trim().min(2, 'Paste or open a project JSON, or pick an example.'),
});

export type GeneratePanelsInput = z.infer<typeof generatePanelsSchema>;

/** Checagem do editor (S21): mesmo texto, sem gerar arquivos. */
export const checkProjectSchema = generatePanelsSchema;

/** S22.1: criar o projeto no servidor na primeira abertura (nome opcional; o texto é o `.panelizer.json`). */
export const createProjectSchema = z.object({
  name: z.string().trim().max(200).optional(),
  text: z.string().min(2, 'Nothing to save.'),
});

/** S22.1: gravar uma edição; `revision` é a que o cliente carregou (concorrência otimista). */
export const saveProjectSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().min(1),
  name: z.string().trim().max(200).optional(),
  text: z.string().min(2, 'Nothing to save.'),
});

/** S22.2: renomear na lista (nome obrigatório: quem renomeia quis dar um nome). */
export const renameProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, 'Give the project a name.').max(200, 'At most 200 characters.'),
});

/** S22.2: duplicar e apagar só precisam do id. */
export const projectIdSchema = z.object({
  id: z.string().uuid(),
});
