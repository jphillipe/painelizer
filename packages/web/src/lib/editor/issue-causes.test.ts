import { describe, expect, it, vi } from 'vitest';
import { draftFromJson } from './draft';
import { causeCounts, groupIssues, openingInfo } from './issue-groups';
import { idIndex, parseEngineResult } from './problems';

// `server-only` lança fora do React Server; nos testes vira módulo vazio.
vi.mock('server-only', () => ({}));

const { check } = await import('@/services/panels.service');

/**
 * S46: um projeto pequeno e inventado com as quatro causas do Matilda Pines (o projeto real do cliente não entra no
 * repositório), passado pela checagem de verdade: 10 ocorrências, 4 linhas.
 *
 * - X1, X2: externas portantes num prédio de 50' (600") — a R602.7(1) só vai até 36': `HEADER_OUT_OF_TABLE`.
 * - I1, I2, I3: internas não portantes de 9'-2 1/8" com porta de 6'-8" e cabeça a 6'-9 1/2" — a peça deitada fica a
 *   24 1/8" da top plate (`FLAT_HEADER_CRIPPLES`) e o RO da porta (80 + 2 1/2) não bate com o header
 *   (`DOOR_RO_HEIGHT_MISMATCH`).
 * - S1: 145 7/8" — o último stud (144 3/8") encosta no da marca de 144" (143 1/4"): `STUDS_OVERLAP`.
 */
const project = {
  name: 'four-causes',
  config: {
    studSpacing: 16,
    studLength: [92.625, 105.625],
    headerHeight: 82.5,
    building: { groundSnowLoad: 30, buildingWidth: 600, windSpeed: 115 },
    openingTypes: {
      A: { kind: 'door', width: 36, height: 80 },
      B: { kind: 'door', width: 32, height: 80 },
      E: { kind: 'window', width: 36, height: 48 },
    },
  },
  walls: [
    {
      id: 'X1',
      length: 144,
      height: 97.125,
      section: '2x6',
      exterior: true,
      bearing: true,
      floorsSupported: 1,
      openings: [{ id: 'X1-E', tag: 'E', center: 72 }],
    },
    {
      id: 'X2',
      length: 144,
      height: 97.125,
      section: '2x6',
      exterior: true,
      bearing: true,
      floorsSupported: 1,
      openings: [{ id: 'X2-E', tag: 'E', center: 72 }],
    },
    {
      id: 'I1',
      length: 120,
      height: 110.125,
      section: '2x4',
      exterior: false,
      bearing: false,
      openings: [{ id: 'I1-A', tag: 'A', center: 60, headerHeight: 81.5 }],
    },
    {
      id: 'I2',
      length: 120,
      height: 110.125,
      section: '2x4',
      exterior: false,
      bearing: false,
      openings: [{ id: 'I2-B', tag: 'B', center: 60, headerHeight: 81.5 }],
    },
    {
      id: 'I3',
      length: 120,
      height: 110.125,
      section: '2x4',
      exterior: false,
      bearing: false,
      openings: [{ id: 'I3-A', tag: 'A', center: 60, headerHeight: 81.5 }],
    },
    { id: 'S1', length: 145.875, height: 97.125, section: '2x4', exterior: false, bearing: false, openings: [] },
  ],
};

describe('issues por causa, pela checagem real (S46)', () => {
  it('quatro causas: 1 to fix, 2 to review, 1 fine to leave, com as frases dos valores em comum', () => {
    const load = draftFromJson(project);
    if (!load.ok) throw new Error('draft should load');
    const result = check(JSON.stringify(project));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const ids = idIndex(load.draft);
    const groups = groupIssues(parseEngineResult(result, ids), ids, { openings: openingInfo(load.draft) });
    expect(groups.map((g) => [g.key, g.tier, g.count])).toEqual([
      ['HEADER_OUT_OF_TABLE', 'fix', 2],
      ['FLAT_HEADER_CRIPPLES', 'review', 3],
      ['DOOR_RO_HEIGHT_MISMATCH', 'review', 3],
      ['STUDS_OVERLAP', 'fine', 1],
    ]);
    expect(causeCounts(groups)).toEqual({ fix: 1, review: 2, fine: 1 });
    expect(groups.map((g) => g.summary)).toEqual([
      'The building is 50\'-0" wide with 30 psf ground snow, outside IRC table R602.7(1).',
      '3 doors (types A, B): flat header 24 1/8" below the top plate, over the 24" limit.',
      '3 doors (types A, B): RO height 6\'-10 1/2", header at 6\'-9 1/2".',
      undefined,
    ]);
  });
});
