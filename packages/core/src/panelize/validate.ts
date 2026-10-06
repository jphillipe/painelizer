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

import type { Config, Member, Panel, Wall, WallSection, Warning } from '../types';
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

/** Folga numérica para comparações de geometria. */
const EPS = 1e-9;

/**
 * Avisos de validação do painel. `wall.openings` deve vir com `jackStuds` já resolvido (como em
 * `panelizeWall`), porque a largura da zona depende dele.
 */
export function validatePanel(panel: Panel, wall: Wall, config: Config): Warning[] {
  return [
    ...openingsNearCorner(wall, config),
    ...overlappingStuds(panel, wall, config),
    ...studHeight(wall, config),
    ...fireBlocking(wall, config),
  ];
}

function openingsNearCorner(wall: Wall, config: Config): Warning[] {
  const warnings: Warning[] = [];
  for (const o of wall.openings) {
    const zone = openingZone(o, config.studThickness);
    const gaps: Array<[string, number]> = [
      ['início', zone.start],
      ['fim', wall.length - zone.end],
    ];
    for (const [end, gap] of gaps) {
      if (gap > EPS && gap < MIN_CORNER_GAP - EPS) {
        warnings.push({
          code: 'OPENING_NEAR_CORNER',
          message:
            `parede ${wall.id}, abertura ${o.id}: king a ${gap}" do ${end} da parede — não cabe o stud de ` +
            `ponta (mínimo ${MIN_CORNER_GAP}"); encoste a abertura no canto ou afaste-a`,
        });
      }
    }
  }
  return warnings;
}

function overlappingStuds(panel: Panel, wall: Wall, config: Config): Warning[] {
  const t = config.studThickness;
  const vertical = panel.members.filter((m) => m.orientation === 'vertical');
  const warnings: Warning[] = [];
  for (let i = 0; i < vertical.length; i++) {
    for (let j = i + 1; j < vertical.length; j++) {
      const a = vertical[i]!;
      const b = vertical[j]!;
      const xOverlap = Math.min(a.x + t, b.x + t) - Math.max(a.x, b.x);
      const yOverlap = Math.min(a.y + a.length, b.y + b.length) - Math.max(a.y, b.y);
      if (xOverlap > EPS && yOverlap > EPS) {
        warnings.push({
          code: 'STUDS_OVERLAP',
          message:
            `parede ${wall.id}: ${describe(a)} e ${describe(b)} se sobrepõem em ${xOverlap}" — ` +
            `a fábrica decide se dobra o stud ou omite a marca`,
        });
      }
    }
  }
  return warnings;
}

function describe(m: Member): string {
  return `${m.role} em x=${m.x}`;
}

function studHeight(wall: Wall, config: Config): Warning[] {
  const studLength = wall.height - 3 * config.plateThickness;
  const limit = wall.bearing ? MAX_STUD_LENGTH_BEARING : MAX_STUD_LENGTH_NONBEARING[wall.section];
  if (studLength <= limit + EPS) return [];
  return [
    {
      code: 'STUD_HEIGHT_ABOVE_LIMIT',
      message:
        `parede ${wall.id}: stud de ${studLength}" passa do máximo de ${limit}" para parede ` +
        `${wall.bearing ? 'portante' : 'não portante'} ${wall.section} (Tabela R602.3(5)) — exige projeto estrutural`,
    },
  ];
}

function fireBlocking(wall: Wall, config: Config): Warning[] {
  const cavity = wall.height - 3 * config.plateThickness;
  if (cavity <= MAX_CAVITY_WITHOUT_FIRE_BLOCKING + EPS) return [];
  return [
    {
      code: 'FIRE_BLOCKING_REQUIRED',
      message:
        `parede ${wall.id}: cavidade contínua de ${cavity}" passa de ${MAX_CAVITY_WITHOUT_FIRE_BLOCKING}" — ` +
        `exige fire blocking horizontal (R302.11), que o painel ainda não desenha`,
    },
  ];
}
