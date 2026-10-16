import { describe, expect, it } from 'vitest';
import type { Config, Opening, OpeningSpec } from '../../src/types';
import { DEFAULT_ROUGH_OFFSET, resolveOpening, resolveOpenings } from '../../src/rules/catalog';
import window from '../fixtures/wall-144-window.json';
import door from '../fixtures/wall-120-door.json';

const base: Config = {
  studSpacing: 16,
  studThickness: 1.5,
  plateThickness: 1.5,
  studLength: [92.625],
};

/** Catálogo que reproduz os fixtures: W1 → RO 36x48 (fixture da janela), D1 → RO 38x82.5 (porta). */
const catalog: Config = {
  ...base,
  openingTypes: {
    W1: { kind: 'window', width: 35.5, height: 47.25, sillHeight: 24 },
    D1: { kind: 'door', width: 36, height: 80 },
    HM: { kind: 'door', width: 36, height: 84, frame: 'hm' },
    QK: { kind: 'window', width: 72, height: 66, roughWidth: 73, roughHeight: 67, sillHeight: 16 },
  },
  headerSchedule: {
    HDR2: { section: '2x10', plies: 3, jackStuds: 2, kingStuds: 4 },
    HDR5: { section: 'LVL 1.75x9.25', plies: 2, jackStuds: 2, kingStuds: 1 },
  },
};

describe('resolveOpening — catálogo', () => {
  it('janela por tag + eixo reproduz a abertura do fixture wall-144-window (RO 36x48 em offset 48)', () => {
    const fx = window.wall.openings[0] as Opening;
    const r = resolveOpening(
      { id: fx.id, tag: 'W1', center: 66, header: { section: '2x10', plies: 2 }, headerHeight: 72 },
      catalog,
    );
    expect(r).toEqual({ ...fx, headerHeight: 72 });
  });

  it('porta por tag: RO = folha + 2" x + 2 1/2" (P33), como o fixture wall-120-door', () => {
    const fx = door.wall.openings[0] as Opening;
    const r = resolveOpening({ id: fx.id, tag: 'D1', offset: 40, header: fx.header! }, catalog);
    expect(r).toEqual(fx);
    expect(DEFAULT_ROUGH_OFFSET.wood).toEqual([2, 2.5]);
  });

  it('batente metálico: mesma folga da madeira (P34 revista); RO explícito do fabricante manda sobre a folga', () => {
    expect(resolveOpening({ id: 'p', tag: 'HM', offset: 10 }, catalog)).toMatchObject({
      roughWidth: 38,
      roughHeight: 86.5,
    });
    expect(resolveOpening({ id: 'j', tag: 'QK', offset: 10 }, catalog)).toMatchObject({
      roughWidth: 73,
      roughHeight: 67,
      headerHeight: 83,
    });
  });

  it('sillHeight do catálogo deriva headerHeight = peitoril + RO; o da abertura prevalece; porta ignora', () => {
    expect(resolveOpening({ id: 'j', tag: 'W1', center: 66 }, catalog)).toMatchObject({ headerHeight: 72 });
    expect(resolveOpening({ id: 'j', tag: 'W1', center: 66, sillHeight: 30 }, catalog)).toMatchObject({
      headerHeight: 78,
    });
    expect(resolveOpening({ id: 'j', tag: 'W1', center: 66, headerHeight: 82.5 }, catalog)).toMatchObject({
      headerHeight: 82.5,
    });
    expect(resolveOpening({ id: 'p', tag: 'D1', offset: 0, sillHeight: 30 }, catalog).headerHeight).toBeUndefined();
  });

  it('headerMark leva seção, plies e jacks do schedule; kings do schedule só se a abertura não os der', () => {
    const r = resolveOpening({ id: 'j', tag: 'W1', center: 66, headerMark: 'HDR2' }, catalog);
    expect(r.header).toEqual({ section: '2x10', plies: 3, jackStuds: 2 });
    expect(r.kingStuds).toBe(4);
    expect(resolveOpening({ id: 'j', tag: 'W1', center: 66, headerMark: 'HDR5', kingStuds: 2 }, catalog)).toMatchObject({
      header: { section: 'LVL 1.75x9.25', plies: 2, jackStuds: 2 },
      kingStuds: 2,
    });
  });

  it('campo direto sobrescreve o catálogo: RO, offset e header', () => {
    const r = resolveOpening(
      {
        id: 'j',
        tag: 'W1',
        center: 66,
        offset: 10,
        roughWidth: 40,
        roughHeight: 50,
        headerMark: 'HDR2',
        header: { section: '2x8', plies: 2 },
        jackStuds: 1,
      },
      catalog,
    );
    expect(r).toMatchObject({ offset: 10, roughWidth: 40, roughHeight: 50, header: { section: '2x8', plies: 2 }, jackStuds: 1 });
    expect(r.kingStuds).toBeUndefined();
  });

  it('sem catálogo, a abertura direta de hoje continua igual', () => {
    const fx = window.wall.openings[0] as OpeningSpec;
    expect(resolveOpening(fx, base)).toEqual(fx);
    expect(resolveOpenings(window.wall.openings as OpeningSpec[], base)).toEqual(window.wall.openings);
  });

  it.each([
    [{ id: 'x', tag: 'W9', center: 10 }, /abertura x: tag "W9" não está em config.openingTypes/],
    [{ id: 'x', tag: 'W1', center: 10, headerMark: 'HDR9' }, /marca "HDR9" não está em config.headerSchedule/],
    [{ id: 'x', offset: 10, roughWidth: 36, roughHeight: 48 }, /sem type nem tag/],
    [{ id: 'x', type: 'window' as const, offset: 10 }, /sem roughWidth\/roughHeight e sem tag/],
    [{ id: 'x', tag: 'W1' }, /sem offset nem center/],
  ])('erro com parede no prefixo: %j', (spec, re) => {
    expect(() => resolveOpening(spec, catalog, 'parede W1')).toThrow(re);
    expect(() => resolveOpening(spec, catalog, 'parede W1')).toThrow(/^parede W1, /);
  });

  it('medida não positiva lança RangeError', () => {
    expect(() => resolveOpening({ id: 'x', type: 'window', offset: 0, roughWidth: 0, roughHeight: 48 }, base)).toThrow(RangeError);
    expect(() => resolveOpening({ id: 'x', tag: 'W1', center: 66, sillHeight: -1 }, catalog)).toThrow(RangeError);
  });
});
