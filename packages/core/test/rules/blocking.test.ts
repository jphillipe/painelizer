import { describe, expect, it } from 'vitest';
import type { Config, FlatMember, Member, StudMember, Wall } from '../../src/types';
import { DEFAULT_FIRE_BLOCK_AT, blocksBetween, fireBlockRows, fireBlocks, gapsBetween } from '../../src/rules/blocking';
import { ladderBays } from '../../src/rules/corners';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { splitWall, wallBreakCandidates } from '../../src/panelize/splitWall';
import fireJson from '../fixtures/wall-144-fireblock.json';
import { wallFixture } from '../helpers/fixtures';
import { expectSameMembers } from '../helpers/members';

const fire = wallFixture(fireJson);

const stud = (x: number, extra: Partial<StudMember> = {}): StudMember => ({
  role: 'stud',
  section: '2x6',
  length: 140.625,
  x,
  y: 1.5,
  orientation: 'vertical',
  ...extra,
});

const blocksOf = (members: readonly Member[]): FlatMember[] =>
  members.filter((m): m is FlatMember => m.role === 'block');

describe('wall-144-fireblock (S31, P11/P50)', () => {
  const panel = panelizeWall(fire.wall, fire.config);

  it('members do fixture: 21 peças + 8 blocos de fogo, zona da janela sem bloco', () => {
    expectSameMembers(panel.members, fire.expected.members as Member[]);
    expect(panel.members).toHaveLength(29);
  });

  it('todos os blocos levam blocking: fire', () => {
    const blocks = blocksOf(panel.members);
    expect(blocks).toHaveLength(8);
    for (const b of blocks) expect(b.blocking).toBe('fire');
  });

  it('sem avisos', () => {
    expect(panel.warnings).toEqual(fire.expected.warnings);
  });

  it('config.fireBlockAt maior que a cavidade: nenhum bloco', () => {
    const p = panelizeWall(fire.wall, { ...fire.config, fireBlockAt: 144 });
    expect(blocksOf(p.members)).toEqual([]);
  });
});

describe('fireBlockRows', () => {
  it('até o limite, nenhuma fileira; o default é 120"', () => {
    expect(DEFAULT_FIRE_BLOCK_AT).toBe(120);
    expect(fireBlockRows(120, 120, 1.5, 1.5)).toEqual([]);
    expect(fireBlockRows(92.625, 120, 1.5, 1.5)).toEqual([]);
  });

  it('uma fileira no meio da cavidade: trechos iguais', () => {
    expect(fireBlockRows(140.625, 120, 1.5, 1.5)).toEqual([71.0625]);
    expect(fireBlockRows(120.5, 120, 1.5, 1.5)).toEqual([1.5 + 59.5]);
  });

  it('duas fileiras quando um bloco não basta (cada trecho ≤ limite)', () => {
    // 1 fileira: (243 − 1.5)/2 = 120.75 > 120 → 2 fileiras de trechos (243 − 3)/3 = 80.
    expect(fireBlockRows(243, 120, 1.5, 1.5)).toEqual([81.5, 163]);
    // 241.5 ainda cabe numa fileira: (241.5 − 1.5)/2 = 120.
    expect(fireBlockRows(241.5, 120, 1.5, 1.5)).toEqual([121.5]);
  });

  it('limite inválido é erro', () => {
    expect(() => fireBlockRows(140, 0, 1.5, 1.5)).toThrow(RangeError);
    expect(() => fireBlockRows(140, Number.NaN, 1.5, 1.5)).toThrow(RangeError);
  });
});

describe('gapsBetween / blocksBetween', () => {
  it('vãos entre peças vizinhas; peças sobrepostas contam como uma; vão < 1.5" sai', () => {
    const spans = [
      { lo: 0, hi: 1.5 },
      { lo: 15.25, hi: 16.75 },
      { lo: 16, hi: 17.5 },
      { lo: 18.5, hi: 20 },
      { lo: 31.25, hi: 32.75 },
    ];
    expect(gapsBetween(spans, 1.5, 31.25)).toEqual([
      { x: 1.5, length: 13.75 },
      { x: 20, length: 11.25 },
    ]);
  });

  it('fileira entre as verticais, pulando a faixa de skip', () => {
    const v = [stud(0), stud(15.25), stud(31.25), stud(47.25)];
    const row = blocksBetween(v, { y: 50, section: '2x6', skip: [{ lo: 20, hi: 25 }] });
    expect(row.map((b) => [b.x, b.length])).toEqual([
      [1.5, 13.75],
      [32.75, 14.5],
    ]);
    expect(row[0]).toEqual({ role: 'block', section: '2x6', length: 13.75, x: 1.5, y: 50, orientation: 'horizontal' });
  });

  it('stud flat (canto California) delimita pela largura real', () => {
    const v = [stud(0), stud(1.5, { flat: true }), stud(15.25)];
    expect(blocksBetween(v, { y: 50, section: '2x6' }).map((b) => [b.x, b.length])).toEqual([[7, 8.25]]);
  });

  it('fireBlocks: parede baixa não leva nada', () => {
    const cfg: Config = { studSpacing: 16, studThickness: 1.5, plateThickness: 1.5, studLength: [92.625] };
    expect(fireBlocks({ height: 97.125, section: '2x6' }, [stud(0), stud(15.25)], [], cfg)).toEqual([]);
  });
});

describe('fire blocking com T e com divisão em painéis', () => {
  const config: Config = {
    studSpacing: 16,
    studThickness: 1.5,
    plateThickness: 1.5,
    studLength: [92.625, 104.625, 140.625],
  };
  const tall: Wall = {
    id: 'W-tall',
    length: 192,
    height: 145.125,
    section: '2x6',
    exterior: false,
    bearing: false,
    openings: [],
    joints: { tees: [{ x: 72, width: 3.5, wallId: 'W2' }] },
  };

  it('ladder: o trecho do T fica só com os blocos do ladder (a cada 24")', () => {
    const p = panelizeWall(tall, config);
    const blocks = blocksOf(p.members);
    const [bay] = ladderBays(
      tall,
      [{ lo: 70.25, hi: 73.75 }],
      p.members.filter((m) => m.orientation === 'vertical'),
    );
    expect(bay).toEqual({ lo: 64.75, hi: 79.25 });
    const inBay = blocks.filter((b) => b.x >= bay!.lo - 1e-9 && b.x < bay!.hi);
    expect(inBay.every((b) => b.blocking === undefined)).toBe(true);
    expect(inBay.map((b) => b.y)).toEqual([23.25, 47.25, 71.25, 95.25, 119.25]);
    const fireXs = blocks.filter((b) => b.blocking === 'fire').map((b) => b.x);
    expect(fireXs).toEqual([1.5, 16.75, 32.75, 48.75, 80.75, 96.75, 112.75, 128.75, 144.75, 160.75, 176.75]);
  });

  it('backer: o vão entre os dois studs de encosto também leva bloco de fogo', () => {
    const p = panelizeWall(tall, { ...config, tee: 'backer' });
    const fireBlocksX = blocksOf(p.members).map((b) => [b.x, b.length]);
    expect(fireBlocksX).toContainEqual([70.25, 3.5]);
    expect(blocksOf(p.members).every((b) => b.blocking === 'fire')).toBe(true);
  });

  it('bloco de fogo não impede quebra: os candidatos são os mesmos da parede baixa, e cada painel leva a sua fileira', () => {
    const long: Wall = {
      id: 'W-long',
      length: 480,
      height: 145.125,
      section: '2x6',
      exterior: false,
      bearing: false,
      openings: [],
    };
    const low: Wall = { ...long, height: 97.125 };
    expect(wallBreakCandidates(long, config)).toEqual(wallBreakCandidates(low, config));
    const panels = splitWall(long, config);
    expect(panels.length).toBeGreaterThan(1);
    for (const p of panels) {
      const fireRow = blocksOf(p.members).filter((b) => b.blocking === 'fire');
      expect(fireRow.length).toBeGreaterThan(0);
      for (const b of fireRow) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.length).toBeLessThanOrEqual(p.length + 1e-9);
      }
    }
  });
});
