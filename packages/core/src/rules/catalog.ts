/**
 * Catálogo do projeto (S12.5): transforma a abertura como o projeto a descreve (`OpeningSpec`: tag do
 * window/door schedule, eixo do RO na planta, marca do header schedule) na `Opening` resolvida que
 * `panelizeWall` consome. O motor não muda; esta camada fica antes dele.
 *
 * Prioridade (04-decisoes 2026-10-13): campo direto na abertura > catálogo (`config.openingTypes`,
 * `config.headerSchedule`) > tabela IRC (decidida depois, em `resolveOpeningHeader`).
 *
 * Regras:
 * - `type`: o da abertura, senão `kind` do catálogo. Sem nenhum → `Error`.
 * - RO: `roughWidth`/`roughHeight` da abertura; senão os do catálogo; senão tamanho nominal + folga
 *   default (`DEFAULT_ROUGH_OFFSET`, hipóteses P32–P34 a partir do Horace A-604/A-608 e da resposta P4):
 *   janela +1/2" x +3/4"; porta de madeira +2" x +2 1/2"; batente metálico ou alumínio +4 1/2" x +3".
 *   Altura de RO de porta é medida do subfloor (P4), por isso a folga vertical inclui a passagem do piso.
 * - Posição: `offset` (borda esquerda) da abertura; senão `center − roughWidth / 2`. Sem nenhum → `Error`.
 * - Header: `header` da abertura; senão `headerMark` no schedule (seção, plies, jacks); kings do schedule
 *   entram como `kingStuds` quando a abertura não os dá. Marca ou tag inexistente → `Error`.
 * - `headerHeight`: o da abertura; senão, em janela, `sillHeight` (abertura, senão catálogo) + RO.
 *   Porta ignora `sillHeight` (o RO já é medido do subfloor).
 */

import type { Config, DoorFrame, Opening, OpeningHeader, OpeningSpec, OpeningType } from '../types';

/** Folga do RO sobre o tamanho nominal, em polegadas: `[largura, altura]`. */
export const DEFAULT_ROUGH_OFFSET: Readonly<Record<'window' | DoorFrame, readonly [number, number]>> = {
  /** Horace A-604: 1/4" por lado na largura; 3/8" no peitoril e ~3/8" na cabeça (P32). */
  window: [0.5, 0.75],
  /** Horace A-608 det. 7: jamb 3/4" + shim 1/4" por lado; altura pela resposta P4 (80" → 82 1/2") (P33). */
  wood: [2, 2.5],
  /** Batente hollow metal de 2" de face por lado + folga, altura com passagem do piso (P34). */
  hm: [4.5, 3],
  /** Alumínio: tratado como o metálico (P34). */
  al: [4.5, 3],
};

/**
 * @param where prefixo das mensagens de erro (ex.: "parede W01")
 * @throws Error      tag ou marca inexistente no catálogo; tipo, RO ou posição sem como resolver
 * @throws RangeError medida não positiva
 */
export function resolveOpening(spec: OpeningSpec, config: Config, where = ''): Opening {
  const at = `${where ? `${where}, ` : ''}abertura ${spec.id}`;

  const entry = spec.tag === undefined ? undefined : config.openingTypes?.[spec.tag];
  if (spec.tag !== undefined && entry === undefined) {
    throw new Error(`${at}: tag "${spec.tag}" não está em config.openingTypes`);
  }

  const type: OpeningType | undefined = spec.type ?? entry?.kind;
  if (type === undefined) throw new Error(`${at}: sem type nem tag no catálogo`);

  const frame: DoorFrame = entry?.frame ?? 'wood';
  const offsets = type === 'window' ? DEFAULT_ROUGH_OFFSET.window : DEFAULT_ROUGH_OFFSET[frame];
  const roughWidth = spec.roughWidth ?? entry?.roughWidth ?? (entry ? entry.width + offsets[0] : undefined);
  const roughHeight = spec.roughHeight ?? entry?.roughHeight ?? (entry ? entry.height + offsets[1] : undefined);
  if (roughWidth === undefined || roughHeight === undefined) {
    throw new Error(`${at}: sem roughWidth/roughHeight e sem tag no catálogo`);
  }
  positive(roughWidth, `${at}: roughWidth`);
  positive(roughHeight, `${at}: roughHeight`);

  const offset = spec.offset ?? (spec.center === undefined ? undefined : spec.center - roughWidth / 2);
  if (offset === undefined) throw new Error(`${at}: sem offset nem center`);

  const opening: Opening = { id: spec.id, type, offset, roughWidth, roughHeight };

  let header: OpeningHeader | undefined = spec.header;
  let kingStuds = spec.kingStuds;
  if (header === undefined && spec.headerMark !== undefined) {
    const mark = config.headerSchedule?.[spec.headerMark];
    if (mark === undefined) {
      throw new Error(`${at}: marca "${spec.headerMark}" não está em config.headerSchedule`);
    }
    header = { section: mark.section, plies: mark.plies, jackStuds: mark.jackStuds };
    kingStuds ??= mark.kingStuds;
  }
  if (header !== undefined) opening.header = header;
  if (kingStuds !== undefined) opening.kingStuds = kingStuds;
  if (spec.jackStuds !== undefined) opening.jackStuds = spec.jackStuds;

  const headerHeight = spec.headerHeight ?? windowHeaderHeight(spec, entry?.sillHeight, roughHeight, type);
  if (headerHeight !== undefined) {
    positive(headerHeight, `${at}: headerHeight`);
    opening.headerHeight = headerHeight;
  }
  return opening;
}

function windowHeaderHeight(
  spec: OpeningSpec,
  catalogSill: number | undefined,
  roughHeight: number,
  type: OpeningType,
): number | undefined {
  if (type !== 'window') return undefined;
  const sill = spec.sillHeight ?? catalogSill;
  if (sill === undefined) return undefined;
  if (!(sill >= 0)) throw new RangeError(`abertura ${spec.id}: sillHeight inválido (${sill})`);
  return sill + roughHeight;
}

/** Resolve todas as aberturas de uma parede. */
export function resolveOpenings(specs: readonly OpeningSpec[], config: Config, where = ''): Opening[] {
  return specs.map((s) => resolveOpening(s, config, where));
}

function positive(n: number, what: string): void {
  if (!(n > 0) || !Number.isFinite(n)) throw new RangeError(`${what} deve ser > 0 (recebido ${n})`);
}
