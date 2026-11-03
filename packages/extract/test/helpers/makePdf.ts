/**
 * PDF vetorial pequeno e determinístico para os testes: duas páginas Letter com textos em posições
 * conhecidas (pdf-lib mede do canto inferior esquerdo; o leitor devolve y do topo).
 */

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

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
  // Uma "parede" vetorial: os recortes renderizados têm o que mostrar mesmo sem fonte (renderPageTiles).
  plan.drawRectangle({ x: 120, y: 400, width: 300, height: 12, borderWidth: 2, borderColor: rgb(0, 0, 0), color: rgb(0.2, 0.2, 0.2) });

  const schedule = doc.addPage([PAGE_W, PAGE_H]);
  schedule.drawText('A-800', { x: 500, y: 40, size: 24, font });
  schedule.drawText('Door Schedule', { x: 100, y: 700, size: 12, font });

  return doc.save();
}

/**
 * Carimbos com rótulo (Matilda, 2026-11-03): página 1 como o arquiteto (faixa inferior com "DRAWING :" sobre o
 * título e "DWG. NO. :" sobre o número `A202`, sem hífen; o carimbo "DRAFT - NOT FOR CONSTRUCTION" mais abaixo,
 * depois de um salto); página 2 como o estrutural (coluna à direita, "Sheet Name:" sobre o título em três
 * linhas e "SHEET:" sobre `SA1.1`).
 */
export async function makeLabeledPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const architect = doc.addPage([PAGE_W, PAGE_H]);
  architect.drawText('PROJECT :', { x: 100, y: 120, size: 8, font });
  architect.drawText('MATILDA PINES, LLC', { x: 102, y: 100, size: 10, font });
  architect.drawText('DRAWING :', { x: 300, y: 120, size: 8, font });
  architect.drawText('FIRST LEVEL FLOOR PLAN', { x: 302, y: 100, size: 10, font });
  architect.drawText('DRAFT - NOT FOR CONSTRUCTION', { x: 302, y: 40, size: 10, font });
  architect.drawText('DWG. NO. :', { x: 500, y: 120, size: 8, font });
  architect.drawText('49', { x: 520, y: 90, size: 10, font });
  architect.drawText('A202', { x: 500, y: 40, size: 24, font });
  architect.drawText('A403', { x: 200, y: 600, size: 6, font }); // referência de corte no desenho, menor

  const structural = doc.addPage([PAGE_W, PAGE_H]);
  structural.drawText('Sheet Name:', { x: 520, y: 300, size: 8, font });
  structural.drawText('APARTMENT', { x: 520, y: 280, size: 9, font });
  structural.drawText('FIRST LEVEL', { x: 520, y: 262, size: 9, font });
  structural.drawText('PLAN', { x: 520, y: 244, size: 9, font });
  structural.drawText('DRAFT', { x: 520, y: 150, size: 9, font });
  structural.drawText('SHEET:', { x: 520, y: 80, size: 8, font });
  structural.drawText('SA1.1', { x: 520, y: 50, size: 20, font });

  return doc.save();
}
