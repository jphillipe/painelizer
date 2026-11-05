/**
 * Ligações do painel para a folha e a planta (S39): o `Panel` não via as ligações (moram em `Wall.joints` e
 * `WallFrame.connections`). Aqui elas viram `Panel.ends` (canto, T, junta de painéis em cada ponta) e `Panel.tees`
 * (paredes que encostam em T ao longo do painel), com a montagem que o motor usou. Nada aqui muda peça: é o mesmo
 * `wall.joints` que `rules/corners.ts` usa para montar canto, T e laps.
 *
 * Em `splitWall`, cada trecho já traz os seus `joints` (pontas da parede só no primeiro/último, `kind: 'panel'` nas
 * juntas, T do trecho com x do painel), e `framePanel` chama estas funções com o trecho.
 */

import type { Config } from '../config';
import type { Panel, PanelEnd, PanelTee } from '../panel';
import type { EndJoint, Wall } from '../wall';

/** Uma ponta do trecho como a folha a mostra (sem os cortes da double top, que são geometria). */
function panelEnd(j: EndJoint, config: Pick<Config, 'corner'>): PanelEnd {
  switch (j.kind) {
    case 'corner':
      return {
        kind: 'corner',
        ...(j.wallId === undefined ? {} : { wallId: j.wallId }),
        through: j.through,
        otherThickness: j.otherThickness,
        ...(j.through ? { style: config.corner ?? 'california' } : {}),
        ...(j.concave === true ? { concave: true as const } : {}),
      };
    case 'tee':
      return {
        kind: 'tee',
        ...(j.wallId === undefined ? {} : { wallId: j.wallId }),
        otherThickness: j.otherThickness,
        ...(j.cross === true ? { cross: true as const } : {}),
      };
    case 'panel':
      return { kind: 'panel', ...(j.panelId === undefined ? {} : { panelId: j.panelId }), lap: j.lap };
  }
}

/** As pontas ligadas do trecho; `undefined` quando as duas são livres (parede solta de um painel só). */
export function panelEnds(wall: Pick<Wall, 'joints'>, config: Pick<Config, 'corner'>): Panel['ends'] {
  const start = wall.joints?.start;
  const end = wall.joints?.end;
  if (start === undefined && end === undefined) return undefined;
  return {
    ...(start === undefined ? {} : { start: panelEnd(start, config) }),
    ...(end === undefined ? {} : { end: panelEnd(end, config) }),
  };
}

/**
 * Os T do trecho, por x crescente, com a montagem: `config.tee` (default `'ladder'`, P5) na faixa que recebeu peças,
 * `'none'` na que caiu em zona de abertura (`teeConflicts` a tirou; aviso `OPENING_AT_TEE`).
 *
 * @param framed por T de `wall.joints.tees`, na mesma ordem: a faixa recebeu peças de T
 */
export function panelTees(wall: Pick<Wall, 'joints'>, config: Pick<Config, 'tee'>, framed: readonly boolean[]): PanelTee[] {
  const style = config.tee ?? 'ladder';
  return (wall.joints?.tees ?? [])
    .map((t, i): PanelTee => ({
      x: t.x,
      width: t.width,
      ...(t.wallId === undefined ? {} : { wallId: t.wallId }),
      ...(t.sides === 2 ? { sides: 2 as const } : {}),
      ...(t.otherWallId === undefined ? {} : { otherWallId: t.otherWallId }),
      framing: framed[i] === false ? 'none' : style,
    }))
    .sort((a, b) => a.x - b.x);
}
