/**
 * Canvas nativo para o pdf.js renderizar páginas em Node (recortes em alta resolução da planta, `tiles.ts`).
 *
 * O pdf.js em Node procura o `@napi-rs/canvas` com um `require` dinâmico a partir da pasta dele mesmo e, não
 * achando, só avisa ("Cannot load @napi-rs/canvas") e fica sem `DOMMatrix`/`Path2D`: foi o que apareceu nos
 * logs do Cloud Run, porque o rastreio de arquivos do Next não enxerga dependência opcional de dependência.
 * Aqui o pacote é dependência direta e importado estaticamente, então o rastreio o leva junto; os polyfills
 * são feitos ANTES de o pdf.js carregar (este módulo é importado primeiro em `pdf.ts`), e a fábrica de canvas
 * é passada explicitamente ao `getDocument`, para o pdf.js não depender do próprio `require`.
 */

import { createCanvas, DOMMatrix, ImageData, Path2D, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';

const g = globalThis as { DOMMatrix?: unknown; Path2D?: unknown; ImageData?: unknown };
g.DOMMatrix ??= DOMMatrix;
g.Path2D ??= Path2D;
g.ImageData ??= ImageData;

interface CanvasEntry {
  canvas: Canvas | null;
  context: SKRSContext2D | null;
}

/** O que o pdf.js espera de uma `CanvasFactory`: `create`, `reset` e `destroy` (a base dele não é exportada). */
export class NapiCanvasFactory {
  constructor(_options: { enableHWA?: boolean } = {}) {
    void _options;
  }

  create(width: number, height: number): CanvasEntry {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }

  reset(entry: CanvasEntry, width: number, height: number): void {
    if (entry.canvas === null) throw new Error('Canvas is not specified');
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    entry.canvas.width = width;
    entry.canvas.height = height;
  }

  destroy(entry: CanvasEntry): void {
    if (entry.canvas === null) throw new Error('Canvas is not specified');
    entry.canvas.width = 0;
    entry.canvas.height = 0;
    entry.canvas = null;
    entry.context = null;
  }
}

export { createCanvas };
export type { Canvas };
