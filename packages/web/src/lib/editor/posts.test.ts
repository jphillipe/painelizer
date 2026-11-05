import { describe, expect, it } from 'vitest';
import type { DraftConfig, DraftWall } from './draft';
import { postHint, postWidth } from './posts';

const config: Pick<DraftConfig, 'wallTypes'> = { wallTypes: { 'WT-6': { section: '2x6' } } };
const wall = (extra: Partial<DraftWall> = {}): DraftWall => ({ id: 'W1', length: 144, openings: [], ...extra });

describe('posts no editor (S37, P45)', () => {
  it('largura em x pela regra do motor; a seção da parede pode vir do tipo', () => {
    expect(postWidth(config, wall({ section: '2x6' }), { section: '4x6' })).toBe(3.5);
    expect(postWidth(config, wall({ section: '2x4' }), { section: '4x6' })).toBe(5.5);
    expect(postWidth(config, wall({ wallType: 'WT-6' }), { section: '6x6' })).toBe(5.5);
    // Sem face que caiba (o motor recusa) ou sem seção da parede: a face menor do post.
    expect(postWidth(config, wall({ section: '2x6' }), { section: '4x4' })).toBe(3.5);
    expect(postWidth(config, wall(), { section: '6x6' })).toBe(5.5);
    expect(postWidth(config, wall(), {})).toBeUndefined();
  });

  it('frase do inspetor', () => {
    expect(postHint(config, wall({ section: '2x6' }), { section: '4x6' })).toBe(
      '3 1/2" along the wall; replaces the layout studs it covers',
    );
    expect(postHint(config, wall({ section: '2x6' }), { section: '4x4' })).toBe(
      'A 4x4 has no face equal to the 2x6 wall depth',
    );
    expect(postHint(config, wall(), { section: '4x4' })).toBe('Set the wall section to place the post');
    expect(postHint(config, wall(), {})).toBe('Pick a size');
  });
});
