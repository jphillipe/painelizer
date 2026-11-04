import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { draftFromText } from '@/lib/editor/draft';
import { freeKey, sectionError, sectionText, usageCount } from './catalog-editor';

describe('catálogo editável (S29)', () => {
  const r = draftFromText(EXAMPLES.find((e) => e.id === 'casa-exemplo')!.text);
  if (!r.ok) throw new Error('should open');
  const d = r.draft;

  it('usageCount: aberturas por tag e por marca de header', () => {
    expect(usageCount(d, 'tag', 'P30')).toBeGreaterThan(0);
    expect(usageCount(d, 'headerMark', 'HDR1')).toBe(2);
    expect(usageCount(d, 'tag', 'nope')).toBe(0);
  });

  it('freeKey: primeira chave livre', () => {
    expect(freeKey(undefined, 'T')).toBe('T1');
    expect(freeKey({ T1: 1, T2: 1 }, 'T')).toBe('T3');
  });

  it('seção de header: a regra do schema do arquivo; objeto vira texto', () => {
    expect(sectionError('2x10')).toBeUndefined();
    expect(sectionError('LVL 1.75x9.25')).toBeUndefined();
    expect(sectionError('2x9')).toMatch(/Use 2x4/);
    expect(sectionText({ material: 'PSL', width: 3.5, depth: 11.875 })).toBe('PSL 3.5x11.875');
    expect(sectionText('2x12')).toBe('2x12');
  });
});
