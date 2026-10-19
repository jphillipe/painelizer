/**
 * A abertura como o motor a vê (S21): `resolveOpening` do core sobre o draft — RO, borda esquerda e altura do
 * header a partir da tag, do centro e da marca de header. O inspetor mostra isso ao lado dos campos, e a
 * conversão centro ↔ borda usa a largura resolvida.
 */

import { engineeredSection, resolveOpening, type Config, type Opening, type OpeningSpec, type Section } from 'core';
import { compact, type DraftConfig, type DraftOpening, type HeaderSectionDraft, type ProjectDraft } from './draft';

/** `Config` mínima do core a partir do draft (defaults do CLI onde o draft não diz). */
export function configFromDraft(d: ProjectDraft): Config {
  const c = d.config;
  const config: Config = {
    studSpacing: c.studSpacing ?? 16,
    studThickness: c.studThickness ?? 1.5,
    plateThickness: c.plateThickness ?? 1.5,
    studLength: c.studLength ?? [],
  };
  if (c.headerHeight !== undefined) config.headerHeight = c.headerHeight;
  if (c.openingTypes !== undefined) {
    config.openingTypes = {};
    for (const [tag, t] of Object.entries(c.openingTypes)) {
      if (t.kind === undefined || t.width === undefined || t.height === undefined) continue;
      config.openingTypes[tag] = compact({ kind: t.kind, width: t.width, height: t.height, frame: t.frame, sillHeight: t.sillHeight, roughWidth: t.roughWidth, roughHeight: t.roughHeight, description: t.description });
    }
  }
  if (c.headerSchedule !== undefined) {
    config.headerSchedule = {};
    for (const [mark, h] of Object.entries(c.headerSchedule)) {
      const section = sectionFromDraft(h.section);
      if (section === undefined || h.plies === undefined) continue;
      config.headerSchedule[mark] = compact({ section, plies: h.plies, jackStuds: h.jackStuds ?? 1, kingStuds: h.kingStuds ?? 1, description: h.description });
    }
  }
  return config;
}

export function sectionFromDraft(s: HeaderSectionDraft | undefined): Section | undefined {
  if (s === undefined) return undefined;
  if (typeof s === 'string') return s as Section;
  return engineeredSection(s.material, s.width, s.depth);
}

export function specFromDraft(o: DraftOpening): OpeningSpec {
  const header = o.header === undefined ? undefined : compact({ section: sectionFromDraft(o.header.section), plies: o.header.plies, jackStuds: o.header.jackStuds });
  return compact({
    id: o.id,
    tag: o.tag,
    type: o.type,
    center: o.center,
    offset: o.offset,
    roughWidth: o.roughWidth,
    roughHeight: o.roughHeight,
    headerMark: o.headerMark,
    header: header !== undefined && header.section !== undefined && header.plies !== undefined ? (header as Opening['header']) : undefined,
    sillHeight: o.sillHeight,
    headerHeight: o.headerHeight,
    kingStuds: o.kingStuds,
    jackStuds: o.jackStuds,
  });
}

export type ResolvedOpening = { ok: true; opening: Opening } | { ok: false; message: string };

/** Resolve uma abertura do draft com o catálogo do projeto; mensagem do core quando não dá. */
export function resolveDraftOpening(d: ProjectDraft, o: DraftOpening, config: Config = configFromDraft(d)): ResolvedOpening {
  try {
    return { ok: true, opening: resolveOpening(specFromDraft(o), config) };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Largura do RO que o inspetor usa para converter centro ↔ borda: a resolvida, senão a digitada, senão 36". */
export function openingWidth(d: ProjectDraft, o: DraftOpening): number {
  const r = resolveDraftOpening(d, o);
  if (r.ok) return r.opening.roughWidth;
  return o.roughWidth ?? 36;
}

/** Tags do catálogo e marcas do header schedule, na ordem do arquivo. */
export function catalogTags(c: DraftConfig): string[] {
  return Object.keys(c.openingTypes ?? {});
}

export function headerMarks(c: DraftConfig): string[] {
  return Object.keys(c.headerSchedule ?? {});
}
