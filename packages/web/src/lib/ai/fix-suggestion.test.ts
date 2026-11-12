import type { FixSuggestion } from 'extract/suggest';
import { describe, expect, it } from 'vitest';
import { draftFromJson, type ProjectDraft } from '@/lib/editor/draft';
import { groupIssues } from '@/lib/editor/issue-groups';
import { issueFromNotice, type IdIndex } from '@/lib/editor/problems';
import {
  describeEdits,
  issueForSuggestion,
  MAX_OCCURRENCES,
  suggestPrompt,
  SUGGEST_SYSTEM,
  toDraftEdits,
  touchesStructural,
} from './fix-suggestion';

const project = {
  name: 'x',
  $underlay: { secret: 'never sent' },
  config: {
    studSpacing: 16,
    studLength: [92.625, 105.625],
    headerHeight: 82.5,
    building: { groundSnowLoad: 30, buildingWidth: 600 },
    openingTypes: {
      A: { kind: 'door', width: 36, height: 80 },
      B: { kind: 'door', width: 32, height: 80 },
      Z: { kind: 'window', width: 36, height: 48 },
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
      openings: [{ id: 'X1-E', type: 'window', center: 72, roughWidth: 36, roughHeight: 48 }],
    },
    {
      id: 'I1',
      length: 120,
      height: 110.125,
      section: '2x4',
      exterior: false,
      bearing: false,
      $reviewed: true,
      openings: [{ id: 'I1-A', tag: 'A', center: 60, headerHeight: 81.5 }],
    },
    {
      id: 'I2',
      length: 120,
      height: 110.125,
      section: '2x4',
      exterior: false,
      bearing: false,
      openings: [{ id: 'I2-B', tag: 'B', offset: 40, headerHeight: 81.5 }],
    },
  ],
};
const draft = ((): ProjectDraft => {
  const load = draftFromJson(project);
  if (!load.ok) throw new Error('draft should load');
  return load.draft;
})();
const ids: IdIndex = {
  walls: ['X1', 'I1', 'I2'],
  openings: new Map([
    ['X1', ['X1-E']],
    ['I1', ['I1-A']],
    ['I2', ['I2-B']],
  ]),
};
const mismatch = (wallId: string, openingId: string) =>
  issueFromNotice(
    {
      source: 'engine',
      code: 'DOOR_RO_HEIGHT_MISMATCH',
      message: 'porta…',
      wallId,
      openingId,
      params: { roughHeight: 82.5, headerBase: 81.5 },
    },
    'warning',
    ids,
  );
const group = groupIssues([mismatch('I1', 'I1-A'), mismatch('I2', 'I2-B')], ids)[0]!;
const edit = (e: Partial<FixSuggestion['edits'][number]>): FixSuggestion['edits'][number] => ({
  target: 'opening',
  wallId: '',
  openingId: '',
  tag: '',
  field: 'headerHeight',
  value: '',
  ...e,
});
const suggestion = (edits: FixSuggestion['edits']): FixSuggestion => ({
  explanation: 'x',
  confidence: 'medium',
  needsFromHuman: '',
  edits,
});

/** S51: o que vai para a IA — a causa e só o trecho do projeto que ela toca. */
describe('issueForSuggestion / suggestPrompt', () => {
  it('a causa leva título, ajuda, frase-resumo e as ocorrências com parede, abertura, frase em inglês e parâmetros', () => {
    const issue = issueForSuggestion(group);
    expect(issue).toMatchObject({
      family: 'DOOR_RO_HEIGHT_MISMATCH',
      severity: 'warning',
      title: 'Door RO height differs from the header height',
      total: 2,
    });
    expect(issue.what).toMatch(/rough opening/);
    expect(issue.fix).toBeDefined();
    expect(issue.occurrences).toHaveLength(2);
    expect(issue.occurrences[0]).toMatchObject({
      wallId: 'I1',
      openingId: 'I1-A',
      params: { roughHeight: 82.5, headerBase: 81.5 },
    });
    expect(issue.occurrences[0]!.message).toMatch(/I1-A/);
  });

  it('no máximo MAX_OCCURRENCES ocorrências; o total continua o verdadeiro', () => {
    const many = Array.from({ length: MAX_OCCURRENCES + 15 }, () => mismatch('I1', 'I1-A'));
    const issue = issueForSuggestion(groupIssues(many, ids)[0]!);
    expect(issue.occurrences).toHaveLength(MAX_OCCURRENCES);
    expect(issue.total).toBe(MAX_OCCURRENCES + 15);
  });

  it('o pedido leva só as paredes citadas, os tipos que elas usam e as notas da leitura; nenhuma chave do editor', () => {
    const { system, user } = suggestPrompt(issueForSuggestion(group), draft, ['Headers per SA1.2.']);
    expect(system).toBe(SUGGEST_SYSTEM);
    const sent = JSON.parse(user) as {
      issue: { family: string };
      project: { config: { openingTypes: object; building: object }; walls: { id: string }[] };
      readingNotes: string[];
    };
    expect(sent.issue.family).toBe('DOOR_RO_HEIGHT_MISMATCH');
    expect(sent.project.walls.map((w) => w.id)).toEqual(['I1', 'I2']);
    expect(Object.keys(sent.project.config.openingTypes)).toEqual(['A', 'B']);
    expect(sent.project.config.building).toEqual({ groundSnowLoad: 30, buildingWidth: 600 });
    expect(sent.readingNotes).toEqual(['Headers per SA1.2.']);
    expect(user).not.toContain('$');
    expect(user).not.toContain('never sent');
  });

  it('as regras: não inventar valor estrutural, menor mudança, sem edição quando falta informação, só o vocabulário', () => {
    expect(SUGGEST_SYSTEM).toMatch(/never invent/i);
    expect(SUGGEST_SYSTEM).toMatch(/needsFromHuman/);
    expect(SUGGEST_SYSTEM).toMatch(/headerSection/);
    expect(SUGGEST_SYSTEM).toMatch(/decimal inches/i);
  });
});

/** S51: a resposta da IA só vira edição depois de conferida contra o projeto, campo a campo. */
describe('toDraftEdits', () => {
  it('medidas, contagens, booleanos e seção viram o patch certo; campos do mesmo alvo juntam numa edição', () => {
    const { edits, rejected } = toDraftEdits(
      suggestion([
        edit({ wallId: 'I1', openingId: 'I1-A', field: 'headerHeight', value: '82.5' }),
        edit({ wallId: 'I1', openingId: 'I1-A', field: 'jackStuds', value: '2' }),
        edit({ target: 'wall', wallId: 'I2', field: 'bearing', value: 'true' }),
        edit({ target: 'wall', wallId: 'I2', field: 'section', value: '2x6' }),
        edit({ target: 'openingType', tag: 'A', field: 'roughHeight', value: '81.5' }),
        edit({ target: 'project', field: 'headerHeight', value: '81.5' }),
        edit({ target: 'project', field: 'windSpeed', value: '115' }),
      ]),
      draft,
    );
    expect(rejected).toEqual([]);
    expect(edits).toEqual([
      { target: 'opening', wallId: 'I1', openingId: 'I1-A', patch: { headerHeight: 82.5, jackStuds: 2 } },
      { target: 'wall', wallId: 'I2', patch: { bearing: true, section: '2x6' } },
      { target: 'openingType', tag: 'A', patch: { roughHeight: 81.5 } },
      { target: 'config', patch: { headerHeight: 81.5 } },
      { target: 'building', patch: { windSpeed: 115 } },
    ]);
  });

  it('header: seção e plies juntos viram `header` e tiram a marca; só um dos dois, sem header na abertura, é recusado', () => {
    const both = toDraftEdits(
      suggestion([
        edit({ wallId: 'X1', openingId: 'X1-E', field: 'headerSection', value: '2x12' }),
        edit({ wallId: 'X1', openingId: 'X1-E', field: 'headerPlies', value: '3' }),
      ]),
      draft,
    );
    expect(both.edits).toStrictEqual([
      {
        target: 'opening',
        wallId: 'X1',
        openingId: 'X1-E',
        patch: { header: { section: '2x12', plies: 3 }, headerMark: undefined },
      },
    ]);
    const half = toDraftEdits(
      suggestion([edit({ wallId: 'X1', openingId: 'X1-E', field: 'headerSection', value: '2x12' })]),
      draft,
    );
    expect(half.edits).toEqual([]);
    expect(half.rejected[0]).toMatch(/X1-E.*section and plies/);
    const bad = toDraftEdits(
      suggestion([
        edit({ wallId: 'X1', openingId: 'X1-E', field: 'headerSection', value: '2x13' }),
        edit({ wallId: 'X1', openingId: 'X1-E', field: 'headerPlies', value: '2' }),
      ]),
      draft,
    );
    expect(bad.edits).toEqual([]);
    expect(bad.rejected.join(' ')).toMatch(/2x13/);
  });

  it('posição: eixo e borda não convivem — dar um apaga o outro; texto vazio limpa só campo opcional', () => {
    const moved = toDraftEdits(
      suggestion([edit({ wallId: 'I2', openingId: 'I2-B', field: 'center', value: '70' })]),
      draft,
    );
    expect(moved.edits).toStrictEqual([
      { target: 'opening', wallId: 'I2', openingId: 'I2-B', patch: { center: 70, offset: undefined } },
    ]);
    const cleared = toDraftEdits(
      suggestion([edit({ wallId: 'I1', openingId: 'I1-A', field: 'headerHeight', value: '' })]),
      draft,
    );
    expect(cleared.edits).toStrictEqual([
      { target: 'opening', wallId: 'I1', openingId: 'I1-A', patch: { headerHeight: undefined } },
    ]);
    const required = toDraftEdits(
      suggestion([edit({ target: 'wall', wallId: 'I1', field: 'height', value: '' })]),
      draft,
    );
    expect(required.edits).toEqual([]);
    expect(required.rejected).toHaveLength(1);
  });

  it('id inventado, campo de outro alvo e valor inválido são recusados com o motivo; o resto vale', () => {
    const { edits, rejected } = toDraftEdits(
      suggestion([
        edit({ wallId: 'I9', openingId: 'NOPE', field: 'headerHeight', value: '82.5' }),
        edit({ wallId: 'I2', openingId: 'I1-A', field: 'headerHeight', value: '82.5' }),
        edit({ target: 'wall', wallId: 'I1', field: 'center', value: '10' }),
        edit({ target: 'openingType', tag: 'Q', field: 'roughHeight', value: '81.5' }),
        edit({ wallId: 'I1', openingId: 'I1-A', field: 'headerHeight', value: 'tall' }),
        edit({ wallId: 'I1', openingId: 'I1-A', field: 'jackStuds', value: '1.5' }),
        edit({ wallId: 'I1', openingId: 'I1-A', field: 'roughHeight', value: '-3' }),
        edit({ target: 'wall', wallId: 'I1', field: 'bearing', value: 'yes' }),
        edit({ wallId: 'I1', openingId: 'I1-A', field: 'sillHeight', value: '0' }),
      ]),
      draft,
    );
    expect(edits).toEqual([{ target: 'opening', wallId: 'I1', openingId: 'I1-A', patch: { sillHeight: 0 } }]);
    expect(rejected).toHaveLength(8);
    expect(rejected[0]).toMatch(/NOPE.*not in the project/);
    expect(rejected.join('\n')).toMatch(/does not apply/);
    expect(rejected.join('\n')).toMatch(/"tall"/);
  });
});

describe('describeEdits / touchesStructural', () => {
  it('edições iguais em várias aberturas viram uma linha; medidas em pés e polegadas; header como seção × plies', () => {
    const header = { header: { section: '2x12', plies: 3 }, headerMark: undefined };
    const lines = describeEdits(
      [
        { target: 'opening', wallId: 'X1', openingId: 'X1-E', patch: header },
        { target: 'opening', wallId: 'I1', openingId: 'I1-A', patch: header },
        { target: 'opening', wallId: 'I2', openingId: 'I2-B', patch: { headerHeight: 82.5, jackStuds: undefined } },
        { target: 'openingType', tag: 'A', patch: { roughHeight: 81.5 } },
        { target: 'wall', wallId: 'I1', patch: { bearing: true } },
        { target: 'config', patch: { headerHeight: 81.5 } },
        { target: 'building', patch: { windSpeed: 115 } },
      ],
      draft,
    );
    expect(lines).toEqual([
      '2 openings (X1-E, I1-A): Header → 2x12 × 3',
      'Opening I2-B: Top of RO → 6\'-10 1/2"; Jack studs per side → cleared',
      'Opening type A: RO height → 6\'-9 1/2"',
      'Wall I1: Load → Bearing',
      'Project settings: Top of RO → 6\'-9 1/2"',
      'Project settings: Wind speed → 115 mph',
    ]);
  });

  it('valor estrutural: header, jacks, kings, carga da parede e dados do prédio', () => {
    expect(
      touchesStructural([{ target: 'opening', wallId: 'I1', openingId: 'I1-A', patch: { headerHeight: 82.5 } }]),
    ).toBe(false);
    expect(touchesStructural([{ target: 'openingType', tag: 'A', patch: { roughHeight: 81.5 } }])).toBe(false);
    expect(
      touchesStructural([
        { target: 'opening', wallId: 'I1', openingId: 'I1-A', patch: { header: { section: '2x12', plies: 3 } } },
      ]),
    ).toBe(true);
    expect(touchesStructural([{ target: 'opening', wallId: 'I1', openingId: 'I1-A', patch: { kingStuds: 2 } }])).toBe(
      true,
    );
    expect(touchesStructural([{ target: 'wall', wallId: 'I1', patch: { bearing: false } }])).toBe(true);
    expect(touchesStructural([{ target: 'building', patch: { windSpeed: 115 } }])).toBe(true);
    expect(touchesStructural([{ target: 'config', patch: { headerHeight: 80 } }])).toBe(false);
  });
});

/** S51 (revisão). */
describe('revisão da S51: transporte, marca estrutural e nomes herdados', () => {
  it('toWire / fromWire: a limpeza (undefined) viaja como null e volta como undefined', async () => {
    const { fromWire, toWire } = await import('./fix-suggestion');
    const edits = [
      { target: 'opening' as const, wallId: 'I2', openingId: 'I2-B', patch: { center: 70, offset: undefined } },
      {
        target: 'opening' as const,
        wallId: 'X1',
        openingId: 'X1-E',
        patch: { header: { section: '2x12', plies: 3 }, headerMark: undefined },
      },
    ];
    const wire = toWire(edits);
    expect(wire[0]!.patch).toStrictEqual({ center: 70, offset: null });
    expect(JSON.parse(JSON.stringify(wire))).toEqual(wire);
    expect(fromWire(JSON.parse(JSON.stringify(wire)))).toStrictEqual(edits);
  });

  it('valor estrutural também: parede externa / interna (escolhe a tabela do header) e espaçamento dos studs', () => {
    expect(touchesStructural([{ target: 'wall', wallId: 'I1', patch: { exterior: false } }])).toBe(true);
    expect(touchesStructural([{ target: 'config', patch: { studSpacing: 24 } }])).toBe(true);
    expect(SUGGEST_SYSTEM).toMatch(/exterior/);
  });

  it('tipo de abertura com nome herdado do objeto ("constructor") não passa por existente', () => {
    const { edits, rejected } = toDraftEdits(
      suggestion([edit({ target: 'openingType', tag: 'constructor', field: 'roughHeight', value: '81.5' })]),
      draft,
    );
    expect(edits).toEqual([]);
    expect(rejected[0]).toMatch(/constructor.*not in the project/);
  });

  it('notas da leitura além do teto ficam de fora, e o pedido diz quantas', () => {
    const notes = Array.from({ length: 30 }, (_, i) => String(i).padStart(2, '0') + ' ' + 'n'.repeat(1997));
    const sent = JSON.parse(suggestPrompt(issueForSuggestion(group), draft, notes).user) as {
      readingNotes: string[];
      readingNotesOmitted?: number;
    };
    expect(sent.readingNotes).toHaveLength(10);
    expect(sent.readingNotesOmitted).toBe(20);
    const few = JSON.parse(suggestPrompt(issueForSuggestion(group), draft, ['a']).user) as {
      readingNotesOmitted?: number;
    };
    expect(few.readingNotesOmitted).toBeUndefined();
  });
});
