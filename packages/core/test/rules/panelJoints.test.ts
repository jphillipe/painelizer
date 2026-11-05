/**
 * Ligações do painel (S39, `rules/panelJoints.ts`): `Panel.ends` e `Panel.tees` repetem `wall.joints` do trecho com a
 * montagem usada, para a folha e a planta — e nenhuma peça muda (os fixtures continuam com os mesmos members; aqui só
 * o que os campos novos dizem).
 */

import { describe, expect, it } from 'vitest';
import { panelEnds, panelTees } from '../../src/rules/panelJoints';
import { panelizeHouse } from '../../src/house/panelizeHouse';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { splitWall } from '../../src/panelize/splitWall';
import type { Wall } from '../../src/types';
import cornerLJson from '../fixtures/house-corner-L.json';
import teeJson from '../fixtures/house-tee.json';
import crossJson from '../fixtures/house-cross.json';
import house28x40Json from '../fixtures/house-28x40.json';
import plainJson from '../fixtures/wall-144-plain.json';
import splitJson from '../fixtures/wall-480-split.json';
import { houseFixture, wallFixture } from '../helpers/fixtures';

describe('panelEnds', () => {
  it('parede solta (sem joints): undefined', () => {
    expect(panelEnds({}, {})).toBeUndefined();
    expect(panelEnds({ joints: { tees: [{ x: 10, width: 3.5 }] } }, {})).toBeUndefined();
  });

  it('canto: quem atravessa leva a montagem (California por padrão, P5); quem encosta não', () => {
    const wall: Pick<Wall, 'joints'> = {
      joints: {
        start: { kind: 'corner', through: true, otherThickness: 5.5, wallId: 'W2' },
        end: { kind: 'corner', through: false, otherThickness: 3.5, wallId: 'W3', concave: true },
      },
    };
    expect(panelEnds(wall, {})).toEqual({
      start: { kind: 'corner', wallId: 'W2', through: true, otherThickness: 5.5, style: 'california' },
      end: { kind: 'corner', wallId: 'W3', through: false, otherThickness: 3.5, concave: true },
    });
    expect(panelEnds(wall, { corner: 'three-stud' })!.start).toMatchObject({ style: 'three-stud' });
  });

  it('T, + e junta de painéis; os cortes da double top (geometria) ficam fora', () => {
    const wall: Pick<Wall, 'joints'> = {
      joints: {
        start: { kind: 'tee', otherThickness: 5.5, wallId: 'W1', cross: true },
        end: { kind: 'panel', lap: 48, panelId: '1-W2-P2', cuts: [{ x: 150, width: 3.5 }] },
      },
    };
    expect(panelEnds(wall, {})).toEqual({
      start: { kind: 'tee', wallId: 'W1', otherThickness: 5.5, cross: true },
      end: { kind: 'panel', panelId: '1-W2-P2', lap: 48 },
    });
  });
});

describe('panelTees', () => {
  const wall: Pick<Wall, 'joints'> = {
    joints: {
      tees: [
        { x: 100, width: 3.5, wallId: 'W5' },
        { x: 40, width: 3.5, wallId: 'W4', sides: 2, otherWallId: 'W6' },
      ],
    },
  };

  it('por x crescente, com a montagem do projeto (ladder por padrão); faixa sem peça = none', () => {
    expect(panelTees(wall, {}, [true, false])).toEqual([
      { x: 40, width: 3.5, wallId: 'W4', sides: 2, otherWallId: 'W6', framing: 'none' },
      { x: 100, width: 3.5, wallId: 'W5', framing: 'ladder' },
    ]);
    expect(panelTees(wall, { tee: 'backer' }, [true, true]).map((t) => t.framing)).toEqual(['backer', 'backer']);
    expect(panelTees({}, {}, [])).toEqual([]);
  });
});

describe('no painel (framePanel/splitWall)', () => {
  it('parede solta de um painel: sem ends nem tees (a folha diz "free end")', () => {
    const { wall, config } = wallFixture(plainJson);
    const p = panelizeWall(wall, config);
    expect(p.ends).toBeUndefined();
    expect(p.tees).toBeUndefined();
  });

  it('house-corner-L: W1 atravessa o canto com W2 (California); W2 encosta', () => {
    const { house, config } = houseFixture(cornerLJson);
    const [w1, w2] = panelizeHouse(house, config).panels;
    expect(w1!.ends).toEqual({ start: { kind: 'corner', wallId: 'W2', through: true, otherThickness: 5.5, style: 'california' } });
    expect(w2!.ends).toEqual({ start: { kind: 'corner', wallId: 'W1', through: false, otherThickness: 5.5 } });
  });

  it('house-tee: W1 com o T de W2 em x do painel; W2 encosta em W1', () => {
    const { house, config } = houseFixture(teeJson);
    const [w1, w2] = panelizeHouse(house, config).panels;
    expect(w1!.ends).toBeUndefined();
    expect(w1!.tees).toEqual([{ x: 72, width: 3.5, wallId: 'W2', framing: 'ladder' }]);
    expect(w2!.ends).toEqual({ start: { kind: 'tee', wallId: 'W1', otherThickness: 5.5 } });
  });

  it('house-cross: uma faixa de dois lados (P46) e as duas que encostam com cross', () => {
    const { house, config } = houseFixture(crossJson);
    const [w1, w2, w3] = panelizeHouse(house, config).panels;
    expect(w1!.tees).toEqual([{ x: 72, width: 3.5, wallId: 'W2', sides: 2, otherWallId: 'W3', framing: 'ladder' }]);
    expect(w2!.ends?.end).toEqual({ kind: 'tee', wallId: 'W1', otherThickness: 3.5, cross: true });
    expect(w3!.ends?.start).toEqual({ kind: 'tee', wallId: 'W1', otherThickness: 3.5, cross: true });
  });

  it('parede dividida: junta com o painel vizinho em cada lado, lap da double top (P23)', () => {
    const { wall, config } = wallFixture(splitJson);
    const panels = splitWall(wall, config);
    expect(panels.length).toBeGreaterThan(1);
    const [first, second] = panels;
    expect(first!.ends).toEqual({ end: { kind: 'panel', panelId: second!.id, lap: expect.any(Number) } });
    expect(second!.ends?.start).toEqual({ kind: 'panel', panelId: first!.id, lap: first!.ends!.end!.kind === 'panel' ? first!.ends!.end!.lap : NaN });
  });

  it('house-28x40: os T caem no painel que os contém, em x do painel; pontas da parede só no primeiro/último', () => {
    const { house, config } = houseFixture(house28x40Json);
    const { panels } = panelizeHouse(house, config);
    const w03 = panels.filter((p) => p.wallId === 'W03');
    expect(w03.map((p) => p.tees?.length ?? 0).reduce((a, b) => a + b, 0)).toBe(1);
    const withTee = w03.find((p) => p.tees !== undefined)!;
    expect(withTee.tees![0]!.wallId).toBe('W05');
    expect(withTee.tees![0]!.x).toBeGreaterThan(0);
    expect(withTee.tees![0]!.x).toBeLessThan(withTee.length);
    expect(w03[0]!.ends?.start?.kind).toBe('corner');
    expect(w03[0]!.ends?.end?.kind).toBe('panel');
    expect(w03[w03.length - 1]!.ends?.end?.kind).toBe('corner');
  });
});
