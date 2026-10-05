/**
 * Tabela de headers FALSA, só para testar a lógica de seleção e as conferências de coerência.
 * Valores inventados e propositalmente diferentes do IRC (colunas de 20/40 psf e 10'/30'); nunca usar
 * como dado. Mesmo formato de `src/data/irc-headers.json`; devolve cópia nova a cada chamada.
 *
 * Colunas externas: A = 20 psf/10', B = 20 psf/30', C = 40 psf/10', D = 40 psf/30'.
 */

type Cell = [string, number] | null;
const row = (plies: number, section: string, ...cells: Cell[]) => ({ plies, section, cells });

export function fakeHeaderJson() {
  return {
    $comment: 'FALSA',
    source: { code: 'FAKE' },
    tables: [
      {
        id: 'FAKE-EXT',
        exterior: true,
        columns: [
          { groundSnowLoad: 20, buildingWidth: "10'" },
          { groundSnowLoad: 20, buildingWidth: "30'" },
          { groundSnowLoad: 40, buildingWidth: "10'" },
          { groundSnowLoad: 40, buildingWidth: "30'" },
        ],
        groups: [
          {
            supports: { floors: 0 },
            headers: [
              row(1, '2x8', ["4'-0", 1], ["3'-0", 1], ["3'-6", 1], ["2'-6", 1]),
              row(2, '2x6', ["5'-0", 1], ["4'-0", 1], ["4'-6", 1], ["3'-6", 1]),
              row(2, '2x10', ["8'-0", 2], ["7'-0", 2], ["7'-6", 2], ["6'-0", 2]),
              row(3, '2x10', ["10'-0", 2], ["9'-0", 2], ["9'-6", 2], ["8'-0", 2]),
              row(4, '2x12', ["14'-0", 3], ["13'-0", 3], ["13'-6", 3], null),
            ],
          },
          {
            supports: { floors: 1, floorSpan: 'center' },
            headers: [
              row(1, '2x8', ["3'-6", 1], ["2'-6", 1], ["3'-0", 1], ["2'-0", 1]),
              row(2, '2x6', ["4'-6", 1], ["3'-6", 1], ["4'-0", 1], ["3'-0", 1]),
              row(2, '2x10', ["7'-0", 2], ["6'-0", 2], ["6'-6", 2], ["5'-0", 2]),
              row(3, '2x10', ["9'-0", 2], ["8'-0", 2], ["8'-6", 2], ["7'-0", 2]),
              row(4, '2x12', ["12'-0", 3], ["11'-0", 3], ["11'-6", 3], null),
            ],
          },
          {
            supports: { floors: 1, floorSpan: 'clear' },
            headers: [
              row(1, '2x8', ["3'-0", 1], ["2'-0", 1], ["2'-6", 1], ["1'-6", 1]),
              row(2, '2x6', ["4'-0", 1], ["3'-0", 2], ["3'-6", 1], ["2'-6", 2]),
              row(2, '2x10', ["6'-6", 2], ["5'-6", 3], ["6'-0", 2], ["4'-6", 3]),
              row(3, '2x10', ["8'-6", 2], ["7'-6", 2], ["8'-0", 2], ["6'-6", 3]),
              row(4, '2x12', ["11'-0", 3], ["10'-0", 3], ["10'-6", 3], null),
            ],
          },
        ],
      },
      {
        id: 'FAKE-INT',
        exterior: false,
        columns: [{ buildingWidth: "10'" }, { buildingWidth: "30'" }],
        groups: [
          {
            supports: { floors: 1 },
            headers: [row(2, '2x6', ["4'-0", 1], ["3'-0", 1]), row(2, '2x10', ["7'-0", 2], ["6'-0", 2])],
          },
          {
            supports: { floors: 2 },
            headers: [row(2, '2x6', ["3'-0", 1], ["2'-0", 2]), row(2, '2x10', ["5'-0", 2], ["4'-0", 2])],
          },
        ],
      },
    ],
  };
}

export type FakeHeaderJson = ReturnType<typeof fakeHeaderJson>;
