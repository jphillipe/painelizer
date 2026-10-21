/**
 * O que o motor exige do humano para este projeto (S21.4): calculado do draft, antes de o motor rodar, para o
 * card "Before you review" pedir tudo de uma vez e com o rótulo certo (obrigatório × opcional). Espelha as
 * regras de `core/rules/openingHeader.ts`: parede portante com abertura sem header próprio pega o header na
 * tabela IRC, e a tabela precisa de `config.building` (neve + largura) e de `wall.floorsSupported`.
 */

import type { ProjectDraft } from './draft';

export type RequiredField = 'wallHeight' | 'snow' | 'width' | 'floors' | 'floorSpan';

export interface ProjectDataNeeds {
  /** Paredes sem altura. */
  wallsWithoutHeight: string[];
  /** Paredes portantes com abertura sem header próprio (nem `header` nem `headerMark`): header pela tabela. */
  tableHeaderWalls: string[];
  /** Dessas, as sem `floorsSupported`. */
  wallsWithoutFloors: string[];
  /**
   * Dessas, as sem `floorSpan` e com pavimentos acima (ou sem saber): sem ele a tabela usa o pior caso (menor
   * vão entre center-bearing e clear span) e o header costuma sair da tabela — na prática, obrigatório.
   */
  wallsWithoutFloorSpan: string[];
  /** A tabela precisa de neve e largura e o projeto não tem (`config.building` só existe com os dois). */
  buildingMissing: boolean;
  required: RequiredField[];
}

export function projectDataNeeds(draft: ProjectDraft): ProjectDataNeeds {
  const wallsWithoutHeight = draft.walls.filter((w) => w.height === undefined).map((w) => w.id);
  const tableHeaderWalls = draft.walls
    .filter((w) => w.bearing === true && w.openings.some((o) => o.header === undefined && o.headerMark === undefined))
    .map((w) => w.id);
  const wallsWithoutFloors = draft.walls.filter((w) => tableHeaderWalls.includes(w.id) && w.floorsSupported === undefined).map((w) => w.id);
  const wallsWithoutFloorSpan = draft.walls.filter((w) => tableHeaderWalls.includes(w.id) && w.floorSpan === undefined && w.floorsSupported !== 0).map((w) => w.id);
  const b = draft.config.building;
  const buildingMissing = tableHeaderWalls.length > 0 && (b === undefined || b.groundSnowLoad === undefined || b.buildingWidth === undefined);
  const required: RequiredField[] = [];
  if (wallsWithoutHeight.length > 0) required.push('wallHeight');
  if (buildingMissing) required.push('snow', 'width');
  if (wallsWithoutFloors.length > 0) required.push('floors');
  if (wallsWithoutFloorSpan.length > 0) required.push('floorSpan');
  return { wallsWithoutHeight, tableHeaderWalls, wallsWithoutFloors, wallsWithoutFloorSpan, buildingMissing, required };
}
