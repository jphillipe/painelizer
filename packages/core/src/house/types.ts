/**
 * Tipos da casa em planta (Fase 3, S13).
 *
 * Convenções (docs/02-framing.md, docs/04-decisoes.md 2026-10-13; hipótese P21):
 * - Coordenadas de planta em polegadas decimais, eixos x/y quaisquer (a origem é do arquiteto).
 * - Uma parede é o segmento `start` → `end` no **eixo** da parede (centro da espessura), só paralela a um
 *   dos eixos da planta. A mesma regra vale para parede externa e interna.
 * - `openings[].offset` e `extraStuds[].x` são medidos do ponto `start` ao longo do eixo; o motor converte
 *   para o x do painel (que começa na plate, não no ponto). `layoutOrigin` não entra: a planta o deriva.
 * - No canto, a parede que **atravessa** leva a plate até a face externa da outra; a que **encosta** para na
 *   face interna. Qual atravessa: `ends` declarado > a mais longa > a primeira do arquivo.
 */

import type { Wall } from '../types';

/** Ponto em planta, polegadas. */
export interface Point {
  x: number;
  y: number;
}

/** Papel de uma ponta num canto: `through` leva a plate até a face externa da outra; `butt` encosta nela. */
export type EndRule = 'through' | 'butt';

/** Uma das duas pontas de uma parede. */
export type WallEnd = 'start' | 'end';

/**
 * Parede como a planta a descreve. `length`, `layoutOrigin` e `joints` são derivados pelo motor da casa
 * (`frameWalls`); os demais campos de `Wall` valem como estão.
 */
export interface HouseWall extends Omit<Wall, 'length' | 'layoutOrigin' | 'joints'> {
  start: Point;
  end: Point;
  /** Pavimento (1 = térreo). Ausente = 1. Só identifica; a numeração dos painéis é da S16. */
  level?: number;
  /** Papel declarado de cada ponta num canto. Ausente = regra da mais longa (P21). */
  ends?: { start?: EndRule; end?: EndRule };
}

export interface House {
  walls: HouseWall[];
}
