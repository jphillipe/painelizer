/**
 * PDF vetorial pequeno e determinístico para os testes: duas páginas Letter com textos em posições
 * conhecidas (pdf-lib mede do canto inferior esquerdo; o leitor devolve y do topo).
 */

import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';

export const PAGE_W = 612;
export const PAGE_H = 792;

export async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const plan = doc.addPage([PAGE_W, PAGE_H]);
  plan.drawText('A-100', { x: 500, y: 40, size: 24, font });
  plan.drawText('A-000', { x: 480, y: 70, size: 8, font }); // lista de folhas, menor: não é o carimbo
  plan.drawText(`16' - 0"`, { x: 100, y: 700, size: 10, font });
  plan.drawText(`8' - 5 7/8"`, { x: 300, y: 700, size: 10, font });
  plan.drawText(`29' - 0"`, { x: 50, y: 300, size: 10, font, rotate: degrees(90) });
  plan.drawText('1st Floor Plan', { x: 100, y: 100, size: 14, font });

  const schedule = doc.addPage([PAGE_W, PAGE_H]);
  schedule.drawText('A-800', { x: 500, y: 40, size: 24, font });
  schedule.drawText('Door Schedule', { x: 100, y: 700, size: 12, font });

  return doc.save();
}
