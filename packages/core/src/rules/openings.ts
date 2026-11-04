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
 *   mesma seção da parede, comprimento = roughWidth. RO mais largo que `config.doubleSillOver` (S12,
 *   hipótese 72", P25) leva sill dupla: segunda peça sob a primeira em `sillY − 1.5`; os cripples abaixo encurtam 1.5".
 * - Kings de cada lado = os do header resolvido (`opening.kingStuds`, senão Tabela R602.7.5 em parede
 *   externa, senão 1).
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
 * Seção, plies e jacks do header vêm de `rules/openingHeader.ts` (projeto → tabela IRC → R602.7.4); sem
 * header possível, o `EngineError` de lá sobe. Geometria impossível lança `EngineError` (um `RangeError`).
 *
 * `framingForOpening` = `openingGeometry` (alturas e conferências) + `openingFrame` (kings, jacks, header e
 * sill) + `openingCripples`, nessa ordem de peças.
 */

import { studLengthFor, type Config } from '../config';
import { EPS, isCount } from '../eps';
import { withStudCounts, type Opening } from '../opening';
import type { FieldCut, Member } from '../panel';
import { sectionDepth } from '../sections';
import type { Wall } from '../wall';
import { EngineError, warning, type Warning } from '../messages';
import { FLAT_HEADER_MAX_GAP, resolveOpeningHeader, type ResolvedHeader } from './openingHeader';
import { LENGTH_TOLERANCE } from './precuts';
import { layoutStuds } from './studs';

/** Vão mínimo para entrar cripple (acima do header ou abaixo do sill). Vão curto acima do header: P20. */
const MIN_CRIPPLE_LENGTH = 1.5;

/** P13: marca a até esta folga livre (face a face) do jack não ganha cripple… */
const CRIPPLE_JACK_TOLERANCE = 2;

/** …salvo se a omissão deixar vão livre entre apoios maior que isto (máximo do IRC para stud, R602.3(5)). */
const MAX_SUPPORT_GAP = 24;

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
    if (!isCount(n)) {
      throw new EngineError('VALUE_NOT_COUNT', { openingId: opening.id }, { field: name, value: n });
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
    throw new EngineError('OPENING_NOT_FINITE', { openingId: opening.id });
  }
  if (roughWidth <= 0 || roughHeight <= 0) {
    throw new EngineError('OPENING_SIZE_INVALID', { openingId: opening.id });
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
  // Jacks (NJ da tabela ou do projeto) e kings (R602.7.5 ou do projeto) resolvidos valem para a zona.
  const o = withStudCounts(opening, header);
  const g = openingGeometry(o, wall, config, header);

  const members = [...openingFrame(o, wall, config, header, g, options.kings ?? true), ...openingCripples(o, wall, config, header, g)];
  const fieldCuts: FieldCut[] = [];
  const warnings: Warning[] = [...header.warnings];
  if (o.type === 'door') {
    fieldCuts.push({ role: 'bottomPlate', openingId: o.id, x: o.offset, length: o.roughWidth });
    if (Math.abs(o.roughHeight - g.headerBase) >= LENGTH_TOLERANCE) {
      warnings.push(
        warning('DOOR_RO_HEIGHT_MISMATCH', { wallId: wall.id, openingId: o.id }, { roughHeight: o.roughHeight, headerBase: g.headerBase }),
      );
    }
  }
  return { members, fieldCuts, warnings };
}

/** Alturas da abertura montada (y medido da base da bottom plate). */
interface OpeningGeometry {
  jacks: number;
  /** y da base da top plate. */
  topPlateY: number;
  /** y da base e do topo do header (base = topo do RO). */
  headerBase: number;
  headerTop: number;
  /** y da sill de cima; `undefined` na porta (RO desce até o subfloor). */
  sillY: number | undefined;
  /** RO mais largo que `config.doubleSillOver`: segunda sill sob a primeira. */
  doubleSill: boolean;
  /** y da base da sill de baixo; `undefined` na porta. */
  sillBottom: number | undefined;
}

/**
 * Alturas do header e da sill, conferidas contra a parede.
 *
 * @throws RangeError zona fora da parede, header invadindo a top plate, header deitado longe demais da top
 *                    plate, header sem espaço para jack, `doubleSillOver` inválido, sill abaixo da bottom plate
 */
function openingGeometry(opening: Opening, wall: Wall, config: Config, header: ResolvedHeader): OpeningGeometry {
  const t = config.studThickness;
  const p = config.plateThickness;
  const { roughWidth, roughHeight } = opening;
  const { jacks } = openingStudCounts(opening);
  const zone = openingZone(opening, t);

  if (zone.start < -EPS || zone.end > wall.length + EPS) {
    throw new EngineError('OPENING_OUT_OF_WALL', { openingId: opening.id }, { start: zone.start, end: zone.end, length: wall.length });
  }

  const topPlateY = wall.height - 2 * p;
  const headerDepth = header.flat ? p : sectionDepth(header.section);
  const headerBase = opening.headerHeight ?? config.headerHeight ?? topPlateY - headerDepth;
  const headerTop = headerBase + headerDepth;
  if (headerTop > topPlateY + EPS) {
    throw new EngineError(
      'HEADER_ABOVE_TOP_PLATE',
      { openingId: opening.id },
      { section: String(header.section), base: headerBase, top: headerTop, topPlate: topPlateY },
    );
  }
  if (header.flat && topPlateY - headerTop > FLAT_HEADER_MAX_GAP + EPS) {
    throw new EngineError(
      'FLAT_HEADER_GAP',
      { wallId: wall.id, openingId: opening.id },
      { top: headerTop, gap: topPlateY - headerTop, topPlate: topPlateY, max: FLAT_HEADER_MAX_GAP },
    );
  }
  if (headerBase <= p + EPS) {
    throw new EngineError('HEADER_NO_ROOM_FOR_JACK', { openingId: opening.id }, { base: headerBase, plateTop: p });
  }

  // Janela: sill logo abaixo da base do RO. Porta: RO desce até o subfloor, sem sill.
  // Sill dupla (S12): RO mais largo que `config.doubleSillOver` leva uma segunda peça sob a primeira.
  const sillY = opening.type === 'door' ? undefined : headerBase - roughHeight - p;
  const doubleOver = config.doubleSillOver;
  if (doubleOver !== undefined && (!Number.isFinite(doubleOver) || doubleOver <= 0)) {
    throw new EngineError('CONFIG_INVALID', {}, { field: 'config.doubleSillOver', value: doubleOver, expected: 'measure' });
  }
  const doubleSill = sillY !== undefined && doubleOver !== undefined && roughWidth > doubleOver + EPS;
  const sillBottom = sillY === undefined ? undefined : doubleSill ? sillY - p : sillY;
  if (sillBottom !== undefined && sillBottom < p - EPS) {
    throw new EngineError('SILL_NO_ROOM', { openingId: opening.id }, { roBase: headerBase - roughHeight, double: doubleSill, plateTop: p });
  }
  return { jacks, topPlateY, headerBase, headerTop, sillY, doubleSill, sillBottom };
}

/** Kings (se `kings`), jacks dos dois lados, header e sill(s), nessa ordem. */
function openingFrame(
  opening: Opening,
  wall: Wall,
  config: Config,
  header: ResolvedHeader,
  g: OpeningGeometry,
  kings: boolean,
): Member[] {
  const t = config.studThickness;
  const p = config.plateThickness;
  const { offset, roughWidth } = opening;
  const vertical = { section: wall.section, orientation: 'vertical' as const };
  const members: Member[] = [];

  if (kings) {
    const studLength = studLengthFor(wall, config);
    const { left, right } = openingKingXs(opening, t);
    for (const x of [...left, ...right]) {
      members.push({ role: 'kingStud', ...vertical, length: studLength, x, y: p });
    }
  }

  const jackLength = g.headerBase - p;
  for (let i = 0; i < g.jacks; i++) {
    members.push({ role: 'jackStud', ...vertical, length: jackLength, x: offset - (i + 1) * t, y: p });
    members.push({ role: 'jackStud', ...vertical, length: jackLength, x: offset + roughWidth + i * t, y: p });
  }

  members.push({
    role: 'header',
    section: header.section,
    length: roughWidth + 2 * g.jacks * t,
    x: offset - g.jacks * t,
    y: g.headerBase,
    orientation: 'horizontal',
    plies: header.plies,
    headerSource: header.source,
    ...(header.flat ? { flat: true } : {}),
  });

  if (g.sillY !== undefined) {
    const sill = { role: 'sill' as const, section: wall.section, length: roughWidth, x: offset, orientation: 'horizontal' as const };
    members.push({ ...sill, y: g.sillY });
    if (g.doubleSill) members.push({ ...sill, y: g.sillY - p });
  }
  return members;
}

/** Cripples nas marcas de layout do RO: abaixo da sill e, salvo header deitado (R602.7.4), acima do header. */
function openingCripples(opening: Opening, wall: Wall, config: Config, header: ResolvedHeader, g: OpeningGeometry): Member[] {
  const t = config.studThickness;
  const p = config.plateThickness;
  const { offset, roughWidth } = opening;
  const vertical = { section: wall.section, orientation: 'vertical' as const };
  const members: Member[] = [];
  const marks = crippleMarks(
    layoutStuds(wall.length, config.studSpacing, t, wall.layoutOrigin ?? 0),
    offset,
    offset + roughWidth,
    t,
  );

  if (g.sillBottom !== undefined) {
    const below = g.sillBottom - p;
    if (below >= MIN_CRIPPLE_LENGTH - EPS) {
      for (const x of marks) members.push({ role: 'cripple', ...vertical, length: below, x, y: p });
    }
  }

  // R602.7.4: sobre a peça deitada não vão cripples.
  const above = g.topPlateY - g.headerTop;
  if (!header.flat && above >= MIN_CRIPPLE_LENGTH - EPS) {
    for (const x of marks) members.push({ role: 'cripple', ...vertical, length: above, x, y: g.headerTop });
  }
  return members;
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
