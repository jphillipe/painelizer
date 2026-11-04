/**
 * Medição determinística de uma leitura (2026-10-30): quantas portas a IA achou, quantas posicionou e de onde
 * veio cada posição, contra uma "verdade" contada à mão na planta (`test/eval/ringgold-truth.json`). Serve para
 * comparar leituras antes/depois de uma mudança no prompt ou na entrada, e leituras repetidas entre si
 * (variância). Puro: sem rede, sem fs; o script `scripts/eval-reading.ts` lê os arquivos.
 *
 * O que NÃO mede: se a posição está certa. Isso o revisor confere no editor, sobre a planta de fundo.
 */

import { convert } from './convert';
import type { ExtractionOutput, OpeningOut } from './schema';

export interface ReadingTruth {
  name: string;
  level?: number;
  /** Quantas portas de cada tag existem na planta. */
  doorTags: Record<string, number>;
  /** Vãos/portas sem tag (cased openings) que a planta mostra. */
  untaggedOpeningsMin?: number;
  /** Portas em paredes internas (com ou sem tag). */
  interiorDoorsMin?: number;
  roomsMin?: number;
}

export interface TagScore {
  tag: string;
  expected: number;
  found: number;
  positioned: number;
}

export interface EvalReport {
  name: string;
  walls: { total: number; interior: number };
  openings: {
    total: number;
    interior: number;
    interiorPositioned: number;
    unplaced: string[];
    untagged: number;
    bySource: Record<'dimension' | 'rule' | 'scaled' | 'none', number>;
    confidence: { mean: number; min: number; below07: number };
  };
  tags: TagScore[];
  /** Portas com tag encontradas / esperadas (0–1), contando no máximo o esperado de cada tag. */
  tagCoverage: number;
  rooms: { total: number; withoutDoor: string[]; expectedMin: number | undefined };
  warnings: Record<string, number>;
  problems: number;
  notes: number;
  /** O que ficou abaixo da verdade, em frases. */
  shortfalls: string[];
}

const hasPosition = (o: OpeningOut): boolean => o.center !== null || o.offset !== null;

function isDoor(o: OpeningOut, kinds: Map<string, 'window' | 'door'>): boolean {
  if (o.tag !== null) return (kinds.get(o.tag) ?? o.type) !== 'window';
  return o.type === 'door';
}

export function evaluateReading(out: ExtractionOutput, truth: ReadingTruth): EvalReport {
  const kinds = new Map(out.openingTypes.map((t) => [t.tag, t.kind]));
  const all = out.walls.flatMap((w) => w.openings.map((o) => ({ w, o })));
  const interior = all.filter(({ w }) => !w.exterior);
  const bySource: EvalReport['openings']['bySource'] = { dimension: 0, rule: 0, scaled: 0, none: 0 };
  for (const { o } of all) bySource[hasPosition(o) ? (o.positionSource ?? 'dimension') : 'none']++;
  const confidences = all.map(({ o }) => o.confidence);
  const mean = confidences.length === 0 ? 0 : confidences.reduce((a, b) => a + b, 0) / confidences.length;

  const tags: TagScore[] = Object.entries(truth.doorTags).map(([tag, expected]) => {
    const found = all.filter(({ o }) => o.tag === tag);
    return { tag, expected, found: found.length, positioned: found.filter(({ o }) => hasPosition(o)).length };
  });
  const expectedTotal = tags.reduce((n, t) => n + t.expected, 0);
  const matched = tags.reduce((n, t) => n + Math.min(t.expected, t.found), 0);

  const converted = convert(out);
  const warnings: Record<string, number> = {};
  for (const w of converted.warnings) {
    const code = w.code;
    warnings[code] = (warnings[code] ?? 0) + 1;
  }

  const interiorDoors = interior.filter(({ o }) => isDoor(o, kinds));
  const untagged = all.filter(({ o }) => o.tag === null && o.type === 'door').length;
  const roomsWithout = out.rooms.filter((r) => r.doors.length === 0).map((r) => r.name);

  const shortfalls: string[] = [];
  for (const t of tags) {
    if (t.found < t.expected) shortfalls.push(`tag ${t.tag}: ${t.found} de ${t.expected} encontradas`);
    if (t.positioned < t.found) shortfalls.push(`tag ${t.tag}: ${t.found - t.positioned} sem posição`);
  }
  if (truth.untaggedOpeningsMin !== undefined && untagged < truth.untaggedOpeningsMin) {
    shortfalls.push(`vãos sem tag: ${untagged} de pelo menos ${truth.untaggedOpeningsMin}`);
  }
  if (truth.interiorDoorsMin !== undefined && interiorDoors.length < truth.interiorDoorsMin) {
    shortfalls.push(`portas em paredes internas: ${interiorDoors.length} de pelo menos ${truth.interiorDoorsMin}`);
  }
  if (truth.roomsMin !== undefined && out.rooms.length < truth.roomsMin) {
    shortfalls.push(`cômodos listados: ${out.rooms.length} de pelo menos ${truth.roomsMin}`);
  }
  if (roomsWithout.length > 0) shortfalls.push(`cômodos sem porta: ${roomsWithout.join(', ')}`);

  return {
    name: truth.name,
    walls: { total: out.walls.length, interior: out.walls.filter((w) => !w.exterior).length },
    openings: {
      total: all.length,
      interior: interior.length,
      interiorPositioned: interior.filter(({ o }) => hasPosition(o)).length,
      unplaced: all.filter(({ o }) => !hasPosition(o)).map(({ o }) => o.id),
      untagged,
      bySource,
      confidence: { mean, min: confidences.length === 0 ? 0 : Math.min(...confidences), below07: confidences.filter((c) => c < 0.7).length },
    },
    tags,
    tagCoverage: expectedTotal === 0 ? 1 : matched / expectedTotal,
    rooms: { total: out.rooms.length, withoutDoor: roomsWithout, expectedMin: truth.roomsMin },
    warnings,
    problems: converted.problems.length,
    notes: out.notes.length,
    shortfalls,
  };
}

const pct = (x: number): string => `${Math.round(x * 100)} %`;

/** Relatório em texto, uma linha por medida, estável para diff entre leituras. */
export function formatEvalReport(r: EvalReport, label?: string): string {
  const lines: string[] = [];
  lines.push(`# ${label ?? r.name}`);
  lines.push(`paredes: ${r.walls.total} (${r.walls.interior} internas)`);
  lines.push(
    `aberturas: ${r.openings.total} · em paredes internas ${r.openings.interior} (${r.openings.interiorPositioned} com posição) · sem tag ${r.openings.untagged}`,
  );
  lines.push(
    `posição: cota ${r.openings.bySource.dimension} · regra ${r.openings.bySource.rule} · escala ${r.openings.bySource.scaled} · sem posição ${r.openings.bySource.none}` +
      (r.openings.unplaced.length > 0 ? ` (${r.openings.unplaced.join(', ')})` : ''),
  );
  lines.push(`confiança: média ${r.openings.confidence.mean.toFixed(2)} · mínima ${r.openings.confidence.min.toFixed(2)} · abaixo de 0,7: ${r.openings.confidence.below07}`);
  lines.push(`tags de porta: ${pct(r.tagCoverage)} — ${r.tags.map((t) => `${t.tag} ${t.found}/${t.expected}${t.positioned < t.found ? ` (${t.positioned} posicionadas)` : ''}`).join(' · ')}`);
  lines.push(`cômodos: ${r.rooms.total}${r.rooms.expectedMin === undefined ? '' : ` (esperados ≥ ${r.rooms.expectedMin})`} · sem porta: ${r.rooms.withoutDoor.length}`);
  const warn = Object.entries(r.warnings)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
  lines.push(`avisos: ${warn === '' ? 'nenhum' : warn} · problemas: ${r.problems} · notas: ${r.notes}`);
  lines.push(r.shortfalls.length === 0 ? 'faltas: nenhuma' : `faltas:\n${r.shortfalls.map((s) => `  - ${s}`).join('\n')}`);
  return lines.join('\n');
}
