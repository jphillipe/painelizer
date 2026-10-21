import { z } from 'zod';

/** Folhas (SVG do resultado, como a tela as tem) → PDF (M9). Uma por página; a planta primeiro. */
export const downloadPdfSchema = z.object({
  projectName: z.string().min(1).max(200),
  pages: z.array(z.object({ label: z.string().min(1).max(80), svg: z.string().min(20).max(4_000_000) })).min(1).max(400),
});
