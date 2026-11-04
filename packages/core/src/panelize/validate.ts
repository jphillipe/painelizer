/**
 * Validações do painel (S10): avisos que nunca interrompem a geração.
 *
 * Rodam sobre o painel pronto, depois das regras de framing, e entram em `Panel.warnings` depois dos
 * avisos da parede e das aberturas. Cada aviso tem `code` e `message` (docs/01-escopo-v1.md: validações
 * são avisos, não erros; geometria impossível continua sendo `RangeError` nas regras).
 *
 * - `OPENING_NEAR_CORNER`: borda da zona de uma abertura (face externa do king) a menos de 1.5" de uma
 *   ponta da parede. O stud de ponta some (sobrepõe a zona) e sobra uma fresta sem stud. Folga 0 é
 *   normal: o king vira o stud de ponta.
 * - `STUDS_OVERLAP`: duas peças verticais ocupando o mesmo trecho de x na mesma faixa de y (encostar
 *   não conta). Hoje só acontece entre a última marca de layout e o stud de fechamento, quando o
 *   comprimento da parede cai entre 129.5" e 131" a 16" OC (docs/04-decisoes.md, 2026-09-28):
 *   `layoutStuds` mantém os dois e a fábrica decide.
 * - `STUD_HEIGHT_ABOVE_LIMIT`: comprimento do stud acima do máximo da Tabela R602.3(5) (R602.3.1):
 *   10' em parede portante; 14' (2x4) e 20' (2x6) em parede não portante. Acima disso, projeto
 *   estrutural.
 * - `FIRE_BLOCKING_REQUIRED`: cavidade contínua (entre bottom plate e top plate) acima de 120"
 *   (R302.11, P11): a fábrica coloca o bloqueio horizontal; o motor ainda não o desenha.
 *
 * "Header fora da tabela" não é aviso: sem header não há geometria, então `rules/openingHeader.ts`
 * lança `Error` (docs/04-decisoes.md, 2026-10-05).
 */

import { studLengthFor, type Config } from '../config';
import { EPS } from '../eps';
import { span } from '../geom';
import type { Panel } from '../panel';
import type { WallSection } from '../sections';
import type { Wall } from '../wall';
import { warning, type Warning } from '../messages';
import { openingZone } from '../rules/openings';

/** Folga mínima entre a zona da abertura e a ponta da parede para caber o stud de ponta. */
const MIN_CORNER_GAP = 1.5;

/** Altura máxima de stud em parede portante, Tabela R602.3(5): 10'. */
const MAX_STUD_LENGTH_BEARING = 120;

/** Altura máxima de stud em parede não portante, Tabela R602.3(5): 2x4 14', 2x6 20'. */
const MAX_STUD_LENGTH_NONBEARING: Readonly<Record<WallSection, number>> = {
  '2x4': 168,
  '2x6': 240,
};

/** Cavidade contínua acima disto exige fire blocking horizontal (R302.11; P11). */
const MAX_CAVITY_WITHOUT_FIRE_BLOCKING = 120;

/**
 * Avisos de validação do painel. `wall.openings` deve vir com `jackStuds` já resolvido (como em
 * `panelizeWall`), porque a largura da zona depende dele.
 */
export function validatePanel(panel: Panel, wall: Wall, config: Config): Warning[] {
  return [
    ...openingsNearCorner(wall, config),
    ...overlappingStuds(panel, wall),
    ...studHeight(wall, config),
    ...fireBlocking(wall, config),
  ];
}

function openingsNearCorner(wall: Wall, config: Config): Warning[] {
  const warnings: Warning[] = [];
  for (const o of wall.openings) {
    const zone = openingZone(o, config.studThickness);
    const gaps: Array<['start' | 'end', number]> = [
      ['start', zone.start],
      ['end', wall.length - zone.end],
    ];
    for (const [end, gap] of gaps) {
      if (gap > EPS && gap < MIN_CORNER_GAP - EPS) {
        warnings.push(warning('OPENING_NEAR_CORNER', { wallId: wall.id, openingId: o.id }, { gap, end, min: MIN_CORNER_GAP }));
      }
    }
  }
  return warnings;
}

function overlappingStuds(panel: Panel, wall: Wall): Warning[] {
  const vertical = panel.members.filter((m) => m.orientation === 'vertical');
  const warnings: Warning[] = [];
  for (let i = 0; i < vertical.length; i++) {
    for (let j = i + 1; j < vertical.length; j++) {
      const a = vertical[i]!;
      const b = vertical[j]!;
      // Largura real de cada peça: o stud flat do canto California ocupa a profundidade da seção (S14).
      const sa = span(a);
      const sb = span(b);
      const xOverlap = Math.min(sa.hi, sb.hi) - Math.max(sa.lo, sb.lo);
      const yOverlap = Math.min(a.y + a.length, b.y + b.length) - Math.max(a.y, b.y);
      if (xOverlap > EPS && yOverlap > EPS) {
        warnings.push(
          warning('STUDS_OVERLAP', { wallId: wall.id }, { aRole: a.role, aX: a.x, bRole: b.role, bX: b.x, overlap: xOverlap }),
        );
      }
    }
  }
  return warnings;
}

function studHeight(wall: Wall, config: Config): Warning[] {
  const studLength = studLengthFor(wall, config);
  const limit = wall.bearing ? MAX_STUD_LENGTH_BEARING : MAX_STUD_LENGTH_NONBEARING[wall.section];
  if (studLength <= limit + EPS) return [];
  return [warning('STUD_HEIGHT_ABOVE_LIMIT', { wallId: wall.id }, { studLength, limit, bearing: wall.bearing, section: wall.section })];
}

function fireBlocking(wall: Wall, config: Config): Warning[] {
  const cavity = studLengthFor(wall, config);
  if (cavity <= MAX_CAVITY_WITHOUT_FIRE_BLOCKING + EPS) return [];
  return [warning('FIRE_BLOCKING_REQUIRED', { wallId: wall.id }, { cavity, limit: MAX_CAVITY_WITHOUT_FIRE_BLOCKING })];
}
