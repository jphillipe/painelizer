'use client';

/**
 * Render de páginas de PDF e de imagens no cliente (M5/M6): miniaturas do passo 01 e a planta por baixo das
 * paredes. pdf.js é o mesmo que a extração usa no servidor; aqui entra por `import()` para não pesar o bundle
 * de quem não solta PDF. Só DOM; sem teste.
 */

export interface Rendered {
  dataUrl: string;
  width: number;
  height: number;
}

export const isPdfFile = (f: File): boolean => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');

type PdfDocument = Awaited<ReturnType<Awaited<typeof import('pdfjs-dist')>['getDocument']>['promise']>;

export async function loadPdf(file: File): Promise<PdfDocument> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

/** Uma página em `maxPx` de largura (ou altura, o que for maior), como PNG (miniatura) ou JPEG (planta grande). */
export async function renderPdfPage(doc: PdfDocument, page: number, maxPx: number, format: 'png' | 'jpeg' = 'png'): Promise<Rendered> {
  const p = await doc.getPage(page);
  const base = p.getViewport({ scale: 1 });
  const viewport = p.getViewport({ scale: maxPx / Math.max(base.width, base.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('canvas 2d indisponível');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { dataUrl: format === 'jpeg' ? canvas.toDataURL('image/jpeg', 0.82) : canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

/** Imagem (PNG/JPG/WebP/GIF) reduzida a `maxPx` no lado maior, como JPEG. */
export async function renderImageFile(file: File, maxPx: number): Promise<Rendered> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * k));
  canvas.height = Math.max(1, Math.round(bitmap.height * k));
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('canvas 2d indisponível');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.82), width: canvas.width, height: canvas.height };
}
