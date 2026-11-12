import { describe, expect, it } from 'vitest';
import { draftFromJson, type ProjectDraft } from './draft';
import { doorHeightEdits, groupFixFor, setHeaderEdits, type GroupFix } from './group-fixes';
import { groupIssues, type OpeningInfo } from './issue-groups';
import { issueFromNotice, type IdIndex, type Issue } from './problems';

const ids: IdIndex = {
  walls: ['X1', 'X2', 'I1', 'I2', 'I3'],
  openings: new Map([
    ['X1', ['X1-a', 'X1-b']],
    ['X2', ['X2-a']],
    ['I1', ['I1-d']],
    ['I2', ['I2-d']],
    ['I3', ['I3-d']],
  ]),
};
const info = new Map<string, OpeningInfo>([
  ['X1-a', { tag: 'E2', kind: 'window' }],
  ['X1-b', { tag: 'F', kind: 'window' }],
  ['X2-a', { tag: 'E2', kind: 'window' }],
  ['I1-d', { tag: 'A', kind: 'door' }],
  ['I2-d', { tag: 'A', kind: 'door' }],
  ['I3-d', { kind: 'door' }],
]);
const issue = (
  code: string,
  wallId: string,
  openingId: string,
  params: Record<string, unknown>,
  severity: 'problem' | 'warning' = 'warning',
): Issue => issueFromNotice({ source: 'engine', code, message: 'x', wallId, openingId, params }, severity, ids);
const groupOf = (issues: Issue[]) => groupIssues(issues, ids, { openings: info })[0]!;
const outOfTable = (wallId: string, openingId: string): Issue =>
  issue('HEADER_OUT_OF_TABLE', wallId, openingId, { why: 'width', width: 600 }, 'problem');
const mismatch = (wallId: string, openingId: string, roughHeight = 82.5): Issue =>
  issue('DOOR_RO_HEIGHT_MISMATCH', wallId, openingId, { roughHeight, headerBase: 81.5 });

/** S49: o que a linha de uma causa oferece para resolver todas as ocorrências de uma vez. */
describe('groupFixFor', () => {
  it('header: um escopo para todas e, com mais de um tipo, um por tipo em ordem alfabética', () => {
    const fix = groupFixFor(
      groupOf([outOfTable('X1', 'X1-a'), outOfTable('X1', 'X1-b'), outOfTable('X2', 'X2-a')]),
      info,
    );
    expect(fix).toEqual({
      kind: 'setHeader',
      scopes: [
        {
          key: 'all',
          label: 'All 3 openings',
          openings: [
            { wallId: 'X1', openingId: 'X1-a' },
            { wallId: 'X1', openingId: 'X1-b' },
            { wallId: 'X2', openingId: 'X2-a' },
          ],
        },
        {
          key: 'tag:E2',
          label: 'Type E2 (2)',
          openings: [
            { wallId: 'X1', openingId: 'X1-a' },
            { wallId: 'X2', openingId: 'X2-a' },
          ],
        },
        { key: 'tag:F', label: 'Type F (1)', openings: [{ wallId: 'X1', openingId: 'X1-b' }] },
      ],
    } satisfies GroupFix);
  });

  it('header: um tipo só (ou uma abertura só) não oferece escopo por tipo; sem tipo vira "No type"', () => {
    expect(groupFixFor(groupOf([outOfTable('X1', 'X1-a'), outOfTable('X2', 'X2-a')]), info)).toMatchObject({
      scopes: [{ key: 'all', label: 'All 2 openings' }],
    });
    expect(groupFixFor(groupOf([outOfTable('X1', 'X1-a')]), info)).toMatchObject({
      scopes: [{ key: 'all', label: 'This opening' }],
    });
    const mixed = groupFixFor(
      groupOf([
        issue('FLAT_HEADER_CRIPPLES', 'I1', 'I1-d', { gap: 24.125, max: 24 }),
        issue('FLAT_HEADER_CRIPPLES', 'I3', 'I3-d', { gap: 24.125, max: 24 }),
      ]),
      info,
    );
    expect(mixed).toMatchObject({
      kind: 'setHeader',
      scopes: [{ key: 'all' }, { key: 'tag:A', label: 'Type A (1)' }, { key: 'tag:', label: 'No type (1)' }],
    });
    expect(
      groupFixFor(groupOf([issue('FLAT_HEADER_SPAN', 'I1', 'I1-d', { span: 120 }, 'problem')]), info),
    ).toMatchObject({ kind: 'setHeader' });
  });

  it('altura de porta: só quando todas as ocorrências têm as mesmas duas medidas', () => {
    expect(groupFixFor(groupOf([mismatch('I1', 'I1-d'), mismatch('I2', 'I2-d')]), info)).toEqual({
      kind: 'doorHeight',
      roughHeight: 82.5,
      headerBase: 81.5,
      openings: [
        { wallId: 'I1', openingId: 'I1-d' },
        { wallId: 'I2', openingId: 'I2-d' },
      ],
    });
    expect(groupFixFor(groupOf([mismatch('I1', 'I1-d'), mismatch('I2', 'I2-d', 84)]), info)).toBeUndefined();
  });

  it('famílias sem conserto em grupo, e issue sem abertura', () => {
    expect(groupFixFor(groupOf([issue('STUDS_OVERLAP', 'I1', 'I1-d', {})]), info)).toBeUndefined();
    expect(
      groupFixFor(
        groupOf([{ severity: 'problem', source: 'engine', code: 'HEADER_OUT_OF_TABLE', text: 'x', wallId: 'X1' }]),
        info,
      ),
    ).toBeUndefined();
  });
});

describe('setHeaderEdits', () => {
  it('header direto em cada abertura do escopo, tirando a marca do schedule; jacks só quando informados', () => {
    const scope = {
      key: 'all',
      label: 'All 2 openings',
      openings: [
        { wallId: 'X1', openingId: 'X1-a' },
        { wallId: 'X2', openingId: 'X2-a' },
      ],
    };
    expect(setHeaderEdits(scope, { section: '2x12', plies: 3 })).toEqual([
      {
        target: 'opening',
        wallId: 'X1',
        openingId: 'X1-a',
        patch: { header: { section: '2x12', plies: 3 }, headerMark: undefined },
      },
      {
        target: 'opening',
        wallId: 'X2',
        openingId: 'X2-a',
        patch: { header: { section: '2x12', plies: 3 }, headerMark: undefined },
      },
    ]);
    expect(setHeaderEdits(scope, { section: '2x12', plies: 3, jackStuds: 2 })[0]).toMatchObject({
      patch: { header: { section: '2x12', plies: 3, jackStuds: 2 } },
    });
  });
});

describe('doorHeightEdits', () => {
  const draftOf = (walls: object[]): ProjectDraft => {
    const load = draftFromJson({
      config: { studSpacing: 16, studLength: [105.625], openingTypes: { A: { kind: 'door', width: 36, height: 80 } } },
      walls,
    });
    if (!load.ok) throw new Error('draft should load');
    return load.draft;
  };
  const wall = (id: string, openings: object[]): object => ({
    id,
    length: 120,
    height: 110.125,
    section: '2x4',
    exterior: false,
    bearing: false,
    openings,
  });
  const fix = (openings: { wallId: string; openingId: string }[]): Extract<GroupFix, { kind: 'doorHeight' }> => ({
    kind: 'doorHeight',
    roughHeight: 82.5,
    headerBase: 81.5,
    openings,
  });

  it('usar a altura do header como RO: pelo tipo quando todas as portas do tipo estão na linha', () => {
    const draft = draftOf([
      wall('I1', [{ id: 'I1-d', tag: 'A', center: 60, headerHeight: 81.5 }]),
      wall('I2', [{ id: 'I2-d', tag: 'A', center: 60, headerHeight: 81.5 }]),
    ]);
    const edits = doorHeightEdits(
      fix([
        { wallId: 'I1', openingId: 'I1-d' },
        { wallId: 'I2', openingId: 'I2-d' },
      ]),
      'roFromHeader',
      draft,
    );
    expect(edits).toEqual([{ target: 'openingType', tag: 'A', patch: { roughHeight: 81.5 } }]);
  });

  it('tipo usado por uma porta fora da linha: não mexe no tipo, edita as aberturas da linha', () => {
    const draft = draftOf([
      wall('I1', [{ id: 'I1-d', tag: 'A', center: 60, headerHeight: 81.5 }]),
      wall('I2', [{ id: 'I2-d', tag: 'A', center: 60 }]),
    ]);
    const edits = doorHeightEdits(fix([{ wallId: 'I1', openingId: 'I1-d' }]), 'roFromHeader', draft);
    expect(edits).toEqual([{ target: 'opening', wallId: 'I1', openingId: 'I1-d', patch: { roughHeight: 81.5 } }]);
  });

  it('porta sem tipo, ou com altura de RO própria: a edição é na abertura', () => {
    const draft = draftOf([
      wall('I1', [{ id: 'I1-d', tag: 'A', center: 60, headerHeight: 81.5, roughHeight: 82.5 }]),
      wall('I3', [{ id: 'I3-d', type: 'door', center: 60, roughWidth: 38, roughHeight: 82.5, headerHeight: 81.5 }]),
    ]);
    const edits = doorHeightEdits(
      fix([
        { wallId: 'I1', openingId: 'I1-d' },
        { wallId: 'I3', openingId: 'I3-d' },
      ]),
      'roFromHeader',
      draft,
    );
    expect(edits).toEqual([
      { target: 'opening', wallId: 'I1', openingId: 'I1-d', patch: { roughHeight: 81.5 } },
      { target: 'opening', wallId: 'I3', openingId: 'I3-d', patch: { roughHeight: 81.5 } },
    ]);
  });

  it('subir o header até o RO da porta: o topo do RO de cada abertura', () => {
    const draft = draftOf([wall('I1', [{ id: 'I1-d', tag: 'A', center: 60, headerHeight: 81.5 }])]);
    expect(doorHeightEdits(fix([{ wallId: 'I1', openingId: 'I1-d' }]), 'headerFromRo', draft)).toEqual([
      { target: 'opening', wallId: 'I1', openingId: 'I1-d', patch: { headerHeight: 82.5 } },
    ]);
  });
});
