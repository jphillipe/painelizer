import { describe, expect, it } from 'vitest';
import type { Config, Opening, Wall } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { validatePanel } from '../../src/panelize/validate';
import plain from '../fixtures/wall-144-plain.json';
import window from '../fixtures/wall-144-window.json';
import low from '../fixtures/wall-144-window-82.5.json';
import door from '../fixtures/wall-120-door.json';
import windowDoor from '../fixtures/wall-144-window-door.json';
import irc from '../fixtures/wall-144-window-irc.json';
import nonBearingDoor from '../fixtures/wall-120-door-nonbearing.json';

const wall = plain.wall as Wall;
const config = plain.config as Config;
const wWall = window.wall as Wall;
const win = wWall.openings[0] as Opening;

const codes = (w: Wall, c: Config = config) => panelizeWall(w, c).warnings.map((x) => x.code);
const messages = (w: Wall, c: Config = config) => panelizeWall(w, c).warnings.map((x) => x.message);

describe('validatePanel — fixtures', () => {
  it.each([
    ['wall-144-plain', plain],
    ['wall-144-window', window],
    ['wall-144-window-82.5', low],
    ['wall-120-door', door],
    ['wall-144-window-door', windowDoor],
    ['wall-144-window-irc', irc],
    ['wall-120-door-nonbearing', nonBearingDoor],
  ])('%s: sem avisos de validação', (_name, fx) => {
    const panel = panelizeWall(fx.wall as Wall, fx.config as Config);
    expect(validatePanel(panel, fx.wall as Wall, fx.config as Config)).toEqual([]);
    expect(panel.warnings).toEqual(fx.expected.warnings);
  });
});

describe('OPENING_NEAR_CORNER', () => {
  const withWindow = (offset: number): Wall => ({ ...wWall, openings: [{ ...win, offset }] });

  it('king a 1" do início: aviso, e o stud de ponta sumiu', () => {
    // RO [4, 40], zona [1, 43]: stud de ponta [0, 1.5] sobrepõe a zona e é removido
    const panel = panelizeWall(withWindow(4), config);
    expect(panel.warnings.map((w) => w.code)).toEqual(['OPENING_NEAR_CORNER']);
    expect(panel.warnings[0]!.message).toMatch(/abertura win1: king a 1" do início/);
    expect(panel.members.some((m) => m.role === 'stud' && m.x === 0)).toBe(false);
  });

  it('king encostado no canto (folga 0): sem aviso — o king é o stud de ponta', () => {
    expect(codes(withWindow(3))).toEqual([]);
  });

  it('folga de exatamente 1.5: sem aviso — o stud de ponta cabe', () => {
    const panel = panelizeWall(withWindow(4.5), config);
    expect(panel.warnings).toEqual([]);
    expect(panel.members.some((m) => m.role === 'stud' && m.x === 0)).toBe(true);
  });

  it('king a 1" do fim da parede: aviso', () => {
    // RO [104, 140], zona [101, 143]: folga 1 até 144
    expect(messages(withWindow(104))).toEqual([expect.stringMatching(/king a 1" do fim/)]);
  });

  it('2 kings: a folga é medida do king mais externo', () => {
    // zona = RO ± 4.5 → RO em 5.5 deixa 1" até o início
    expect(codes({ ...wWall, openings: [{ ...win, offset: 5.5, kingStuds: 2 }] })).toEqual([
      'OPENING_NEAR_CORNER',
    ]);
  });
});

describe('STUDS_OVERLAP', () => {
  it('parede de 130": marca 128 e fechamento 128.5 se sobrepõem em 1"', () => {
    const panel = panelizeWall({ ...wall, length: 130 }, config);
    expect(panel.warnings.map((w) => w.code)).toEqual(['STUDS_OVERLAP']);
    expect(panel.warnings[0]!.message).toMatch(/stud em x=128 e stud em x=128\.5 se sobrepõem em 1"/);
  });

  it('parede de 131": marca 128 encosta no fechamento 129.5 — sem aviso', () => {
    expect(codes({ ...wall, length: 131 })).toEqual([]);
  });

  it('parede de 129.5": marca coincide com o fechamento, um stud só — sem aviso', () => {
    const panel = panelizeWall({ ...wall, length: 129.5 }, config);
    expect(panel.members.filter((m) => m.role === 'stud' && m.x === 128)).toHaveLength(1);
    expect(panel.warnings).toEqual([]);
  });

  it('um aviso por par', () => {
    expect(codes({ ...wall, length: 130.75 })).toEqual(['STUDS_OVERLAP']);
  });
});

describe('STUD_HEIGHT_ABOVE_LIMIT', () => {
  /** Altura que dá exatamente `studLength` com 3 plates de 1.5. */
  const heightFor = (studLength: number) => studLength + 4.5;
  const only = (code: string) => (w: Wall) => codes(w).filter((c) => c === code);
  const heightCodes = only('STUD_HEIGHT_ABOVE_LIMIT');

  it('portante: stud de 120" passa; 120.5" avisa citando a R602.3(5)', () => {
    expect(heightCodes({ ...wall, height: heightFor(120) })).toEqual([]);
    const w = { ...wall, height: heightFor(120.5) };
    expect(heightCodes(w)).toEqual(['STUD_HEIGHT_ABOVE_LIMIT']);
    expect(messages(w).find((m) => m.includes('R602.3(5)'))).toMatch(/stud de 120\.5" passa do máximo de 120" para parede portante 2x6/);
  });

  it('não portante 2x4: limite 168"', () => {
    const nb = { ...wall, bearing: false, section: '2x4' as const };
    expect(heightCodes({ ...nb, height: heightFor(168) })).toEqual([]);
    expect(heightCodes({ ...nb, height: heightFor(168.5) })).toEqual(['STUD_HEIGHT_ABOVE_LIMIT']);
  });

  it('não portante 2x6: limite 240"', () => {
    const nb = { ...wall, bearing: false };
    expect(heightCodes({ ...nb, height: heightFor(240) })).toEqual([]);
    expect(heightCodes({ ...nb, height: heightFor(240.5) })).toEqual(['STUD_HEIGHT_ABOVE_LIMIT']);
  });
});

describe('FIRE_BLOCKING_REQUIRED', () => {
  it('cavidade de 120" passa; 120.5" avisa (P11)', () => {
    const nb = { ...wall, bearing: false };
    expect(codes({ ...nb, height: 124.5 })).not.toContain('FIRE_BLOCKING_REQUIRED');
    expect(codes({ ...nb, height: 125 })).toContain('FIRE_BLOCKING_REQUIRED');
  });

  it('parede portante alta dispara altura e fire blocking', () => {
    expect(codes({ ...wall, height: 125 })).toEqual([
      'STUD_LENGTH_MISMATCH',
      'STUD_HEIGHT_ABOVE_LIMIT',
      'FIRE_BLOCKING_REQUIRED',
    ]);
  });
});

describe('ordem dos avisos', () => {
  it('parede, depois aberturas, depois validação', () => {
    // Porta com RO que não bate com o header (aviso da abertura) a 1" do início (validação),
    // em parede fora dos pré-cortes (aviso da parede).
    const dWall = door.wall as Wall;
    const d = dWall.openings[0] as Opening;
    const w: Wall = { ...dWall, height: 103.125, openings: [{ ...d, offset: 4, roughHeight: 80 }] };
    expect(codes(w, door.config as Config)).toEqual([
      'STUD_LENGTH_MISMATCH',
      'DOOR_RO_HEIGHT_MISMATCH',
      'OPENING_NEAR_CORNER',
    ]);
  });
});
