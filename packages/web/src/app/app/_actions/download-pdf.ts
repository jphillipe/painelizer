'use server';

import { actionClient } from '@/lib/safe-action';
import { downloadPdfSchema } from '@/schemas/pdf';
import { sheetsPdf, toBase64 } from '@/services/pdf.service';

/** Folhas do resultado → PDF em base64 (M9): carta paisagem, uma por página, rodapé "x de y". */
export const downloadPdf = actionClient.inputSchema(downloadPdfSchema).action(async ({ parsedInput }) => {
  const bytes = await sheetsPdf(parsedInput.pages, { projectName: parsedInput.projectName });
  return { base64: toBase64(bytes), pages: parsedInput.pages.length, bytes: bytes.byteLength };
});
