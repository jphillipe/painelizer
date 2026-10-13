import { describe, expect, it } from 'vitest';
import type { Config, Panel, Wall } from '../src/types';
import {
  engineeredSection,
  isLumberSection,
  parseEngineeredSection,
  sectionDepth,
  sectionThickness,
} from '../src/types';
import plain from './fixtures/wall-144-plain.json';
import window from './fixtures/wall-144-window.json';

describe('types', () => {
  it('espessura real é derivada da seção', () => {
    expect(sectionDepth('2x4')).toBe(3.5);
    expect(sectionDepth('2x6')).toBe(5.5);
    expect(sectionDepth('2x10')).toBe(9.25);
  });

  it('seção engenheirada (S12.5): "LVL 1.75x9.25" tem espessura 1.75 e profundidade 9.25', () => {
    expect(parseEngineeredSection('LVL 1.75x9.25')).toEqual({ material: 'LVL', width: 1.75, depth: 9.25 });
    expect(parseEngineeredSection('PSL 5.25x7')).toEqual({ material: 'PSL', width: 5.25, depth: 7 });
    expect(parseEngineeredSection('2x10')).toBeUndefined();
    expect(parseEngineeredSection('LVL 1.75')).toBeUndefined();
    expect(engineeredSection('LVL', 1.75, 9.25)).toBe('LVL 1.75x9.25');
    expect(() => engineeredSection('LVL', 0, 9.25)).toThrow(RangeError);
    expect(sectionDepth('LVL 1.75x9.25')).toBe(9.25);
    expect(sectionThickness('LVL 1.75x9.25')).toBe(1.75);
    expect(sectionThickness('2x6')).toBe(1.5);
    expect(isLumberSection('2x6')).toBe(true);
    expect(isLumberSection('LVL 1.75x9.25')).toBe(false);
    expect(() => sectionDepth('3x4' as never)).toThrow(RangeError);
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
