/**
 * Lap da double top plate entre painéis da mesma parede (S15, hipótese P23).
 *
 * Regra (`lapEnd`): a double top do painel i avança `lap` (48") sobre o seguinte e a do i+1 começa aí. Se o
 * fim do avanço cair dentro de um header ou de uma faixa de T, encurta para `minLap`; se ainda cair, vai até o
 * primeiro apoio depois do obstáculo — marca de layout ou centro de stud/king de altura inteira (P37: o king
 * logo depois do header, em vez de pular o header seguinte). O avanço nunca passa da quebra seguinte (ou do fim
 * da double top da parede).
 */

import type { PanelConfig } from '../config';
import { EPS } from '../eps';
import { EngineError } from '../messages';

/** Trecho em x que o fim do lap não pode cortar: um header (em `x`) ou a faixa de um T (da parede `wallId`). */
export type LapObstacle = { lo: number; hi: number } & ({ kind: 'header'; x: number } | { kind: 'tee'; wallId?: string });

/**
 * x (da parede) em que a double top do painel que termina em `b` acaba — e a do seguinte começa.
 *
 * @param limit    até onde o lap pode ir: a quebra seguinte, ou o fim da double top da parede
 * @param marks    apoios em x da parede, crescentes: marcas de layout e centros de `supportCenters`
 * @throws RangeError nenhum fim de lap possível (painel seguinte curto demais ou obstáculo até o fim)
 */
export function lapEnd(
  b: number,
  limit: number,
  cfg: PanelConfig,
  obstacles: readonly LapObstacle[],
  marks: readonly number[],
): number {
  const inside = (e: number): LapObstacle | undefined => obstacles.find((o) => e > o.lo + EPS && e < o.hi - EPS);
  const ok = (e: number): boolean => e > b + EPS && e <= limit + EPS && inside(e) === undefined;

  const full = b + cfg.lap;
  if (ok(full)) return full;
  const short = b + cfg.minLap;
  if (ok(short)) return short;
  const blocker = inside(full) ?? inside(short);
  if (blocker !== undefined) {
    for (const m of marks) {
      if (m >= blocker.hi - EPS && ok(m)) return m;
    }
  }
  throw new EngineError(
    'LAP_NO_ROOM',
    {},
    blocker === undefined
      ? { at: b, limit, minLap: cfg.minLap }
      : {
          at: b,
          limit,
          minLap: cfg.minLap,
          blocker: blocker.kind,
          lo: blocker.lo,
          hi: blocker.hi,
          ...(blocker.kind === 'header' ? { blockerX: blocker.x } : blocker.wallId === undefined ? {} : { teeWallId: blocker.wallId }),
        },
  );
}
