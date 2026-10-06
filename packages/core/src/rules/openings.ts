/**
 * Framing de abertura (janela e porta) em parede reta.
 *
 * Regras (docs/02-framing.md, exemplo resolvido):
 * - Zona = [offset − (kings + jacks)·t, offset + roughWidth + (kings + jacks)·t]; com 1 king e 1 jack,
 *   RO ± 3". Kings encostados na borda externa da zona, jacks encostados no RO.
 * - Kings de altura cheia (como stud); jacks da bottom plate até a base do header.
 * - Jacks de cada lado = os do header resolvido (`opening.jackStuds`, senão projeto/tabela, senão 1).
 * - Base do header: `opening.headerHeight` (o projeto manda, P2); senão `config.headerHeight`;
 *   senão, encostada sob a top plate.
 *   Header apoia em todos os jacks: comprimento = roughWidth + 2·jacks·t.
 * - Janela: topo do RO = base do header; base do RO = topo − roughHeight; sill deitado logo abaixo,
 *   mesma seção da parede, comprimento = roughWidth.
 * - Porta (P4): RO medido do subfloor (y=0), sem sill e sem cripples abaixo. `roughHeight` não muda a
 *   geometria; se diferir da base do header, aviso `DOOR_RO_HEIGHT_MISMATCH`. A bottom plate sai
 *   inteira e o trecho do RO vira um `FieldCut` (corte na obra).
 * - Cripples nas marcas de layout que caem dentro do RO. Marca colada ao jack ou a até 2" de folga livre
 *   dele não ganha cripple (P3/P13), salvo se sem ela o vão livre entre o jack e o apoio seguinte passar
 *   de 24" — a mesma regra vale abaixo do sill e acima do header. Só entram se o vão for ≥ 1.5".
 * - Parede não portante (R602.7.4): header é uma peça deitada (`flat`, 1.5" de altura) a até 24" da top
 *   plate — acima disso, `Error` pedindo o header do projeto; sem cripples acima da peça.
 * - Aberturas vizinhas compartilham king (`rules/zones.ts`); aí os kings vêm da fusão e esta função
 *   é chamada com `{ kings: false }`.
 *
 * Seção, plies e jacks do header vêm de `rules/openingHeader.ts` (projeto → tabela → padrão do config);
 * sem header possível lança `Error`. Geometria impossível lança `RangeError`.
 */

import type { Config, FieldCut, Member, Opening, Wall, Warning } from '../types';
import { sectionDepth } from '../types';
import { FLAT_HEADER_MAX_GAP, resolveOpeningHeader, type ResolvedHeader } from './openingHeader';
import { LENGTH_TOLERANCE } from './precuts';
import { layoutStuds } from './studs';

/** Vão mínimo para entrar cripple (acima do header ou abaixo do sill). */
const MIN_CRIPPLE_LENGTH = 1.5;

/** P13: marca a até esta folga livre (face a face) do jack não ganha cripple… */
const CRIPPLE_JACK_TOLERANCE = 2;

/** …salvo se a omissão deixar vão livre entre apoios maior que isto (máximo do IRC para stud, R602.3(5)). */
const MAX_SUPPORT_GAP = 24;

/** Folga numérica para comparações de geometria. */
const EPS = 1e-9;

export interface OpeningZone {
  /** x da borda esquerda do king mais externo à esquerda. */
  start: number;
  /** x da borda direita do king mais externo à direita. */
  end: number;
}

/** Peças, cortes na obra e avisos de uma abertura. */
export interface OpeningFraming {
  members: Member[];
  fieldCuts: FieldCut[];
  warnings: Warning[];
}

export interface FramingOptions {
  /** Gerar os kings da própria abertura (padrão). `false` quando vêm da fusão de zonas. */
  kings?: boolean;
  /** Header já resolvido por quem chama (`panelizeWall`). Ausente = `resolveOpeningHeader`. */
  header?: ResolvedHeader;
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

/** x (borda esquerda) dos kings próprios da abertura de cada lado, em ordem crescente. */
export function openingKingXs(
  opening: Opening,
  studThickness: number,
): { left: number[]; right: number[] } {
  const zone = openingZone(opening, studThickness);
  const { kings } = openingStudCounts(opening);
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < kings; i++) {
    left.push(zone.start + i * studThickness);
    right.push(zone.end - (kings - i) * studThickness);
  }
  return { left, right };
}

/**
 * Peças da abertura: kings (salvo `{ kings: false }`), jacks, header, sill e cripples; para porta,
 * também o corte da bottom plate na obra e o aviso de RO incompatível com o header.
 * Não remove studs de layout — isso é papel de `panelizeWall`, que conhece todas as zonas.
 *
 * @throws Error      header sem como escolher (ver `resolveOpeningHeader`)
 * @throws RangeError zona fora da parede, header invadindo a top plate, sill abaixo da bottom plate,
 *                    header de porta sem espaço para jack
 */
export function framingForOpening(
  opening: Opening,
  wall: Wall,
  config: Config,
  options: FramingOptions = {},
): OpeningFraming {
  const header = options.header ?? resolveOpeningHeader(opening, wall, config);
  const headerSection = header.section;
  const plies = header.plies;
  // Os jacks do header (NJ da tabela ou do projeto) valem para a zona e para os kings.
  opening = { ...opening, jackStuds: header.jackStuds };

  const t = config.studThickness;
  const p = config.plateThickness;
  const { offset, roughWidth, roughHeight } = opening;
  const isDoor = opening.type === 'door';
  const { jacks } = openingStudCounts(opening);
  const zone = openingZone(opening, t);

  if (zone.start < -EPS || zone.end > wall.length + EPS) {
    throw new RangeError(
      `abertura ${opening.id}: zona [${zone.start}, ${zone.end}] (RO com kings e jacks) ` +
        `sai da parede de ${wall.length}"`,
    );
  }

  const topPlateY = wall.height - 2 * p;
  const headerDepth = header.flat ? p : sectionDepth(headerSection);
  const headerBase = opening.headerHeight ?? config.headerHeight ?? topPlateY - headerDepth;
  const headerTop = headerBase + headerDepth;
  if (headerTop > topPlateY + EPS) {
    throw new RangeError(
      `abertura ${opening.id}: header ${headerSection} com base em ${headerBase}" vai até ` +
        `${headerTop}", acima da top plate (${topPlateY}")`,
    );
  }
  if (header.flat && topPlateY - headerTop > FLAT_HEADER_MAX_GAP + EPS) {
    throw new Error(
      `parede ${wall.id}, abertura ${opening.id}: peça deitada (R602.7.4) com topo em ${headerTop}" fica a ` +
        `${topPlateY - headerTop}" da top plate (${topPlateY}"), acima do limite de ${FLAT_HEADER_MAX_GAP}"; ` +
        'informe o header da abertura',
    );
  }
  if (headerBase <= p + EPS) {
    throw new RangeError(
      `abertura ${opening.id}: base do header em ${headerBase}" não deixa espaço para jack ` +
        `sobre a bottom plate (topo em ${p}")`,
    );
  }

  // Janela: sill logo abaixo da base do RO. Porta: RO desce até o subfloor, sem sill.
  const sillY = isDoor ? undefined : headerBase - roughHeight - p;
  if (sillY !== undefined && sillY < p - EPS) {
    throw new RangeError(
      `abertura ${opening.id}: base do RO em ${headerBase - roughHeight}" não deixa espaço para o sill ` +
        `sobre a bottom plate (topo em ${p}")`,
    );
  }

  const vertical = { section: wall.section, orientation: 'vertical' as const };
  const members: Member[] = [];
  const fieldCuts: FieldCut[] = [];
  const warnings: Warning[] = [...header.warnings];

  if (options.kings ?? true) {
    const studLength = wall.height - 3 * p;
    const { left, right } = openingKingXs(opening, t);
    for (const x of [...left, ...right]) {
      members.push({ role: 'kingStud', ...vertical, length: studLength, x, y: p });
    }
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
    headerSource: header.source,
    ...(header.flat ? { flat: true } : {}),
  });

  if (sillY !== undefined) {
    members.push({
      role: 'sill',
      section: wall.section,
      length: roughWidth,
      x: offset,
      y: sillY,
      orientation: 'horizontal',
    });
  }

  const marks = crippleMarks(
    layoutStuds(wall.length, config.studSpacing, t, wall.layoutOrigin ?? 0),
    offset,
    offset + roughWidth,
    t,
  );

  if (sillY !== undefined) {
    const below = sillY - p;
    if (below >= MIN_CRIPPLE_LENGTH - EPS) {
      for (const x of marks) members.push({ role: 'cripple', ...vertical, length: below, x, y: p });
    }
  }

  // R602.7.4: sobre a peça deitada não vão cripples.
  const above = topPlateY - headerTop;
  if (!header.flat && above >= MIN_CRIPPLE_LENGTH - EPS) {
    for (const x of marks) members.push({ role: 'cripple', ...vertical, length: above, x, y: headerTop });
  }

  if (isDoor) {
    fieldCuts.push({ role: 'bottomPlate', openingId: opening.id, x: offset, length: roughWidth });
    if (Math.abs(roughHeight - headerBase) >= LENGTH_TOLERANCE) {
      warnings.push({
        code: 'DOOR_RO_HEIGHT_MISMATCH',
        message:
          `abertura ${opening.id}: RO da porta com ${roughHeight}" de altura (medido do subfloor) ` +
          `não bate com a base do header em ${headerBase}"`,
      });
    }
  }

  return { members, fieldCuts, warnings };
}

/**
 * Marcas de layout que ganham cripple no RO [start, end] (faces dos jacks).
 * Ficam as marcas estritamente dentro do RO — a colada ao jack (x = start, ou x + t = end) e as que o
 * invadem saem. Depois, P13: marca a até CRIPPLE_JACK_TOLERANCE de folga livre do jack sai, salvo se sem
 * ela o vão livre entre a face do jack e o apoio seguinte (próxima marca mantida, ou o jack oposto)
 * passar de MAX_SUPPORT_GAP.
 */
export function crippleMarks(layout: number[], start: number, end: number, t: number): number[] {
  const inside = layout.filter((x) => x > start + EPS && x + t < end - EPS);
  const kept: number[] = [];
  for (const [i, x] of inside.entries()) {
    let omit = false;
    if (x - start <= CRIPPLE_JACK_TOLERANCE + EPS) {
      // Apoio seguinte: a próxima marca (se ela também sair, o vão só diminui) ou o jack direito.
      const next = inside[i + 1] ?? end;
      omit = next - start <= MAX_SUPPORT_GAP + EPS;
    } else if (end - (x + t) <= CRIPPLE_JACK_TOLERANCE + EPS) {
      const last = kept[kept.length - 1];
      const prev = last === undefined ? start : last + t;
      omit = end - prev <= MAX_SUPPORT_GAP + EPS;
    }
    if (!omit) kept.push(x);
  }
  return kept;
}
