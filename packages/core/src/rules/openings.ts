/**
 * Framing de abertura (janela) em parede reta.
 *
 * Regras (docs/02-framing.md, exemplo resolvido):
 * - Zona = [offset − (kings + jacks)·t, offset + roughWidth + (kings + jacks)·t]; com 1 king e 1 jack,
 *   RO ± 3". Kings encostados na borda externa da zona, jacks encostados no RO.
 * - Kings de altura cheia (como stud); jacks da bottom plate até a base do header.
 * - Base do header: `opening.headerHeight` (o projeto manda, P2); senão `config.headerHeight`;
 *   senão, encostada sob a top plate.
 *   Header apoia em todos os jacks: comprimento = roughWidth + 2·jacks·t.
 * - Topo do RO = base do header; base do RO = topo − roughHeight; sill deitado logo abaixo,
 *   mesma seção da parede, comprimento = roughWidth.
 * - Cripples nas marcas de layout que caem dentro do RO, exceto a marca colada ao jack (P3) —
 *   a mesma regra vale abaixo do sill e acima do header. Só entram se o vão for ≥ 1.5".
 *
 * Fora do escopo da S7 (lançam `Error`): porta e seção do header sem tabela (S8, S9).
 * Geometria impossível lança `RangeError`.
 */

import type { Config, Member, Opening, Wall } from '../types';
import { sectionDepth } from '../types';
import { layoutStuds } from './studs';

/** Vão mínimo para entrar cripple (acima do header ou abaixo do sill). */
const MIN_CRIPPLE_LENGTH = 1.5;

/** Folga numérica para comparações de geometria. */
const EPS = 1e-9;

export interface OpeningZone {
  /** x da borda esquerda do king mais externo à esquerda. */
  start: number;
  /** x da borda direita do king mais externo à direita. */
  end: number;
}

/** Número de kings e jacks de cada lado, validado. */
export function openingStudCounts(opening: Opening): { kings: number; jacks: number } {
  const kings = opening.kingStuds ?? 1;
  const jacks = opening.jackStuds ?? 1;
  for (const [name, n] of [
    ['kingStuds', kings],
    ['jackStuds', jacks],
  ] as const) {
    if (!Number.isInteger(n) || n < 1) {
      throw new RangeError(`abertura ${opening.id}: ${name} deve ser inteiro ≥ 1 (recebido ${n})`);
    }
  }
  return { kings, jacks };
}

/**
 * Faixa em x ocupada pela abertura com seus kings e jacks.
 *
 * @throws RangeError para medidas não finitas, RO ≤ 0 ou contagem de kings/jacks inválida
 */
export function openingZone(opening: Opening, studThickness: number): OpeningZone {
  const { offset, roughWidth, roughHeight } = opening;
  if (![offset, roughWidth, roughHeight, studThickness].every(Number.isFinite)) {
    throw new RangeError(`abertura ${opening.id}: medidas devem ser números finitos`);
  }
  if (roughWidth <= 0 || roughHeight <= 0) {
    throw new RangeError(`abertura ${opening.id}: RO deve ter largura e altura > 0`);
  }
  const { kings, jacks } = openingStudCounts(opening);
  const side = (kings + jacks) * studThickness;
  return { start: offset - side, end: offset + roughWidth + side };
}

/**
 * Peças da abertura: kings, jacks, header, sill e cripples.
 * Não remove studs de layout — isso é papel de `panelizeWall`, que conhece todas as zonas.
 *
 * @throws Error      porta (S8) ou `config.defaultHeaderSection`/`defaultHeaderPlies` ausentes (S9)
 * @throws RangeError zona fora da parede, header invadindo a top plate, sill abaixo da bottom plate
 */
export function framingForOpening(opening: Opening, wall: Wall, config: Config): Member[] {
  if (opening.type !== 'window') {
    throw new Error(
      `abertura ${opening.id}: tipo "${opening.type}" ainda não é suportado (porta chega na S8)`,
    );
  }
  const headerSection = config.defaultHeaderSection;
  const plies = config.defaultHeaderPlies;
  if (headerSection === undefined || plies === undefined) {
    throw new Error(
      `abertura ${opening.id}: config.defaultHeaderSection e config.defaultHeaderPlies são ` +
        'obrigatórios até a tabela de headers existir (S9)',
    );
  }

  const t = config.studThickness;
  const p = config.plateThickness;
  const { offset, roughWidth, roughHeight } = opening;
  const { kings, jacks } = openingStudCounts(opening);
  const zone = openingZone(opening, t);

  if (zone.start < -EPS || zone.end > wall.length + EPS) {
    throw new RangeError(
      `abertura ${opening.id}: zona [${zone.start}, ${zone.end}] (RO com kings e jacks) ` +
        `sai da parede de ${wall.length}"`,
    );
  }

  const topPlateY = wall.height - 2 * p;
  const headerDepth = sectionDepth(headerSection);
  const headerBase = opening.headerHeight ?? config.headerHeight ?? topPlateY - headerDepth;
  const headerTop = headerBase + headerDepth;
  if (headerTop > topPlateY + EPS) {
    throw new RangeError(
      `abertura ${opening.id}: header ${headerSection} com base em ${headerBase}" vai até ` +
        `${headerTop}", acima da top plate (${topPlateY}")`,
    );
  }

  const roBase = headerBase - roughHeight;
  const sillY = roBase - p;
  if (sillY < p - EPS) {
    throw new RangeError(
      `abertura ${opening.id}: base do RO em ${roBase}" não deixa espaço para o sill ` +
        `sobre a bottom plate (topo em ${p}")`,
    );
  }

  const vertical = { section: wall.section, orientation: 'vertical' as const };
  const members: Member[] = [];

  const studLength = wall.height - 3 * p;
  for (let i = 0; i < kings; i++) {
    members.push({ role: 'kingStud', ...vertical, length: studLength, x: zone.start + i * t, y: p });
    members.push({ role: 'kingStud', ...vertical, length: studLength, x: zone.end - (i + 1) * t, y: p });
  }

  const jackLength = headerBase - p;
  for (let i = 0; i < jacks; i++) {
    members.push({ role: 'jackStud', ...vertical, length: jackLength, x: offset - (i + 1) * t, y: p });
    members.push({ role: 'jackStud', ...vertical, length: jackLength, x: offset + roughWidth + i * t, y: p });
  }

  members.push({
    role: 'header',
    section: headerSection,
    length: roughWidth + 2 * jacks * t,
    x: offset - jacks * t,
    y: headerBase,
    orientation: 'horizontal',
    plies,
  });

  members.push({
    role: 'sill',
    section: wall.section,
    length: roughWidth,
    x: offset,
    y: sillY,
    orientation: 'horizontal',
  });

  // Marcas estritamente dentro do RO: a marca colada ao jack (x = offset, ou x + t = fim do RO)
  // e as que invadem o jack ficam de fora.
  const marks = layoutStuds(wall.length, config.studSpacing, t).filter(
    (x) => x > offset + EPS && x + t < offset + roughWidth - EPS,
  );

  const below = sillY - p;
  if (below >= MIN_CRIPPLE_LENGTH - EPS) {
    for (const x of marks) members.push({ role: 'cripple', ...vertical, length: below, x, y: p });
  }

  const above = topPlateY - headerTop;
  if (above >= MIN_CRIPPLE_LENGTH - EPS) {
    for (const x of marks) members.push({ role: 'cripple', ...vertical, length: above, x, y: headerTop });
  }

  return members;
}
