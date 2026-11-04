import { z } from 'zod';

/** Entrada do formulário do visualizador e da action `generatePanels` (compartilhado cliente/servidor). */
export const generatePanelsSchema = z.object({
  projectText: z.string().trim().min(2, 'Paste or open a project JSON, or pick an example.'),
});

export type GeneratePanelsInput = z.infer<typeof generatePanelsSchema>;

/** Checagem do editor (S21): mesmo texto, sem gerar arquivos. */
export const checkProjectSchema = generatePanelsSchema;

/**
 * Teto do `.panelizer.json` numa gravação (S23, A9). O texto leva a leitura da IA (500 KB+) e a planta por baixo em
 * data URL (centenas de KB a poucos MB); 16 MB sobra para isso e fica abaixo dos 32 MB por pedido do Cloud Run — sem
 * teto, o único limite era o `bodySizeLimit` de 300 MB das actions (pensado para o upload dos desenhos).
 */
export const PROJECT_TEXT_MAX = 16 * 1024 * 1024;
const projectText = z.string().min(2, 'Nothing to save.').max(PROJECT_TEXT_MAX, 'The project is too large to save (over 16 MB). Remove the drawing under the plan and try again.');

/** S22.1: criar o projeto no servidor na primeira abertura (nome opcional; o texto é o `.panelizer.json`). */
export const createProjectSchema = z.object({
  name: z.string().trim().max(200).optional(),
  text: projectText,
});

/** S22.1: gravar uma edição; `revision` é a que o cliente carregou (concorrência otimista). */
export const saveProjectSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().min(1),
  name: z.string().trim().max(200).optional(),
  text: projectText,
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
