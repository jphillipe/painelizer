import { describe, expect, it } from 'vitest';
import type { Config, FlatMember, Member, Panel, PanelOpening, Wall } from '../../src/types';
import { EngineError } from '../../src/messages';
import {
  DEFAULT_SHEATHING,
  SHEATHING_JOINT_LABEL,
  faceOverhangs,
  faceSheets,
  panelSheathing,
  resolveSheathing,
  sheathingFaces,
  sheathingJointRows,
  sheathingPsf,
  type ResolvedSheathing,
} from '../../src/rules/sheathing';
import { resolveWallType } from '../../src/rules/wallTypes';
import { panelWeight } from '../../src/rules/weight';
import { frameWalls } from '../../src/house/frame';
import { panelizeHouse } from '../../src/house/panelizeHouse';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { splitWall } from '../../src/panelize/splitWall';
import { panelSvg } from '../../src/output/svg';
import type { House, HouseWall } from '../../src/house/types';
import sheathedJson from '../fixtures/wall-144-sheathed.json';
import plainJson from '../fixtures/wall-144-plain.json';
import cornerLJson from '../fixtures/house-corner-L.json';
import cornerLSheathedJson from '../fixtures/house-corner-L-sheathed.json';
import { houseFixture, wallFixture } from '../helpers/fixtures';
import { expectSameMembers, type MemberKeyFields } from '../helpers/members';

const config: Config = { studSpacing: 16, studThickness: 1.5, plateThickness: 1.5, studLength: [92.625, 104.625] };
const wall = (extra: Partial<Wall> = {}): Wall => ({
  id: 'W1',
  length: 144,
  height: 97.125,
  section: '2x6',
  exterior: true,
  bearing: false,
  openings: [],
  ...extra,
});
const spec = (extra: Partial<ResolvedSheathing> = {}): ResolvedSheathing => ({ ...DEFAULT_SHEATHING, ...extra });

function engineError(f: () => unknown): EngineError {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    return e as EngineError;
  }
  throw new Error('expected an EngineError');
}

const joints = (b: readonly Member[]): FlatMember[] =>
  b.filter((m): m is FlatMember => m.role === 'block' && m.label === SHEATHING_JOINT_LABEL);

describe('resolveSheathing — quem leva chapa (S38)', () => {
  it('sem config.sheathing e sem pedido da parede: nenhuma chapa', () => {
    expect(resolveSheathing(wall(), config)).toBeUndefined();
    expect(resolveSheathing(wall({ sheathing: false }), config)).toBeUndefined();
  });

  it('config.sheathing liga as externas por padrão; walls "all" e "none"', () => {
    const on = { ...config, sheathing: {} };
    expect(resolveSheathing(wall(), on)).toEqual(DEFAULT_SHEATHING);
    expect(resolveSheathing(wall({ exterior: false }), on)).toBeUndefined();
    expect(resolveSheathing(wall({ exterior: false }), { ...config, sheathing: { walls: 'all' } })).toEqual(DEFAULT_SHEATHING);
    expect(resolveSheathing(wall(), { ...config, sheathing: { walls: 'none' } })).toBeUndefined();
  });

  it('a parede manda: true liga a interna, false desliga a externa, objeto ajusta por cima do projeto', () => {
    const project = { ...config, sheathing: { walls: 'none' as const, thickness: 0.5, sheet: { height: 108 } } };
    expect(resolveSheathing(wall({ exterior: false, sheathing: true }), project)).toMatchObject({ thickness: 0.5, sheet: { width: 48, height: 108 } });
    expect(resolveSheathing(wall({ sheathing: false }), { ...config, sheathing: {} })).toBeUndefined();
    const r = resolveSheathing(wall({ sheathing: { side: 'both', overhang: { floorTop: 12 }, nailing: { edge: 4 } } }), project);
    expect(r).toEqual({
      ...DEFAULT_SHEATHING,
      thickness: 0.5,
      sheet: { width: 48, height: 108 },
      side: 'both',
      floorTop: 12,
      nailing: { nail: '8d', edge: 4, field: 12 },
    });
    // Sem config.sheathing, a parede com true usa os defaults.
    expect(resolveSheathing(wall({ sheathing: true }), config)).toEqual(DEFAULT_SHEATHING);
  });

  it.each([
    [{ thickness: 0 }, 'thickness'],
    [{ sheet: { height: -1 } }, 'sheet.height'],
    [{ overhang: { floorTop: -2 } }, 'overhang.floorTop'],
    [{ overhang: { corner: Number.NaN } }, 'overhang.corner'],
    [{ nailing: { nail: ' ' } }, 'nailing.nail'],
  ])('medida fora da faixa é erro SHEATHING_INVALID (%#)', (s, field) => {
    const e = engineError(() => resolveSheathing(wall({ sheathing: s }), config));
    expect(e.code).toBe('SHEATHING_INVALID');
    expect(e.params?.['field']).toBe(field);
    expect(e.message).toContain('W1');
  });

  it('o tipo de parede dá o sheathing à parede que não diz (resolveWallType); false na parede desliga', () => {
    const types = { wallTypes: { 'WT-1S': { section: '2x6' as const, exterior: true, bearing: true, sheathing: { side: 'both' as const } } } };
    expect(resolveWallType({ id: 'W1', wallType: 'WT-1S' }, types).sheathing).toEqual({ side: 'both' });
    expect(resolveWallType({ id: 'W1', wallType: 'WT-1S', sheathing: false }, types).sheathing).toBe(false);
    expect('sheathing' in resolveWallType({ id: 'W1', section: '2x4', exterior: false, bearing: false }, types)).toBe(false);
  });

  it('faces: exterior primeiro', () => {
    expect(sheathingFaces('both')).toEqual(['exterior', 'interior']);
    expect(sheathingFaces('interior')).toEqual(['interior']);
  });
});

describe('faceOverhangs — canto, T, junta e linha de piso (P47 revista, P49)', () => {
  const corner = (through: boolean, concave?: true) =>
    ({ kind: 'corner', through, otherThickness: 5.5, ...(concave ? { concave } : {}) }) as const;

  it('canto de fora: a que encosta avança t_outra na face exterior; a que atravessa não', () => {
    expect(faceOverhangs({ joints: { start: corner(false), end: corner(true) } }, 'exterior', spec())).toEqual({
      start: 5.5,
      end: 0,
      top: 0,
      bottom: 0,
    });
    expect(faceOverhangs({ joints: { start: corner(false) } }, 'interior', spec()).start).toBe(0);
  });

  it('avanço numérico no lugar do automático', () => {
    expect(faceOverhangs({ joints: { end: corner(false) } }, 'exterior', spec({ corner: 6 })).end).toBe(6);
    expect(faceOverhangs({ joints: { end: corner(false) } }, 'exterior', spec({ corner: 0 })).end).toBe(0);
  });

  it('canto de dentro: o ângulo de fora é a face interior', () => {
    expect(faceOverhangs({ joints: { start: corner(false, true) } }, 'exterior', spec()).start).toBe(0);
    expect(faceOverhangs({ joints: { start: corner(false, true) } }, 'interior', spec()).start).toBe(5.5);
  });

  it('T, junta de painel (P49) e ponta livre não avançam; linha de piso só na face exterior', () => {
    const o = faceOverhangs(
      { joints: { start: { kind: 'tee', otherThickness: 3.5 }, end: { kind: 'panel', lap: 48 } } },
      'exterior',
      spec({ floorTop: 12, floorBottom: 10.875 }),
    );
    expect(o).toEqual({ start: 0, end: 0, top: 12, bottom: 10.875 });
    expect(faceOverhangs({}, 'interior', spec({ floorTop: 12, floorBottom: 10.875 }))).toEqual({ start: 0, end: 0, top: 0, bottom: 0 });
  });
});

describe('faceSheets — chapas verticais da marca 0', () => {
  const area = (x0: number, x1: number, y0: number, y1: number) => ({ x0, x1, y0, y1 });
  const sheet = { width: 48, height: 96 };

  it('colunas nas marcas origin + k·48, cortadas nas pontas; fileiras de baixo para cima', () => {
    const s = faceSheets('exterior', area(-5.5, 117.25, 0, 97.125), -5.5, sheet, []);
    expect(s.filter((p) => p.y === 0).map((p) => [p.x, p.w])).toEqual([
      [-5.5, 48],
      [42.5, 48],
      [90.5, 26.75],
    ]);
    expect(s.filter((p) => p.y === 96).every((p) => p.h === 1.125 && p.cut === true)).toBe(true);
    expect(s).toHaveLength(6);
  });

  it('painel no meio da parede (origem negativa): o primeiro pedaço vai da ponta à próxima marca', () => {
    const s = faceSheets('exterior', area(0, 96, 0, 96), -100, sheet, []);
    // Marcas em −100, −52, −4, 44, 92 → pedaços 0–44, 44–92, 92–96.
    expect(s.map((p) => [p.x, p.w, p.cut === true])).toEqual([
      [0, 44, true],
      [44, 48, false],
      [92, 4, true],
    ]);
  });

  it('pedaço com vão de abertura é cortado; pedaço todo dentro do RO sai', () => {
    const door: PanelOpening = { id: 'D1', type: 'door', x: 40, width: 60, top: 82.5, height: 82.5 };
    const s = faceSheets('exterior', area(0, 144, 0, 192), 0, sheet, [door]);
    expect(s.find((p) => p.x === 0 && p.y === 0)?.cut).toBe(true);
    expect(s.find((p) => p.x === 96 && p.y === 0)?.cut).toBe(true);
    // A segunda fileira não toca o RO: inteira.
    expect(s.find((p) => p.x === 48 && p.y === 96)?.cut).toBeUndefined();
    const narrow = faceSheets('exterior', area(0, 96, 0, 192), 0, { width: 48, height: 40 }, [
      { id: 'W', type: 'window', x: 0, width: 96, top: 80, height: 40 },
    ]);
    expect(narrow.some((p) => p.y === 40)).toBe(false);
  });
});

describe('panelSheathing — área, peso e pregação', () => {
  it('área sem o RO; peso 1.4 lb/pé² na 7/16 (P8 revista)', () => {
    expect(sheathingPsf(0.4375)).toBeCloseTo(1.4, 10);
    const window: PanelOpening = { id: 'A', type: 'window', x: 48, width: 36, top: 82.5, height: 48 };
    const s = panelSheathing(wall(), spec(), [window]);
    expect(s.areaSqFt).toBe(Math.round(((144 * 97.125 - 36 * 48) / 144) * 100) / 100);
    expect(s.weightLb).toBe(Math.round(s.areaSqFt * 1.4 * 10) / 10);
    expect(s.nailing).toEqual({ nail: '8d', edge: 6, field: 12 });
    expect(s.overhang).toEqual({ exterior: { start: 0, end: 0, top: 0, bottom: 0 } });
  });

  it('as duas faces somam área e peso; a interior não desce na linha de piso', () => {
    const s = panelSheathing(wall(), spec({ side: 'both', floorBottom: 10.875 }), []);
    expect(s.overhang.interior).toEqual({ start: 0, end: 0, top: 0, bottom: 0 });
    expect(s.areaSqFt).toBe(Math.round(((144 * 108 + 144 * 97.125) / 144) * 100) / 100);
    expect(s.sheets.filter((p) => p.face === 'exterior')).toHaveLength(6);
    expect(s.sheets.filter((p) => p.face === 'interior').every((p) => p.y >= 0)).toBe(true);
  });
});

describe('sheathingJointRows — emenda horizontal com blocking (S36)', () => {
  it('emenda sobre as top plates ou a bottom plate não pede bloco', () => {
    expect(sheathingJointRows(wall(), spec(), config)).toEqual([]);
    expect(sheathingJointRows(wall({ height: 109.125 }), spec({ sheet: { width: 48, height: 108 } }), config)).toEqual([]);
  });

  it('parede de 10\'-1 1/8" com chapa de 96: fileira com o centro na emenda', () => {
    expect(sheathingJointRows(wall({ height: 121.125 }), spec(), config)).toEqual([{ y: 96, label: SHEATHING_JOINT_LABEL, index: -1 }]);
  });

  it('o avanço de piso desloca a emenda; emenda a menos de meio bloco da plate encosta nela', () => {
    expect(sheathingJointRows(wall({ height: 121.125 }), spec({ floorBottom: 10.875 }), config).map((r) => r.y)).toEqual([85.125]);
    expect(sheathingJointRows(wall({ height: 121.125 }), spec({ floorBottom: 94 }), config).map((r) => r.y)).toEqual([2.25, 98]);
  });
});

describe('framePanel com sheathing', () => {
  it('desligado por padrão: o painel não muda (sem a chave, mesmo peso e peças)', () => {
    const p = panelizeWall(wall(), config);
    expect('sheathing' in p).toBe(false);
    expect(p.weightLb).toBe(panelWeight({ members: p.members }));
  });

  it('parede alta: a fileira da emenda entra como blocking por altura, com aviso onde a abertura impede', () => {
    const tall = wall({
      height: 121.125,
      sheathing: true,
      openings: [{ id: 'A', type: 'window', roughWidth: 36, roughHeight: 48, offset: 48, headerHeight: 88, header: { section: '2x10', plies: 2 } }],
    });
    const p = panelizeWall(tall, config);
    const blocks = joints(p.members);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b) => b.blocking === 'backing' && b.y === 96 - 0.75)).toBe(true);
    expect(p.warnings.map((w) => w.code)).toContain('BLOCKING_SKIPPED');
    expect(p.weightLb).toBe(panelWeight({ members: p.members, sheathing: p.sheathing }));
  });

  it('parede dividida: cada painel tem as suas chapas, que acabam na junta (P49)', () => {
    const long = wall({ length: 384, sheathing: true });
    const panels = splitWall(long, config);
    expect(panels.length).toBeGreaterThan(1);
    for (const p of panels) {
      const s = p.sheathing!;
      expect(Math.min(...s.sheets.map((q) => q.x))).toBe(0);
      expect(Math.max(...s.sheets.map((q) => q.x + q.w))).toBeCloseTo(p.length, 9);
      expect(p.weightLb).toBe(panelWeight({ members: p.members, sheathing: s }));
    }
    const area = panels.reduce((sum, p) => sum + p.sheathing!.areaSqFt, 0);
    expect(area).toBeCloseTo((384 * 97.125) / 144, 1);
  });
});

describe('canto de dentro na planta (EndJoint.concave)', () => {
  // L com um entalhe raso no canto (288,240): o canto de dentro em (240,192) entre W3 e W4.
  const pts = [
    [0, 0],
    [288, 0],
    [288, 192],
    [240, 192],
    [240, 240],
    [0, 240],
  ];
  const walls: HouseWall[] = pts.map(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    return {
      id: `W${i + 1}`,
      start: { x: x!, y: y! },
      end: { x: x2!, y: y2! },
      height: 97.125,
      section: '2x6',
      exterior: true,
      bearing: false,
      openings: [],
    };
  });
  const house: House = { walls };

  it('só o canto do entalhe é de dentro; nas duas paredes dele', () => {
    const frames = frameWalls(house);
    const concave = frames.flatMap((f) =>
      (['start', 'end'] as const).filter((e) => {
        const j = f.wall.joints?.[e];
        return j?.kind === 'corner' && j.concave === true;
      }).map((e) => `${f.wallId}.${e}`),
    );
    expect(concave).toEqual(['W3.end', 'W4.start']);
  });

  it('no canto de dentro a chapa exterior não avança', () => {
    const { panels } = panelizeHouse(house, { ...config, sheathing: {} });
    const w4 = panels.find((p) => p.wallId === 'W4')!;
    expect(w4.sheathing!.overhang.exterior!.start).toBe(0);
    // Os cantos de fora continuam avançando na que encosta.
    const ext = panels.flatMap((p) => [p.sheathing!.overhang.exterior!.start, p.sheathing!.overhang.exterior!.end]);
    expect(ext.filter((v) => v === 5.5).length).toBe(5);
  });
});

describe('fixture wall-144-sheathed (S38, P47/P52)', () => {
  const fx = wallFixture(sheathedJson);
  const original = wallFixture(plainJson);
  const panel = panelizeWall(fx.wall, fx.config);

  it('o fixture é revisável: avisa no $comment que o humano não confirmou', () => {
    expect(sheathedJson.$comment).toContain('not confirmed by the human — review');
    expect(fx.expected.sameMembersAs).toBe('wall-144-plain');
  });

  it('members idênticos aos do wall-144-plain; o painel só ganha a chapa e o peso dela', () => {
    expectSameMembers(panel.members, original.expected.members as MemberKeyFields[]);
    const { sheathing, weightLb, ...rest } = panel;
    const { weightLb: plainWeight, ...plainRest } = panelizeWall(original.wall, original.config);
    expect(rest).toEqual(plainRest);
    expect(plainWeight).toBe(fx.expected.lumberWeightLb);
    expect(sheathing).toEqual(fx.expected.sheathing);
    expect(weightLb).toBe(fx.expected.weightLb);
    expect(panel.warnings).toEqual(fx.expected.warnings);
  });

  it('a folha: contorno das chapas, seção Sheathing com a pregação e a nota de peso com a chapa', () => {
    const svg = panelSvg(panel);
    expect(svg.match(/<rect [^>]*><title>sheathing exterior/g)).toHaveLength(6);
    expect(svg).toContain('nailing: 8d @ 6&quot; edges, 12&quot; field');
    expect(svg).toContain('lumber and sheathing, no nails (hypothesis P8)');
    expect(svg).not.toContain('lumber only, no sheathing');
    expect(svg).not.toContain('floor line');
    expect(svg).toContain('dashed green = sheathing sheet');
  });
});

describe('fixture house-corner-L-sheathed (S38, P47 revista)', () => {
  const fx = houseFixture(cornerLSheathedJson);
  const original = houseFixture(cornerLJson);
  const { panels, warnings } = panelizeHouse(fx.house, fx.config);
  const originalPanels = panelizeHouse(original.house, original.config).panels;
  const expected = fx.expected.panels as Record<string, { weightLb: number; sheathing: Panel['sheathing'] }>;

  it('o fixture é revisável: avisa no $comment que o humano não confirmou', () => {
    expect(cornerLSheathedJson.$comment).toContain('not confirmed by the human — review');
    expect(fx.expected.sameMembersAs).toBe('house-corner-L');
  });

  it('members idênticos aos do house-corner-L; chapas e peso como o fixture diz', () => {
    expect(panels.map((p) => p.id)).toEqual(fx.expected.panelIds);
    expect(warnings).toEqual(fx.expected.warnings);
    const originalExpected = original.expected.panels as Record<string, { expectedMembers: MemberKeyFields[] }>;
    panels.forEach((p, i) => {
      expectSameMembers(p.members, originalExpected[p.id]!.expectedMembers);
      const { sheathing, weightLb, ...rest } = p;
      const { weightLb: lumber, ...originalRest } = originalPanels[i]!;
      expect(rest, p.id).toEqual(originalRest);
      expect(sheathing, p.id).toEqual(expected[p.id]!.sheathing);
      expect(weightLb, p.id).toBe(expected[p.id]!.weightLb);
      expect(weightLb, p.id).toBeCloseTo(lumber + sheathing!.weightLb, 1);
    });
  });

  it('a que encosta (W2) começa a chapa na quina do prédio (marca 0); a emenda cai no centro do stud', () => {
    const w2 = panels.find((p) => p.wallId === 'W2')!;
    expect(w2.layoutOrigin).toBe(-5.5);
    expect(w2.sheathing!.sheets[0]!.x).toBe(w2.layoutOrigin);
    const seam = w2.sheathing!.sheets[1]!.x;
    expect(w2.members.some((m) => m.role === 'stud' && m.x + 0.75 === seam)).toBe(true);
  });

  it('a folha pede "engineer to verify" no avanço da linha de piso e cota o avanço de canto', () => {
    const svg = panelSvg(panels.find((p) => p.wallId === 'W2')!);
    // A linha quebra para caber na coluna: "… below the bottom plate —" / "engineer to verify".
    expect(svg).toContain('floor line: 10 7/8&quot; below the bottom plate —');
    expect(svg).toContain('>engineer to verify</text>');
    expect(svg).toContain('corner overhang: start 5 1/2&quot;');
  });
});
