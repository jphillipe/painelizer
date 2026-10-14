/**
 * Ligações entre paredes em planta: canto, T ou ponta livre (S13, hipótese P21).
 *
 * Regras (docs/02-framing.md):
 * - Tudo é decidido no **cruzamento dos eixos** de duas paredes perpendiculares, nunca no ponto digitado:
 *   o arquiteto pode ter cotado a ponta na face da outra parede em vez de no eixo. A ponta "está" num
 *   cruzamento quando dista dele no máximo `t_outra/2 + tolerance` ao longo do próprio eixo.
 * - `corner`: ponta de uma no cruzamento e ponta da outra também. `tee`: ponta de uma no cruzamento e o
 *   cruzamento no interior da outra (além da faixa de ponta). Cruzamento no interior das duas: as paredes
 *   se cruzam — erro. Nada em nenhuma ponta: `free`.
 * - Paredes paralelas cujos corpos se sobrepõem (eixos a menos de `(t_a + t_b)/2` e trechos que se
 *   sobrepõem) são erro: é a mesma parede escrita duas vezes. Colineares ponta a ponta são duas paredes livres.
 * - Uma ponta com duas ligações (três pontas num ponto, canto e T no mesmo lugar) é erro.
 * - No canto, quem atravessa: `ends` declarado em qualquer das duas (as duas iguais é erro) > a mais longa
 *   (entre os pontos) > a primeira do arquivo.
 */

import type { EndRule, HouseWall, Point, WallEnd } from './types';
import { across, along, axisOf, crossing, type Axis } from './axis';

/** Folga, em polegadas, para a ponta digitada "estar" no cruzamento dos eixos. */
export const DEFAULT_TOLERANCE = 0.5;

const EPS = 1e-9;

export type Connection =
  | { kind: 'free' }
  | {
      kind: 'corner';
      /** A outra parede do canto. */
      wallId: string;
      /** Esta parede atravessa (plate até a face externa da outra) ou encosta. */
      through: boolean;
      /** Cruzamento dos eixos, em planta. */
      at: Point;
    }
  | {
      kind: 'tee';
      /** Parede em cujo interior esta ponta encosta. */
      wallId: string;
      at: Point;
    };

/** Parede que encosta em T no interior desta. */
export interface TeeOn {
  wallId: string;
  /** Cruzamento dos eixos, em planta. */
  at: Point;
}

export interface WallConnections {
  wallId: string;
  start: Connection;
  end: Connection;
  /** Paredes que encostam em T nesta, na ordem em que aparecem no arquivo. */
  tees: TeeOn[];
}

/** Onde um cruzamento cai em relação a um eixo. */
type Hit = WallEnd | 'inside' | 'outside';

function hit(a: Axis, s: number, slack: number): Hit {
  const atStart = Math.abs(s) <= slack + EPS;
  const atEnd = Math.abs(s - a.length) <= slack + EPS;
  if (atStart && atEnd) return Math.abs(s) <= Math.abs(s - a.length) ? 'start' : 'end';
  if (atStart) return 'start';
  if (atEnd) return 'end';
  if (s > slack && s < a.length - slack) return 'inside';
  return 'outside';
}

/**
 * Ligações de cada ponta de cada parede, na ordem do arquivo.
 *
 * @param tolerance folga além de `t_outra/2` para a ponta estar no cruzamento (default 0.5")
 * @throws RangeError ids duplicados, parede fora dos eixos ou de comprimento zero, paredes que se cruzam
 *                    ou se sobrepõem, ponta com mais de uma ligação, `ends` em conflito
 */
export function findConnections(
  walls: readonly HouseWall[],
  tolerance: number = DEFAULT_TOLERANCE,
): WallConnections[] {
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new RangeError(`findConnections: tolerance deve ser ≥ 0 (recebido ${tolerance})`);
  }
  const axes = walls.map(axisOf);
  const seen = new Set<string>();
  for (const a of axes) {
    if (seen.has(a.id)) throw new RangeError(`parede ${a.id}: id duplicado`);
    seen.add(a.id);
  }

  const out: WallConnections[] = axes.map((a) => ({
    wallId: a.id,
    start: { kind: 'free' },
    end: { kind: 'free' },
    tees: [],
  }));

  const attach = (i: number, end: WallEnd, conn: Connection): void => {
    const cur = out[i]![end];
    if (cur.kind !== 'free') {
      const other = conn.kind === 'free' ? '?' : conn.wallId;
      const prev = cur.wallId;
      throw new RangeError(
        `parede ${axes[i]!.id}: ponta ${end} ligada a duas paredes (${prev} e ${other}) — ` +
          'três pontas no mesmo ponto ou canto e T no mesmo lugar',
      );
    }
    out[i]![end] = conn;
  };

  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) {
      const a = axes[i]!;
      const b = axes[j]!;
      if (a.dir === b.dir) {
        checkParallel(a, b, tolerance);
        continue;
      }
      const x = crossing(a, b);
      const sa = along(a, x);
      const sb = along(b, x);
      const ha = hit(a, sa, b.thickness / 2 + tolerance);
      const hb = hit(b, sb, a.thickness / 2 + tolerance);
      const aEnd = ha === 'start' || ha === 'end';
      const bEnd = hb === 'start' || hb === 'end';

      if (aEnd && bEnd) {
        const through = throughAt(a, ha as WallEnd, b, hb as WallEnd);
        attach(i, ha as WallEnd, { kind: 'corner', wallId: b.id, through, at: x });
        attach(j, hb as WallEnd, { kind: 'corner', wallId: a.id, through: !through, at: x });
      } else if (aEnd && hb === 'inside') {
        attach(i, ha as WallEnd, { kind: 'tee', wallId: b.id, at: x });
        out[j]!.tees.push({ wallId: a.id, at: x });
      } else if (bEnd && ha === 'inside') {
        attach(j, hb as WallEnd, { kind: 'tee', wallId: a.id, at: x });
        out[i]!.tees.push({ wallId: b.id, at: x });
      } else if (ha === 'inside' && hb === 'inside') {
        throw new RangeError(
          `paredes ${a.id} e ${b.id} se cruzam em (${x.x}, ${x.y}) — divida uma delas no cruzamento`,
        );
      }
      // Demais combinações: os eixos se cruzam fora de uma das paredes; não há ligação.
    }
  }
  return out;
}

/** Paredes paralelas: erro se os corpos se sobrepõem. Colineares que só se encostam ponta a ponta são
 * duas paredes livres em sequência (a planta pode partir uma parede onde a seção muda). */
function checkParallel(a: Axis, b: Axis, tolerance: number): void {
  const gapAcross = across(a, b.start);
  if (gapAcross >= (a.thickness + b.thickness) / 2 - tolerance - EPS) return;
  const a0 = 0;
  const a1 = a.length;
  const b0 = Math.min(along(a, b.start), along(a, b.end));
  const b1 = Math.max(along(a, b.start), along(a, b.end));
  const overlap = Math.min(a1, b1) - Math.max(a0, b0);
  if (overlap > tolerance + EPS) {
    throw new RangeError(`paredes ${a.id} e ${b.id} se sobrepõem em ${overlap}" — é a mesma parede duas vezes?`);
  }
}

/** `a` atravessa o canto? `ends` declarado > a mais longa > a primeira do arquivo (`a`). */
function throughAt(a: Axis, aEnd: WallEnd, b: Axis, bEnd: WallEnd): boolean {
  const ra: EndRule | undefined = a.wall.ends?.[aEnd];
  const rb: EndRule | undefined = b.wall.ends?.[bEnd];
  if (ra !== undefined && rb !== undefined && ra === rb) {
    throw new RangeError(
      `paredes ${a.id} (${aEnd}) e ${b.id} (${bEnd}): as duas declaram ends "${ra}" no mesmo canto`,
    );
  }
  if (ra !== undefined) return ra === 'through';
  if (rb !== undefined) return rb === 'butt';
  return a.length >= b.length - EPS;
}
