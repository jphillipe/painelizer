/**
 * Projeto pequeno e inventado com as quatro causas do Matilda Pines (o projeto real do cliente não entra no
 * repositório). Só para testes.
 *
 * - X1, X2: externas portantes num prédio de 50' (600") — a R602.7(1) só vai até 36': `HEADER_OUT_OF_TABLE`.
 * - I1, I2, I3: internas não portantes de 9'-2 1/8" com porta de 6'-8" e cabeça a 6'-9 1/2" — a peça deitada fica a
 *   24 1/8" da top plate (`FLAT_HEADER_CRIPPLES`) e o RO da porta (80 + 2 1/2) não bate com o header
 *   (`DOOR_RO_HEIGHT_MISMATCH`).
 * - S1: 145 7/8" — o último stud (144 3/8") encosta no da marca de 144" (143 1/4"): `STUDS_OVERLAP`.
 */
export const fourCausesProject = {
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
} as const;
