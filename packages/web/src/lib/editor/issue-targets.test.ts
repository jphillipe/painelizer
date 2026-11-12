import { describe, expect, it } from 'vitest';
import { focusFor } from './issue-targets';
import type { Issue } from './problems';

const onOpening = (key: string): Issue => ({
  severity: 'warning',
  source: 'engine',
  text: 'x',
  wallId: 'W1',
  openingId: 'D1',
  ...(key.includes('.') ? { kind: key } : { code: key }),
});
const onWall = (key: string): Issue => ({
  severity: 'problem',
  source: 'engine',
  text: 'x',
  wallId: 'W1',
  ...(key.includes('.') ? { kind: key } : { code: key }),
});
const onProject = (key: string): Issue => ({
  severity: 'problem',
  source: 'engine',
  text: 'x',
  ...(key.includes('.') ? { kind: key } : { code: key }),
});

/** S47: cada família de issue sabe qual campo a resolve; o clique leva a seleção e o `id` do campo. */
describe('focusFor: abertura', () => {
  it.each([
    ['HEADER_OUT_OF_TABLE', ['o-D1-hby']],
    ['FLAT_HEADER_CRIPPLES', ['o-D1-hby']],
    ['FLAT_HEADER_SPAN', ['o-D1-hby']],
    ['HEADER_TOO_THICK', ['o-D1-hby']],
    ['HEADER_MARK_UNKNOWN', ['o-D1-hby']],
    ['opening.headerMark', ['o-D1-hby']],
    ['DOOR_RO_HEIGHT_MISMATCH', ['o-D1-hh']],
    ['HEADER_ABOVE_TOP_PLATE', ['o-D1-hh']],
    ['HEADER_NO_ROOM_FOR_JACK', ['o-D1-hh']],
    ['SILL_NO_ROOM', ['o-D1-sill']],
    ['DOOR_RO_HEIGHT_ASSUMED', ['o-D1-rh']],
    ['OPENING_NEAR_CORNER', ['o-D1-center', 'o-D1-offset']],
    ['OPENING_AT_TEE', ['o-D1-center', 'o-D1-offset']],
    ['OPENING_NUDGED', ['o-D1-center', 'o-D1-offset']],
    ['OPENINGS_TOO_CLOSE', ['o-D1-center', 'o-D1-offset']],
    ['OPENING_OFF_PLATE', ['o-D1-center', 'o-D1-offset']],
    ['OPENING_OUT_OF_WALL', ['o-D1-center', 'o-D1-offset']],
    ['OPENING_ESTIMATED', ['o-D1-center', 'o-D1-offset']],
    ['OPENING_POSITION_MISSING', ['o-D1-center', 'o-D1-offset']],
    ['opening.position', ['o-D1-center', 'o-D1-offset']],
    ['OPENING_TAG_UNKNOWN', ['o-D1-size']],
    ['opening.tag', ['o-D1-size']],
    ['OPENING_SIZE_MISSING', ['o-D1-rw']],
    ['opening.size', ['o-D1-rw']],
    ['OPENING_TYPE_MISSING', ['o-D1-type']],
    ['opening.type', ['o-D1-type']],
    ['HEADER_JACKS_BELOW_TABLE', ['o-D1-jacks']],
    ['HEADER_KINGS_BELOW_TABLE', ['o-D1-kings']],
    ['KINGS_OUT_OF_TABLE', ['o-D1-kings']],
    ['opening.duplicateId', ['o-D1-id']],
  ])('%s → %j', (key, fieldIds) => {
    expect(focusFor(onOpening(key))).toEqual({
      selection: { kind: 'opening', wallId: 'W1', openingId: 'D1' },
      fieldIds,
    });
  });

  it('issue de abertura sem a abertura no draft: sem alvo', () => {
    expect(focusFor(onWall('HEADER_OUT_OF_TABLE'))).toBeUndefined();
    expect(focusFor(onProject('FLAT_HEADER_CRIPPLES'))).toBeUndefined();
  });
});

describe('focusFor: parede', () => {
  it.each([
    ['wall.height', 'w-W1-height'],
    ['STUD_LENGTH_MISMATCH', 'w-W1-height'],
    ['STUD_HEIGHT_ABOVE_LIMIT', 'w-W1-height'],
    ['wall.section', 'w-W1-section'],
    ['wall.exterior', 'w-W1-ext'],
    ['wall.bearing', 'w-W1-bearing'],
    ['wall.wallType', 'w-W1-type'],
    ['WALL_TYPE_MISMATCH', 'w-W1-type'],
    ['wall.floorsSupported', 'w-W1-floors'],
    ['wall.length', 'w-W1-len'],
    ['wall.duplicateId', 'w-W1-id'],
    ['wall.ends', 'w-W1-sx'],
    ['wall.noAxis', 'w-W1-sx'],
    ['WALL_OFF_AXIS', 'w-W1-sx'],
    ['WALL_ZERO_LENGTH', 'w-W1-sx'],
  ])('%s → %s', (key, fieldId) => {
    expect(focusFor(onWall(key))).toEqual({ selection: { kind: 'wall', wallId: 'W1' }, fieldIds: [fieldId] });
  });

  it('a issue de parede numa abertura também leva ao campo da parede; sem parede, sem alvo', () => {
    expect(focusFor(onOpening('STUD_LENGTH_MISMATCH'))).toEqual({
      selection: { kind: 'wall', wallId: 'W1' },
      fieldIds: ['w-W1-height'],
    });
    expect(focusFor(onProject('wall.height'))).toBeUndefined();
  });
});

describe('focusFor: projeto', () => {
  it.each([
    ['WIND_SPEED_MISSING', 'b-wind'],
    ['config.building', 'b-snow'],
    ['HEADER_DATA_MISSING', 'b-snow'],
    ['config.studSpacing', 'c-spacing'],
    ['config.studLength', 'c-precuts'],
    ['DEFAULT_HEADER_HEIGHT', 'c-hh'],
    ['PANEL_OVERWEIGHT', 'pn-weight'],
    ['PIECE_OVER_STOCK', 'c-stock'],
  ])('%s → %s', (key, fieldId) => {
    expect(focusFor(onProject(key))).toEqual({ selection: { kind: 'project' }, fieldIds: [fieldId] });
    // a mesma issue citando uma parede continua sendo do projeto
    expect(focusFor(onWall(key))).toEqual({ selection: { kind: 'project' }, fieldIds: [fieldId] });
  });

  it('família sem campo que a resolva: sem alvo', () => {
    expect(focusFor(onWall('STUDS_OVERLAP'))).toBeUndefined();
    expect(focusFor(onProject('walls.empty'))).toBeUndefined();
    expect(focusFor({ severity: 'problem', source: 'draft', text: 'free text' })).toBeUndefined();
  });
});
