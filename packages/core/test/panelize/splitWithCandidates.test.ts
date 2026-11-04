import { describe, expect, it } from 'vitest';
import { frameWalls } from '../../src/house/frame';
import { panelizeFrame, panelizeFrameWithCandidates } from '../../src/house/panelizeHouse';
import { splitWall, splitWallWithCandidates, wallBreakCandidates } from '../../src/panelize/splitWall';
import { houseFixture, wallFixture } from '../helpers/fixtures';
import door120NonbearingJson from '../fixtures/wall-120-door-nonbearing.json';
import door120Json from '../fixtures/wall-120-door.json';
import plain144Json from '../fixtures/wall-144-plain.json';
import window825Json from '../fixtures/wall-144-window-82.5.json';
import windowDoorJson from '../fixtures/wall-144-window-door.json';
import windowIrcJson from '../fixtures/wall-144-window-irc.json';
import windowJson from '../fixtures/wall-144-window.json';
import spliced240Json from '../fixtures/wall-240-spliced.json';
import split480Json from '../fixtures/wall-480-split.json';
import house28x40Json from '../fixtures/house-28x40.json';
import cornerLJson from '../fixtures/house-corner-L.json';
import teeJson from '../fixtures/house-tee.json';

/**
 * S29 (perf do check): a variante que devolve painéis + candidatos não muda os painéis e dá os mesmos candidatos de
 * `wallBreakCandidates` — só não monta a parede inteira duas vezes.
 */
const walls = [
  ['wall-120-door-nonbearing', door120NonbearingJson],
  ['wall-120-door', door120Json],
  ['wall-144-plain', plain144Json],
  ['wall-144-window-82.5', window825Json],
  ['wall-144-window-door', windowDoorJson],
  ['wall-144-window-irc', windowIrcJson],
  ['wall-144-window', windowJson],
  ['wall-240-spliced', spliced240Json],
  ['wall-480-split', split480Json],
] as const;

describe('splitWallWithCandidates', () => {
  it.each(walls)(
    '%s: painéis iguais aos de splitWall e candidatos iguais aos de wallBreakCandidates',
    (_name, json) => {
      const fx = wallFixture(json);
      const r = splitWallWithCandidates(fx.wall, fx.config);
      expect(r.panels).toEqual(splitWall(fx.wall, fx.config));
      expect(r.candidates).toEqual(wallBreakCandidates(fx.wall, fx.config));
    },
  );

  it('wall-480-split com quebras forçadas: os candidatos não dependem delas', () => {
    const fx = wallFixture({
      config: split480Json.config,
      wall: { ...split480Json.wall, panelBreaks: split480Json.forced.panelBreaks },
    });
    const r = splitWallWithCandidates(fx.wall, fx.config);
    expect(r.panels.map((p) => p.wallOffset)).toEqual([0, 160, 320]);
    expect(r.candidates).toEqual(wallBreakCandidates(fx.wall, fx.config));
    expect(r.candidates).toContain(240);
  });
});

describe('panelizeFrameWithCandidates', () => {
  it.each([
    ['house-28x40', house28x40Json],
    ['house-corner-L', cornerLJson],
    ['house-tee', teeJson],
  ] as const)(
    '%s: cada parede com os painéis de panelizeFrame e os candidatos de wallBreakCandidates',
    (_name, json) => {
      const fx = houseFixture(json);
      for (const frame of frameWalls(fx.house)) {
        const r = panelizeFrameWithCandidates(frame, fx.config);
        expect(r.panels, frame.wallId).toEqual(panelizeFrame(frame, fx.config));
        expect(r.candidates, frame.wallId).toEqual(wallBreakCandidates(frame.wall, fx.config));
      }
    },
  );
});
