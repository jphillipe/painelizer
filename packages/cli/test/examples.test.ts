import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/examples';
import { parseProject } from '../src/project';

describe('EXAMPLES (S20)', () => {
  it('são os três arquivos de examples/, cada um passando no parser', () => {
    expect(EXAMPLES.map((e) => e.id)).toEqual(['casa-exemplo', 'house-28x40', 'ringgold-checkpoint']);
    for (const e of EXAMPLES) {
      const fromDisk = JSON.parse(readFileSync(new URL(`../examples/${e.id}.json`, import.meta.url), 'utf8')) as unknown;
      expect(JSON.parse(e.text)).toEqual(fromDisk);
      expect(() => parseProject(e.text, e.id)).not.toThrow();
    }
  });
});
