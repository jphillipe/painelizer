import { describe, expect, it } from 'vitest';
import type { Config, Panel, Wall } from '../src/types';
import { sectionDepth } from '../src/types';
import plain from './fixtures/wall-144-plain.json';
import window from './fixtures/wall-144-window.json';

describe('types', () => {
  it('espessura real é derivada da seção', () => {
    expect(sectionDepth('2x4')).toBe(3.5);
    expect(sectionDepth('2x6')).toBe(5.5);
    expect(sectionDepth('2x10')).toBe(9.25);
  });

  it('fixtures são compatíveis com Wall, Config e Panel', () => {
    for (const fx of [plain, window]) {
      const wall = fx.wall as Wall;
      const config = fx.config as Config;
      const panel: Panel = {
        id: wall.id,
        wallId: wall.id,
        length: wall.length,
        height: wall.height,
        section: wall.section,
        members: fx.expected.members as Panel['members'],
        fieldCuts: [],
        warnings: fx.expected.warnings,
      };
      expect(config.studSpacing).toBe(16);
      expect(panel.members.length).toBeGreaterThan(0);
    }
  });
});
