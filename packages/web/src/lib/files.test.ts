import { describe, expect, it } from 'vitest';
import { svgFileName } from 'cli/build';
import type { GeneratedFile, PanelSummary } from '@/types/panels';
import { baseName, csvsOf, fileKind, fileLabel, formatSize, mimeOf, planOf, sheetFileName, sheetsOf, zipName } from './files';

const files: GeneratedFile[] = [
  { path: 'cutlist.csv', content: 'a' },
  { path: 'bom.csv', content: 'b' },
  { path: 'panels.csv', content: 'c' },
  { path: 'plan.svg', content: '<svg>plan</svg>' },
  { path: 'panels/1-W01-P1.svg', content: '<svg>p1</svg>' },
  { path: 'panels/1-W01-P2.svg', content: '<svg>p2</svg>' },
];
const panel = (id: string): PanelSummary => ({ id, wallId: 'W01', length: 144, pieces: 14, weightLb: 244.9 });

describe('files', () => {
  it('sheetFileName segue a regra do CLI', () => {
    for (const id of ['1-W01-P1', 'a/b', '..x', 'W 1', 'ação']) expect(sheetFileName(id)).toBe(svgFileName(id));
  });

  it('planOf e csvsOf', () => {
    expect(planOf(files)).toBe('<svg>plan</svg>');
    expect(planOf(files.filter((f) => f.path !== 'plan.svg'))).toBeUndefined();
    expect(csvsOf(files).map((f) => f.path)).toEqual(['cutlist.csv', 'bom.csv', 'panels.csv']);
  });

  it('sheetsOf na ordem dos painéis, pulando painel sem folha', () => {
    const sheets = sheetsOf(files, [panel('1-W01-P2'), panel('1-W01-P1'), panel('1-W09-P1')]);
    expect(sheets.map((s) => s.panelId)).toEqual(['1-W01-P2', '1-W01-P1']);
    expect(sheets[0]).toEqual({ panelId: '1-W01-P2', path: 'panels/1-W01-P2.svg', svg: '<svg>p2</svg>' });
  });

  it('zipName faz slug ascii', () => {
    expect(zipName('Casa 28x40 (visão)')).toBe('casa-28x40-visao-panels.zip');
    expect(zipName('26 Ringgold St — checkpoint')).toBe('26-ringgold-st-checkpoint-panels.zip');
    expect(zipName('   ')).toBe('project-panels.zip');
  });

  it('formatSize', () => {
    expect(formatSize('abc')).toBe('3 B');
    expect(formatSize('x'.repeat(2048))).toBe('2.0 KB');
    expect(formatSize('ação')).toBe('6 B');
  });

  it('fileKind, mimeOf e baseName pela árvore do CLI', () => {
    expect(files.map((f) => fileKind(f.path))).toEqual(['csv', 'csv', 'csv', 'plan', 'sheet', 'sheet']);
    expect(fileKind('readme.txt')).toBe('other');
    expect(mimeOf('cutlist.csv')).toBe('text/csv');
    expect(mimeOf('panels/1-W01-P1.svg')).toBe('image/svg+xml');
    expect(mimeOf('x.json')).toBe('application/json');
    expect(mimeOf('x')).toBe('text/plain');
    expect(baseName('panels/1-W01-P1.svg')).toBe('1-W01-P1.svg');
    expect(baseName('bom.csv')).toBe('bom.csv');
  });

  it('fileLabel: fixos para CSV e planta, id do painel na folha, caminho no resto', () => {
    expect(fileLabel('bom.csv')).toMatch(/Bill of materials/);
    expect(fileLabel('plan.svg')).toMatch(/Panel plan/);
    expect(fileLabel('panels/1-W01-P1.svg', '1-W01-P1')).toBe('Fabrication sheet 1-W01-P1');
    expect(fileLabel('panels/W_1.svg')).toBe('Fabrication sheet W_1');
    expect(fileLabel('other.txt')).toBe('other.txt');
  });
});
