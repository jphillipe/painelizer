import { describe, expect, it } from 'vitest';
import type { Issue } from './problems';
import type { WallProvenance } from './provenance';
import { countByFilter, filterWalls, hasLowConfidence, wallNeedsAttention } from './wall-filters';

const walls = [{ id: 'N1' }, { id: 'S1' }, { id: 'I1' }, { id: 'I2' }];
const issue = (wallId: string): Issue => ({ severity: 'warning', source: 'engine', text: `parede ${wallId}: x`, wallId });
const issuesByWall = new Map<string | undefined, Issue[]>([
  ['N1', [issue('N1')]],
  [undefined, [{ severity: 'problem', source: 'draft', text: 'config.studLength: …' }]],
]);
const prov = (confidence: number, openings: number[] = []): WallProvenance => ({
  confidence,
  evidence: '',
  wallType: null,
  openings: new Map(openings.map((c, i) => [`o${i}`, { confidence: c, kind: 'window', position: '' }])),
});
const provenance = new Map<string, WallProvenance>([
  ['N1', prov(0.95)],
  ['S1', prov(0.6)],
  ['I1', prov(0.9, [0.5])],
  ['I2', prov(0.8, [0.9])],
]);

describe('wall-filters', () => {
  it('confiança baixa na parede ou numa abertura', () => {
    expect(hasLowConfidence(undefined)).toBe(false);
    expect(hasLowConfidence(prov(0.95))).toBe(false);
    expect(hasLowConfidence(prov(0.6))).toBe(true);
    expect(hasLowConfidence(prov(0.9, [0.5]))).toBe(true);
  });

  it('attention = issue na parede ou confiança baixa; issues do projeto não contam para nenhuma parede', () => {
    expect(wallNeedsAttention('N1', issuesByWall, provenance)).toBe(true);
    expect(wallNeedsAttention('I2', issuesByWall, provenance)).toBe(false);
    expect(filterWalls(walls, 'all', issuesByWall, provenance).map((w) => w.id)).toEqual(['N1', 'S1', 'I1', 'I2']);
    expect(filterWalls(walls, 'attention', issuesByWall, provenance).map((w) => w.id)).toEqual(['N1', 'S1', 'I1']);
    expect(filterWalls(walls, 'lowConfidence', issuesByWall, provenance).map((w) => w.id)).toEqual(['S1', 'I1']);
    expect(countByFilter(walls, issuesByWall, provenance)).toEqual({ all: 4, attention: 3, lowConfidence: 2 });
  });

  it('sem leitura da IA, só as issues contam', () => {
    expect(filterWalls(walls, 'attention', issuesByWall, new Map()).map((w) => w.id)).toEqual(['N1']);
    expect(filterWalls(walls, 'lowConfidence', issuesByWall, new Map())).toEqual([]);
  });
});
