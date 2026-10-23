/**
 * Parede do palco do login (S22, pedido do humano em 2026-10-23): elevação de 18' com janela que se monta peça a
 * peça e depois se divide em dois painéis na marca de 12'. Geometria em polegadas (y para cima), convertida para
 * o SVG por `toSvg`. Puro; o componente só desenha. Mesma ideia do `WallSketch` da espera da extração.
 */

export type SketchKind = 'plate' | 'stud' | 'king' | 'jack' | 'header' | 'sill' | 'cripple';

export interface SketchPiece {
  /** Polegadas, canto inferior esquerdo, y a partir da base da bottom plate. */
  x: number;
  y: number;
  w: number;
  h: number;
  kind: SketchKind;
  /** De que lado da quebra a peça fica (as metades se afastam no fim do loop). */
  half: 'left' | 'right';
  /** Ordem de montagem (atraso da animação = i × passo). */
  i: number;
}

export const SKETCH = {
  length: 216,
  height: 94,
  plate: 1.5,
  /** Quebra em painéis na marca de 12' (múltiplo de 48"). */
  breakAt: 144,
  /** O lap da double top plate avança 8" sobre o painel seguinte (ilustrativo; a regra real está no motor, P23). */
  lap: 8,
  ro: { left: 88, right: 136, sill: 36, head: 80 },
  headerDepth: 9.25,
  scale: 3,
} as const;

export function sketchPieces(): SketchPiece[] {
  const { length, height, plate, breakAt, lap, ro, headerDepth } = SKETCH;
  const studTop = height - 2 * plate;
  const studH = studTop - plate;
  const pieces: SketchPiece[] = [];
  let i = 0;
  // O lado é pelo centro da peça: o lap da double top começa antes da quebra mas pertence ao painel da direita.
  const add = (p: Omit<SketchPiece, 'i' | 'half'>): void => {
    pieces.push({ ...p, half: p.x + p.w / 2 < breakAt ? 'left' : 'right', i: i++ });
  };
  const stud = (x: number, kind: SketchKind = 'stud', y: number = plate, h: number = studH): void => add({ x, y, w: plate, h, kind });

  // Plates da metade esquerda; a double top para antes da quebra, deixando o lap para a direita.
  add({ x: 0, y: 0, w: breakAt, h: plate, kind: 'plate' });
  add({ x: 0, y: height - 2 * plate, w: breakAt, h: plate, kind: 'plate' });
  add({ x: 0, y: height - plate, w: breakAt - lap, h: plate, kind: 'plate' });
  // Studs de layout à esquerda da janela (marcas de 16", stud centrado: borda em marca − 0.75).
  for (const x of [0, 15.25, 31.25, 47.25, 63.25, 79.25]) stud(x);
  // Plates da metade direita (a double top começa no lap).
  add({ x: breakAt, y: 0, w: length - breakAt, h: plate, kind: 'plate' });
  add({ x: breakAt, y: height - 2 * plate, w: length - breakAt, h: plate, kind: 'plate' });
  add({ x: breakAt - lap, y: height - plate, w: length - breakAt + lap, h: plate, kind: 'plate' });
  // Studs à direita da janela: último da esquerda encostado na quebra, primeiro da direita na quebra.
  for (const x of [breakAt - plate, breakAt, 159.25, 175.25, 191.25, 207.25, length - plate]) stud(x);
  // Janela: kings, jacks, header, cripples acima, sill, cripples abaixo.
  stud(ro.left - 2 * plate, 'king');
  stud(ro.right, 'king');
  stud(ro.left - plate, 'jack', plate, ro.head - plate);
  stud(ro.right - plate, 'jack', plate, ro.head - plate);
  add({ x: ro.left - plate, y: ro.head, w: ro.right - ro.left + 2 * plate, h: headerDepth, kind: 'header' });
  for (const x of [95.25, 111.25, 127.25]) stud(x, 'cripple', ro.head + headerDepth, studTop - ro.head - headerDepth);
  add({ x: ro.left, y: ro.sill - plate, w: ro.right - ro.left, h: plate, kind: 'sill' });
  for (const x of [95.25, 111.25, 127.25]) stud(x, 'cripple', plate, ro.sill - 2 * plate);
  return pieces;
}

export interface SvgRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Polegadas → SVG (y para baixo, `scale` px por polegada). */
export function toSvg(p: Pick<SketchPiece, 'x' | 'y' | 'w' | 'h'>, scale = SKETCH.scale, height = SKETCH.height): SvgRect {
  return { x: p.x * scale, y: (height - p.y - p.h) * scale, width: p.w * scale, height: p.h * scale };
}
