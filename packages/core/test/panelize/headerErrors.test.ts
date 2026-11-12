import { describe, expect, it } from 'vitest';
import { headerErrors } from '../../src/panelize/panelizeWall';
import type { Config, Wall } from '../../src/types';
import ircJson from '../fixtures/wall-144-window-irc.json';
import nonBearingDoorJson from '../fixtures/wall-120-door-nonbearing.json';
import { wallFixture } from '../helpers/fixtures';

const irc = wallFixture(ircJson);
const nonBearingDoor = wallFixture(nonBearingDoorJson);

/**
 * S48: o header de cada abertura é resolvido sozinho, então dá para relatar o erro de todas as aberturas de uma
 * parede de uma vez — o painel continua não saindo; só o relato fica completo.
 */
describe('headerErrors', () => {
  const win = irc.wall.openings[0]!;
  // prédio de 50' (600"): fora da R602.7(1), que vai até 36'
  const wide: Config = { ...irc.config, building: { ...irc.config.building!, buildingWidth: 600 } };
  const twoWindows: Wall = {
    ...irc.wall,
    openings: [
      { ...win, id: 'win1', offset: 24 },
      { ...win, id: 'win2', offset: 84 },
    ],
  };

  it('duas aberturas fora da tabela: um erro por abertura, na ordem da parede, com parede e abertura', () => {
    const errors = headerErrors(twoWindows, wide);
    expect(errors.map((e) => [e.code, e.wallId, e.openingId])).toEqual([
      ['HEADER_OUT_OF_TABLE', 'W-window-irc', 'win1'],
      ['HEADER_OUT_OF_TABLE', 'W-window-irc', 'win2'],
    ]);
    expect(errors[0]!.params).toMatchObject({ why: 'width', width: 600 });
  });

  it('abertura com header do projeto não entra; a outra entra', () => {
    const one: Wall = {
      ...twoWindows,
      openings: [{ ...twoWindows.openings[0]!, header: { section: '2x10', plies: 2 } }, twoWindows.openings[1]!],
    };
    expect(headerErrors(one, wide).map((e) => e.openingId)).toEqual(['win2']);
  });

  it('parede que o motor resolve pela tabela, e parede não portante: nenhum erro', () => {
    expect(headerErrors(irc.wall, irc.config)).toEqual([]);
    expect(headerErrors(twoWindows, irc.config)).toEqual([]);
    expect(headerErrors(nonBearingDoor.wall, nonBearingDoor.config)).toEqual([]);
  });

  it('dado do projeto faltando: um erro por abertura (HEADER_DATA_MISSING)', () => {
    const { building: _building, ...noBuilding } = irc.config;
    expect(headerErrors(twoWindows, noBuilding as Config).map((e) => [e.code, e.openingId])).toEqual([
      ['HEADER_DATA_MISSING', 'win1'],
      ['HEADER_DATA_MISSING', 'win2'],
    ]);
  });

  it('não esconde erro que não é do motor (TypeError de dado quebrado)', () => {
    const broken = { ...twoWindows, openings: [null as never] };
    expect(() => headerErrors(broken, wide)).toThrow(TypeError);
  });
});
