/**
 * Planta do palco do passo 01 (2026-10-23): a casa 28' × 40' da visão, em polegadas, desenhada em planta e "lida"
 * por uma varredura de cima para baixo — cada parede acende quando a linha passa, depois aparecem as quebras e os
 * ids dos painéis. Só geometria; o componente desenha e o CSS anima. Puro, para testar.
 */

export interface SketchWall {
  id: string;
  /** Retângulo da parede no SVG (px). */
  x: number;
  y: number;
  w: number;
  h: number;
  horizontal: boolean;
  /** Atraso (s) para a parede horizontal acender quando a varredura passa por ela. Verticais acendem com `clip-path`. */
  delay: number;
}

export interface SketchRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SketchLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SketchTag {
  id: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

export interface PlanSketch {
  width: number;
  depth: number;
  /** Duração (s) da varredura de cima para baixo. */
  sweep: number;
  walls: SketchWall[];
  openings: SketchRect[];
  breaks: SketchLine[];
  tags: SketchTag[];
}

/** Polegadas: 40' × 28'; a interna W05 tem 26'-6". Espessura só de desenho. */
const W = 480;
const D = 336;
const W05 = 318;
const T = 5;
export const SWEEP_SECONDS = 3.2;

export function planSketch(scale = 1.2): PlanSketch {
  const s = (v: number) => v * scale;
  const width = s(W);
  const depth = s(D);
  const h = (id: string, y: number, len: number): SketchWall => ({ id, x: 0, y: s(y) - T / 2, w: s(len), h: T, horizontal: true, delay: (y / D) * SWEEP_SECONDS });
  const v = (id: string, x: number): SketchWall => ({ id, x: s(x) - T / 2, y: 0, w: T, h: depth, horizontal: false, delay: 0 });
  const walls = [h('W03', 0, W), h('W05', 168, W05), h('W01', D, W), v('W04', 0), v('W02', W)];
  // Aberturas (RO) como vãos: posição ao longo da parede a partir do início dela, largura.
  const onH = (y: number, from: number, len: number): SketchRect => ({ x: s(from), y: s(y) - T, w: s(len), h: 2 * T });
  const onV = (x: number, from: number, len: number): SketchRect => ({ x: s(x) - T, y: s(from), w: 2 * T, h: s(len) });
  const openings = [
    onH(D, 168, 36), // W01: porta a 14', 36"
    onH(D, 336, 36), // W01: janela a 28'
    onV(W, D - 72 - 36, 36), // W02: janela a 6' do canto de baixo
    onV(W, D - 216 - 36, 36), // W02: janela a 18'
    onH(0, W - 240 - 72, 72), // W03: porta de correr 6' a 20' do canto direito
    onV(0, 96, 36), // W04: janela a 8'
    onH(168, 120, 32), // W05: porta a 10'
  ];
  // Quebras em painéis nas marcas de 12' e 24' (múltiplos de 48").
  const tick = 14;
  const breaks: SketchLine[] = [
    { x1: s(144), y1: depth - tick, x2: s(144), y2: depth + tick },
    { x1: s(288), y1: depth - tick, x2: s(288), y2: depth + tick },
    { x1: s(144), y1: -tick, x2: s(144), y2: tick },
    { x1: s(288), y1: -tick, x2: s(288), y2: tick },
    { x1: width - tick, y1: s(D - 144), x2: width + tick, y2: s(D - 144) },
    { x1: -tick, y1: s(144), x2: tick, y2: s(144) },
  ];
  const tags: SketchTag[] = [
    { id: '1-W03-P1', x: s(72), y: -18, anchor: 'middle' },
    { id: '1-W03-P2', x: s(216), y: -18, anchor: 'middle' },
    { id: '1-W03-P3', x: s(384), y: -18, anchor: 'middle' },
    { id: '1-W01-P1', x: s(72), y: depth + 30, anchor: 'middle' },
    { id: '1-W01-P2', x: s(216), y: depth + 30, anchor: 'middle' },
    { id: '1-W01-P3', x: s(384), y: depth + 30, anchor: 'middle' },
    { id: '1-W02-P1', x: width + 18, y: s(D - 72), anchor: 'start' },
    { id: '1-W02-P2', x: width + 18, y: s(72), anchor: 'start' },
    { id: '1-W04-P1', x: -18, y: s(D - 96), anchor: 'end' },
    { id: '1-W04-P2', x: -18, y: s(72), anchor: 'end' },
    { id: '1-W05-P1', x: s(72), y: s(168) - 12, anchor: 'middle' },
    { id: '1-W05-P2', x: s(230), y: s(168) - 12, anchor: 'middle' },
  ];
  return { width, depth, sweep: SWEEP_SECONDS, walls, openings, breaks, tags };
}
