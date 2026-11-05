import { describe, expect, it } from 'vitest';
import type { Config, FlatMember, Member, StudMember, Wall } from '../../src/types';
import { EngineError } from '../../src/messages';
import {
  BUILTIN_BLOCKING_PRESETS,
  DEFAULT_BLOCKING_LABEL,
  blockingForSegment,
  blockingPresetsOf,
  blockingYRange,
  heightBlocks,
  resolveBlockingRows,
} from '../../src/rules/blocking';
import { resolveWallType } from '../../src/rules/wallTypes';
import { whyNotBreak } from '../../src/rules/breaks';
import { frameWalls } from '../../src/house/frame';
import { framePanel, panelizeWall } from '../../src/panelize/panelizeWall';
import { splitWall, wallBreakCandidates } from '../../src/panelize/splitWall';
import { esc, panelSvg } from '../../src/output/svg';
import { blockingRows } from '../../src/output/sheet/blocking';
import kitchenJson from '../fixtures/wall-144-kitchen.json';
import windowJson from '../fixtures/wall-144-window.json';
import fireJson from '../fixtures/wall-144-fireblock.json';
import { wallFixture } from '../helpers/fixtures';
import { expectSameMembers } from '../helpers/members';

const kitchen = wallFixture(kitchenJson);
const original = wallFixture(windowJson);
const fire = wallFixture(fireJson);

const config: Config = { studSpacing: 16, studThickness: 1.5, plateThickness: 1.5, studLength: [92.625, 104.625] };
const plain = (extra: Partial<Wall> = {}): Wall => ({
  id: 'W1',
  length: 144,
  height: 97.125,
  section: '2x4',
  exterior: false,
  bearing: false,
  openings: [],
  ...extra,
});

const blocksOf = (members: readonly Member[]): FlatMember[] => members.filter((m): m is FlatMember => m.role === 'block');
const engineCode = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return e instanceof EngineError ? e.code : `not an EngineError: ${String(e)}`;
  }
  return undefined;
};

describe('wall-144-kitchen (S36, P44)', () => {
  const panel = panelizeWall(kitchen.wall, kitchen.config);

  it('members do fixture: os 18 do wall-144-window idênticos + 17 blocos', () => {
    expectSameMembers(panel.members, kitchen.expected.members as Member[]);
    expect(panel.members).toHaveLength(35);
    expectSameMembers(
      panel.members.filter((m) => m.role !== 'block'),
      original.expected.members as Member[],
    );
  });

  it('cada bloco leva blocking: backing e o uso da fileira', () => {
    const key = (m: FlatMember): string => `${m.x}|${m.y}`;
    const got = blocksOf(panel.members).sort((a, b) => key(a).localeCompare(key(b)));
    const want = blocksOf(kitchen.expected.members as Member[]).sort((a, b) => key(a).localeCompare(key(b)));
    expect(got).toEqual(want);
  });

  it('avisos: a zona da janela pulada nas fileiras da parede inteira; a do trecho não toca a zona', () => {
    expect(panel.warnings).toHaveLength(2);
    expect(panel.warnings).toMatchObject(kitchen.expected.warnings);
    expect(panel.warnings[0]!.message).toBe(
      'Wall W-kitchen: blocking row "Base cabinets / countertop" at 36" (center) skipped across the zone of opening(s) win1 [45, 87] — add backing there by hand if needed',
    );
  });

  it('sem blocking, a parede é o wall-144-window (nada muda)', () => {
    const { blocking: _, ...rest } = kitchen.wall;
    expectSameMembers(panelizeWall(rest, kitchen.config).members, original.expected.members as Member[]);
  });

  it('a folha cota cada fileira ao subfloor (centro) e dá o uso', () => {
    const svg = panelSvg(splitWall(kitchen.wall, kitchen.config)[0]!);
    expect(svg).toContain(esc('B · Base cabinets / countertop (center 36")'));
    expect(svg).toContain(esc('B · Upper cabinets, bottom (center 54")'));
    expect(svg).toContain(esc('B · Upper cabinets, top (center 84")'));
    expect(svg.match(/class="blocking-row backing"/g)).toHaveLength(3);
  });
});

describe('resolveBlockingRows', () => {
  it('presets embutidos: um valor por uso (P44)', () => {
    expect(Object.fromEntries(Object.entries(BUILTIN_BLOCKING_PRESETS).map(([k, v]) => [k, v.y]))).toEqual({
      'kitchen-base': 36,
      'kitchen-upper-bottom': 54,
      'kitchen-upper-top': 84,
      'bath-toilet': 15,
      'bath-paper': 39,
      'bath-valve': 42,
      'bath-towel': 48,
      'bath-shower': 79,
    });
  });

  it('preset do projeto soma aos embutidos e substitui o de mesmo id', () => {
    const presets = blockingPresetsOf({ blockingPresets: { 'kitchen-base': { y: 35 }, hood: { y: 66, label: 'Range hood' } } });
    expect(presets['kitchen-base']).toEqual({ y: 35 });
    expect(presets['hood']).toEqual({ y: 66, label: 'Range hood' });
    expect(presets['bath-valve']?.y).toBe(42);
    const rows = resolveBlockingRows(plain({ blocking: ['kitchen-base', 'hood', { y: 20 }] }), {
      ...config,
      blockingPresets: { 'kitchen-base': { y: 35 }, hood: { y: 66, label: 'Range hood' } },
    });
    expect(rows).toEqual([
      { y: 35, label: 'kitchen-base', index: 0 },
      { y: 66, label: 'Range hood', index: 1 },
      { y: 20, label: DEFAULT_BLOCKING_LABEL, index: 2 },
    ]);
  });

  it('sem blocking (ou []), nenhuma fileira', () => {
    expect(resolveBlockingRows(plain(), config)).toEqual([]);
    expect(resolveBlockingRows(plain({ blocking: [] }), config)).toEqual([]);
  });

  it('preset desconhecido é erro com código e a lista dos conhecidos', () => {
    try {
      resolveBlockingRows(plain({ blocking: ['kitchen-base', 'constructor'] }), config);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EngineError);
      const err = e as EngineError;
      expect(err.code).toBe('BLOCKING_PRESET_UNKNOWN');
      expect(err.params).toMatchObject({ index: 1, preset: 'constructor' });
      expect(err.message).toMatch(/^Wall W1, blocking\[1\]: no blocking preset "constructor" — use one of bath-paper, /);
    }
  });

  it('centro fora da cavidade: o bloco tem de caber entre a bottom plate e a top plate', () => {
    expect(blockingYRange(97.125, config)).toEqual({ min: 2.25, max: 93.375 });
    expect(resolveBlockingRows(plain({ blocking: [{ y: 2.25 }, { y: 93.375 }] }), config)).toHaveLength(2);
    expect(engineCode(() => resolveBlockingRows(plain({ blocking: [{ y: 2 }] }), config))).toBe('BLOCKING_ROW_INVALID');
    expect(engineCode(() => resolveBlockingRows(plain({ blocking: [{ y: 94 }] }), config))).toBe('BLOCKING_ROW_INVALID');
    expect(engineCode(() => resolveBlockingRows(plain({ blocking: [{ y: Number.NaN }] }), config))).toBe('BLOCKING_ROW_INVALID');
    // Preset acima de uma parede baixa (ducha em 79" numa parede de 6').
    expect(engineCode(() => resolveBlockingRows(plain({ height: 72, blocking: ['bath-shower'] }), config))).toBe('BLOCKING_ROW_INVALID');
  });

  it('trecho: from < to, tocando a parede; números finitos', () => {
    expect(engineCode(() => resolveBlockingRows(plain({ blocking: [{ y: 36, from: 50, to: 50 }] }), config))).toBe('BLOCKING_ROW_INVALID');
    expect(engineCode(() => resolveBlockingRows(plain({ blocking: [{ y: 36, from: 144 }] }), config))).toBe('BLOCKING_ROW_INVALID');
    expect(engineCode(() => resolveBlockingRows(plain({ blocking: [{ y: 36, to: 0 }] }), config))).toBe('BLOCKING_ROW_INVALID');
    expect(engineCode(() => resolveBlockingRows(plain({ blocking: [{ y: 36, to: Infinity }] }), config))).toBe('BLOCKING_ROW_INVALID');
    // Trecho que passa da parede é cortado na geração (na planta, from/to vêm do `start`).
    expect(resolveBlockingRows(plain({ blocking: [{ y: 36, from: -3, to: 200 }] }), config)).toEqual([
      { y: 36, from: -3, to: 200, label: DEFAULT_BLOCKING_LABEL, index: 0 },
    ]);
  });
});

describe('heightBlocks', () => {
  const stud = (x: number): StudMember => ({ role: 'stud', section: '2x4', length: 92.625, x, y: 1.5, orientation: 'vertical' });
  const studs = [0, 15.25, 31.25, 47.25, 63.25].map(stud);
  const row = { y: 36, label: 'Grab bar', index: 0 };

  it('um bloco por vão, centro na cota; trecho pega os vãos que toca', () => {
    const { members, warnings } = heightBlocks({ id: 'W1', section: '2x4' }, [{ ...row, from: 20, to: 40 }], studs, [], [], config);
    expect(members.map((m) => [m.x, m.length, m.y])).toEqual([
      [16.75, 14.5, 35.25],
      [32.75, 14.5, 35.25],
    ]);
    expect(members[0]).toMatchObject({ role: 'block', blocking: 'backing', label: 'Grab bar', section: '2x4' });
    expect(warnings).toEqual([]);
  });

  it('vão no ladder do T é pulado com aviso (reason tee)', () => {
    const { members, warnings } = heightBlocks(
      { id: 'W1', section: '2x4' },
      [row],
      studs,
      [{ lo: 31.25 + 1.5, hi: 47.25, reason: 'tee', teeWallId: 'W2' }],
      [],
      config,
    );
    expect(members).toHaveLength(3);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: 'BLOCKING_SKIPPED', params: { reason: 'tee', teeWallId: 'W2', lo: 32.75, hi: 47.25 } });
    expect(warnings[0]!.message).toContain('the ladder of the tee with wall W2');
  });

  it('bloco já na mesma altura (fogo, fileira anterior): pulado com aviso, nada sobreposto', () => {
    const fireBlock: FlatMember = { role: 'block', section: '2x4', length: 14.5, x: 16.75, y: 35, orientation: 'horizontal', blocking: 'fire' };
    const { members, warnings } = heightBlocks({ id: 'W1', section: '2x4' }, [row, { y: 37, label: 'Towel', index: 1 }], studs, [], [fireBlock], config);
    // Fileira 1: três vãos (o do bloco de fogo sai). Fileira 2 (37, sobrepõe a 36): nenhum.
    expect(members.map((m) => `${m.label}@${m.x}`)).toEqual(['Grab bar@1.5', 'Grab bar@32.75', 'Grab bar@48.75']);
    expect(warnings.map((w) => [w.params?.['label'], w.params?.['otherLabel']])).toEqual([
      ['Grab bar', 'Fire blocking'],
      ['Towel', 'Grab bar'],
      ['Towel', 'Fire blocking'],
    ]);
  });

  it('sem fileira ou sem peça vertical: nada', () => {
    expect(heightBlocks({ id: 'W1', section: '2x4' }, [], studs, [], [], config)).toEqual({ members: [], warnings: [] });
    expect(heightBlocks({ id: 'W1', section: '2x4' }, [row], [], [], [], config)).toEqual({ members: [], warnings: [] });
  });
});

describe('blockingForSegment', () => {
  it('desloca e corta o trecho; fileira fora do trecho sai; preset e parede inteira ficam', () => {
    const entries = ['bath-towel', { y: 36 }, { y: 54, from: 40, to: 100 }, { y: 60, to: 30 }, { y: 70, from: 130 }];
    expect(blockingForSegment(entries, 0, 96)).toEqual(['bath-towel', { y: 36 }, { y: 54, from: 40, to: 96 }, { y: 60, to: 30 }]);
    expect(blockingForSegment(entries, 96, 200)).toEqual(['bath-towel', { y: 36 }, { y: 54, from: 0, to: 4 }, { y: 70, from: 34 }]);
  });
});

describe('fileiras por altura × painéis (S36)', () => {
  const long = plain({ length: 384, blocking: ['kitchen-base', { y: 54, from: 100, to: 300, label: 'Rail' }] });

  it('bloco com blocking não segura quebra: candidatos iguais aos da parede sem fileira', () => {
    expect(wallBreakCandidates(long, config)).toEqual(wallBreakCandidates(plain({ length: 384 }), config));
    const { panel, plan } = framePanel(long, config);
    expect(whyNotBreak(192, panel, config, { zones: plan.zones, strips: [] })).toBeUndefined();
  });

  it('cada painel gera a sua fileira; o trecho é cortado por painel', () => {
    const panels = splitWall(long, config);
    expect(panels.length).toBeGreaterThan(1);
    for (const p of panels) {
      const base = blocksOf(p.members).filter((b) => b.label === 'Base cabinets / countertop');
      expect(base.length).toBeGreaterThan(0);
      for (const b of base) expect(b.y).toBe(35.25);
    }
    const rail = panels.flatMap((p) => blocksOf(p.members).filter((b) => b.label === 'Rail').map((b) => b.x + p.wallOffset));
    expect(Math.min(...rail)).toBeLessThan(100 + 16);
    expect(Math.max(...rail)).toBeGreaterThan(300 - 16);
    expect(rail.every((x) => x > 100 - 16 && x < 300)).toBe(true);
  });
});

describe('blocking vindo do tipo de parede e da planta (S36)', () => {
  it('a parede sem blocking usa o do tipo; com blocking (mesmo []) a parede manda', () => {
    const cfg = { wallTypes: { 'WT-4': { section: '2x4' as const, blocking: ['kitchen-base'] } } };
    expect(resolveWallType({ id: 'W', wallType: 'WT-4', exterior: false, bearing: false }, cfg).blocking).toEqual(['kitchen-base']);
    expect(resolveWallType({ id: 'W', wallType: 'WT-4', exterior: false, bearing: false, blocking: [] }, cfg).blocking).toEqual([]);
    expect(resolveWallType({ id: 'W', section: '2x4', exterior: false, bearing: false }, cfg)).not.toHaveProperty('blocking');
  });

  it('na planta, from/to medidos do start viram x do painel', () => {
    const [frame] = frameWalls({
      walls: [
        {
          id: 'A', start: { x: 0, y: 0 }, end: { x: 144, y: 0 }, height: 97.125, section: '2x4', exterior: false, bearing: false, openings: [],
          blocking: ['bath-towel', { y: 36, from: 10, to: 50 }],
        },
        { id: 'B', start: { x: 0, y: 0 }, end: { x: 0, y: 100 }, height: 97.125, section: '2x4', exterior: false, bearing: false, openings: [] },
      ],
    });
    // A (a mais longa) atravessa o canto: a plate começa na face externa de B, 1.75" antes do `start`.
    const s0 = -1.75;
    expect(frame!.wall.length).toBe(144 + 1.75);
    expect(frame!.wall.blocking).toEqual(['bath-towel', { y: 36, from: 10 - s0, to: 50 - s0 }]);
  });
});

describe('folha: fire blocking ganha cota e rótulo (S36)', () => {
  it('wall-144-fireblock: "B · Fire blocking (center …)"', () => {
    const p = panelizeWall(fire.wall, fire.config);
    expect(blockingRows(p)).toEqual([{ kind: 'fire', center: 71.8125, lo: 1.5, hi: 142.5 }]);
    expect(panelSvg(p)).toContain(esc('B · Fire blocking (center 71 13/16")'));
  });

  it('painel sem fileira não ganha coluna', () => {
    expect(panelSvg(panelizeWall(original.wall, original.config))).not.toContain('blocking-row');
  });
});
