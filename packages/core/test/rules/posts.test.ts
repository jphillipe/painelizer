import { describe, expect, it } from 'vitest';
import type { Config, Member, PostMember, Wall } from '../../src/types';
import { EngineError } from '../../src/messages';
import { postFace, postMembers, postsForSegment } from '../../src/rules/posts';
import { whyNotBreak } from '../../src/rules/breaks';
import { teeStrips } from '../../src/rules/corners';
import { frameWalls } from '../../src/house/frame';
import { framePanel, panelizeWall } from '../../src/panelize/panelizeWall';
import { splitWall, wallBreakCandidates } from '../../src/panelize/splitWall';
import { cutList } from '../../src/output/cutlist';
import { bom } from '../../src/output/bom';
import { costOf } from '../../src/output/cost';
import { esc, panelSvg, sheetStrings } from '../../src/output/svg';
import { wrapText } from '../../src/output/sheet/pieceList';
import { panelWeight } from '../../src/rules/weight';
import { verticalWidth } from '../../src/sections';
import postJson from '../fixtures/wall-144-post.json';
import plainJson from '../fixtures/wall-144-plain.json';
import { wallFixture } from '../helpers/fixtures';
import { expectSameMembers } from '../helpers/members';

const fixture = wallFixture(postJson);
const original = wallFixture(plainJson);

const config: Config = { studSpacing: 16, studThickness: 1.5, plateThickness: 1.5, studLength: [92.625, 104.625] };
const wall = (extra: Partial<Wall> = {}): Wall => ({
  id: 'W1',
  length: 144,
  height: 97.125,
  section: '2x4',
  exterior: false,
  bearing: false,
  openings: [],
  ...extra,
});

const postsOf = (members: readonly Member[]): PostMember[] => members.filter((m): m is PostMember => m.role === 'post');
const studXs = (members: readonly Member[]): number[] => members.filter((m) => m.role === 'stud').map((m) => m.x);
const engineError = (f: () => unknown): EngineError => {
  let caught: unknown;
  try {
    f();
  } catch (e) {
    caught = e;
  }
  if (caught instanceof EngineError) return caught;
  throw new Error(caught === undefined ? 'did not throw' : `not an EngineError: ${String(caught)}`);
};

describe('postFace (S37, P45): a face do post na espessura da parede', () => {
  it('face igual à profundidade da parede; a outra fica em x', () => {
    expect(postFace('4x4', '2x4')).toEqual({ width: 3.5, flat: false });
    expect(postFace('4x6', '2x6')).toEqual({ width: 3.5, flat: false });
    // 4x6 na parede 2x4: a face de 3.5" na espessura, a larga (5.5") ao longo da parede.
    expect(postFace('4x6', '2x4')).toEqual({ width: 5.5, flat: true });
    expect(postFace('6x6', '2x6')).toEqual({ width: 5.5, flat: false });
  });

  it('nenhuma face igual: 4x4 não preenche a 2x6, 6x6 sai da 2x4', () => {
    expect(postFace('4x4', '2x6')).toBeUndefined();
    expect(postFace('6x6', '2x4')).toBeUndefined();
  });
});

describe('wall-144-post (S37, P45)', () => {
  const panel = panelizeWall(fixture.wall, fixture.config);

  it('members do fixture: os do wall-144-plain menos os 2 studs sobrepostos, mais os 2 posts', () => {
    expectSameMembers(panel.members, fixture.expected.members as Member[]);
    expect(panel.members).toHaveLength(13);
    const kept = (original.expected.members as Member[]).filter(
      (m) => !(m.role === 'stud' && fixture.expected.removedStuds.includes(m.x)),
    );
    expectSameMembers(
      panel.members.filter((m) => m.role !== 'post'),
      kept,
    );
  });

  it('o post leva rótulo e conectores do projeto; largura real em x', () => {
    const posts = postsOf(panel.members);
    expect(posts).toEqual(postsOf(fixture.expected.members as Member[]));
    expect(posts.map(verticalWidth)).toEqual([3.5, 5.5]);
    expect(posts.every((p) => p.flat === undefined)).toBe(true);
  });

  it('lista de corte, peso e avisos', () => {
    expect(cutList(panel)).toEqual(fixture.expected.cutList);
    expect(panel.weightLb).toBe(fixture.expected.weightLb);
    expect(panelWeight(panel)).toBe(fixture.expected.weightLb);
    expect(panel.warnings).toEqual(fixture.expected.warnings);
  });

  it("BOM: o post é serrado, sai do comprimento comercial (8'), não de pré-corte", () => {
    const lines = bom([panel]);
    expect(lines.filter((l) => l.section === '4x6' || l.section === '6x6')).toEqual([
      {
        section: '4x6',
        stockLength: 96,
        kind: 'commercial',
        qty: 1,
        cutTotal: 92.625,
        waste: 3.375,
        wastePercent: 3.5,
      },
      {
        section: '6x6',
        stockLength: 96,
        kind: 'commercial',
        qty: 1,
        cutTotal: 92.625,
        waste: 3.375,
        wastePercent: 3.5,
      },
    ]);
    // Seções de post depois da família 2x.
    expect(lines.map((l) => l.section)).toEqual(['2x6', '2x6', '4x6', '6x6']);
    const cost = costOf(lines, [{ section: '4x6', length: 96, price: 30 }]);
    expect(cost.lines.find((l) => l.section === '4x6')?.cost).toBe(30);
    expect(cost.unpriced).toBe(3);
  });

  it('folha: post desenhado com a letra P, o rótulo, a nota "base: … · top: …" e a legenda com P', () => {
    const svg = panelSvg(panel);
    const S = sheetStrings();
    expect(svg).toContain('class="member post"');
    expect(svg).toContain('class="label post"');
    expect(svg).toContain('>P-01</text>');
    expect(svg).toContain(`>${esc('P-01 · 4x6 at x=46 1/2"')}<`);
    // Conectores numa linha própria, quebrada para caber na coluna da lista.
    expect(svg).toContain('>base: HDU2 hold-down · top: LUS28 — LVL 1 3/4 x<');
    expect(svg).toContain('>11 7/8 above<');
    expect(svg).toContain(`>${esc('P-02 · 6x6 at x=94"')}<`);
    expect(svg).toContain('>base: PB66 post base · top: HUS<');
    for (const line of S.posts.note) expect(svg).toContain(esc(line));
    expect(svg).toContain(S.legendWithPosts);
    expect(svg).toContain('post (P)');
    // Painel sem post: legenda de antes, sem seção de posts.
    const plainSvg = panelSvg(panelizeWall(original.wall, original.config));
    expect(plainSvg).toContain(`>${S.legend}</text>`);
    expect(plainSvg).not.toContain(S.posts.title);
    expect(S.legendWithPosts.replace(' · P post', '')).toBe(S.legend);
  });

  it('item da lista sem rótulo nem conector: só seção e x; conectores só os que o projeto dá', () => {
    const S = sheetStrings();
    expect(S.posts.item({ section: '4x4', x: 12 })).toBe('4x4 at x=12"');
    expect(S.posts.connectors({})).toBeUndefined();
    expect(S.posts.connectors({ top: 'beam above' })).toBe('top: beam above');
    expect(S.posts.connectors({ base: 'HDU2', top: 'LUS28' })).toBe('base: HDU2 · top: LUS28');
  });

  it('wrapText: quebra nos espaços, palavra longa fica inteira', () => {
    expect(wrapText('base: HDU2 · top: LUS28', 48)).toEqual(['base: HDU2 · top: LUS28']);
    expect(wrapText('aa bb cc', 5)).toEqual(['aa bb', 'cc']);
    expect(wrapText('abcdefgh ij', 4)).toEqual(['abcdefgh', 'ij']);
    expect(wrapText('', 4)).toEqual([]);
  });
});

describe('postMembers: posição e erros (S37, P45)', () => {
  it('4x6 em parede 2x4: face larga ao longo da parede (flat), o stud de layout sobreposto sai', () => {
    const panel = panelizeWall(wall({ posts: [{ x: 62.5, section: '4x6' }] }), config);
    const [post] = postsOf(panel.members);
    expect(post).toEqual({
      role: 'post',
      section: '4x6',
      length: 92.625,
      x: 62.5,
      y: 1.5,
      orientation: 'vertical',
      flat: true,
    });
    expect(verticalWidth(post!)).toBe(5.5);
    expect(studXs(panel.members)).not.toContain(63.25);
    expect(studXs(panel.members)).toContain(47.25);
    expect(studXs(panel.members)).toContain(79.25);
  });

  it('post nas pontas: substitui o primeiro stud e o de fechamento', () => {
    const panel = panelizeWall(
      wall({
        posts: [
          { x: 0, section: '4x4' },
          { x: 140.5, section: '4x4' },
        ],
      }),
      config,
    );
    expect(studXs(panel.members)).not.toContain(0);
    expect(studXs(panel.members)).not.toContain(142.5);
    expect(postsOf(panel.members).map((p) => p.x)).toEqual([0, 140.5]);
  });

  it('profundidade diferente da parede é erro POST_DEPTH_MISMATCH', () => {
    const e = engineError(() => panelizeWall(wall({ section: '2x6', posts: [{ x: 40, section: '4x4' }] }), config));
    expect(e.code).toBe('POST_DEPTH_MISMATCH');
    expect(e.params).toMatchObject({ index: 0, section: '4x4', wallSection: '2x6', wallDepth: 5.5 });
    expect(e.message).toContain('posts[0]');
    expect(engineError(() => panelizeWall(wall({ posts: [{ x: 40, section: '6x6' }] }), config)).code).toBe(
      'POST_DEPTH_MISMATCH',
    );
  });

  it('fora da parede é erro POST_OUT_OF_WALL', () => {
    const e = engineError(() => panelizeWall(wall({ posts: [{ x: 141, section: '4x4' }] }), config));
    expect(e.code).toBe('POST_OUT_OF_WALL');
    expect(e.params).toMatchObject({ index: 0, x: 141, width: 3.5, length: 144 });
    expect(engineError(() => panelizeWall(wall({ posts: [{ x: -1, section: '4x4' }] }), config)).code).toBe(
      'POST_OUT_OF_WALL',
    );
  });

  it('na zona de abertura é erro POST_IN_OPENING', () => {
    const w = wall({
      openings: [{ id: 'J1', type: 'window', offset: 48, roughWidth: 36, roughHeight: 48 }],
      posts: [{ x: 44, section: '4x4' }],
    });
    const e = engineError(() => panelizeWall(w, config));
    expect(e.code).toBe('POST_IN_OPENING');
    expect(e.params).toMatchObject({ index: 0, x: 44 });
  });

  it('sobre stud extra ou outro post é erro POST_OVERLAP', () => {
    const extra = engineError(() =>
      panelizeWall(wall({ extraStuds: [{ x: 40 }], posts: [{ x: 39, section: '4x4' }] }), config),
    );
    expect(extra.code).toBe('POST_OVERLAP');
    expect(extra.params).toMatchObject({ index: 0, role: 'stud', memberX: 40 });
    const twice = engineError(() =>
      panelizeWall(
        wall({
          posts: [
            { x: 39, section: '4x4' },
            { x: 41, section: '4x4' },
          ],
        }),
        config,
      ),
    );
    expect(twice.code).toBe('POST_OVERLAP');
    expect(twice.params).toMatchObject({ index: 1, role: 'post', memberX: 39 });
    // Encostado não é sobreposto.
    expect(() =>
      panelizeWall(wall({ extraStuds: [{ x: 40 }], posts: [{ x: 41.5, section: '4x4' }] }), config),
    ).not.toThrow();
  });

  it('x não finito ou seção desconhecida é erro POST_INVALID', () => {
    expect(
      engineError(() => panelizeWall(wall({ posts: [{ x: Number.NaN, section: '4x4' }] }), config)).params,
    ).toMatchObject({
      field: 'x',
    });
    const e = engineError(() => panelizeWall(wall({ posts: [{ x: 10, section: '8x8' as never }] }), config));
    expect(e.code).toBe('POST_INVALID');
    expect(e.params).toMatchObject({ field: 'section', value: '8x8' });
  });

  it('peças vizinhas: o fire blocking e as fileiras param na face do post', () => {
    const panel = panelizeWall(wall({ posts: [{ x: 46.5, section: '4x4' }], blocking: [{ y: 36 }] }), config);
    const blocks = panel.members.filter((m) => m.role === 'block');
    expect(blocks.some((b) => Math.abs(b.x - 50) < 1e-9)).toBe(true);
    expect(blocks.some((b) => Math.abs(b.x + b.length - 46.5) < 1e-9)).toBe(true);
    expect(blocks.every((b) => b.x >= 50 - 1e-9 || b.x + b.length <= 46.5 + 1e-9)).toBe(true);
  });

  it('chamada direta: sem posts, nada', () => {
    expect(postMembers(wall(), { y: 1.5, length: 92.625, zones: [] })).toEqual([]);
  });
});

describe('posts e painéis (S37)', () => {
  const long = wall({
    length: 400,
    posts: [
      { x: 94, section: '4x4', label: 'P-A' },
      { x: 300, section: '4x6', label: 'P-B', base: 'HDU5' },
    ],
  });

  it('não há candidato a quebra sobre o post; quebra forçada no post é erro PANEL_BREAK_INVALID', () => {
    const { panel, plan } = framePanel(long, config);
    const ctx = { zones: plan.zones, strips: teeStrips(long.joints) };
    // Marca 96 (o stud de layout de 95.25 saiu): a faixa da junta [94.5, 97.5] toca o post [94, 97.5].
    expect(whyNotBreak(96, panel, config, ctx)).toEqual({ reason: 'member', role: 'post', memberX: 94 });
    for (const c of wallBreakCandidates(long, config)) {
      for (const p of postsOf(panel.members)) {
        expect(c + 1.5 <= p.x || c - 1.5 >= p.x + verticalWidth(p)).toBe(true);
      }
    }
    const e = engineError(() => splitWall({ ...long, panelBreaks: [96] }, config));
    expect(e.code).toBe('PANEL_BREAK_INVALID');
    expect(e.params).toMatchObject({ reason: 'member', role: 'post' });
  });

  it('splitWall: cada post inteiro num painel, em x do painel', () => {
    const panels = splitWall(long, config);
    expect(panels.length).toBeGreaterThan(1);
    const placed = panels.flatMap((p) =>
      postsOf(p.members).map((m) => ({ label: m.label, wallX: p.wallOffset + m.x, base: m.base })),
    );
    expect(placed).toEqual([
      { label: 'P-A', wallX: 94, base: undefined },
      { label: 'P-B', wallX: 300, base: 'HDU5' },
    ]);
    for (const p of panels) {
      for (const m of postsOf(p.members)) expect(m.x + verticalWidth(m)).toBeLessThanOrEqual(p.length);
    }
  });

  it('postsForSegment: os do trecho, deslocados', () => {
    const posts = [
      { x: 10, section: '4x4' as const },
      { x: 200, section: '4x4' as const, label: 'X' },
    ];
    expect(postsForSegment(posts, 0, 192)).toEqual([{ x: 10, section: '4x4' }]);
    expect(postsForSegment(posts, 192, 400)).toEqual([{ x: 8, section: '4x4', label: 'X' }]);
  });

  it('planta: x do post medido do start, convertido para o painel como os studs extras', () => {
    const [frame] = frameWalls({
      walls: [
        {
          id: 'A',
          start: { x: 0, y: 0 },
          end: { x: 144, y: 0 },
          height: 97.125,
          section: '2x4',
          exterior: false,
          bearing: false,
          openings: [],
          posts: [{ x: 60, section: '4x4', top: 'LVL above' }],
        },
        {
          id: 'B',
          start: { x: 0, y: 0 },
          end: { x: 0, y: 100 },
          height: 97.125,
          section: '2x4',
          exterior: false,
          bearing: false,
          openings: [],
        },
      ],
    });
    // A (a mais longa) atravessa o canto: a plate começa 1.75" antes do `start`.
    expect(frame!.wall.posts).toEqual([{ x: 61.75, section: '4x4', top: 'LVL above' }]);
  });
});
