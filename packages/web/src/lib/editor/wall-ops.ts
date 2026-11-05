/**
 * Operações de parede do editor (S30): duplicar, dividir e juntar. Puras, sobre o draft; o reducer só as chama.
 * Não mudam regra do motor: redistribuem o que a parede já tinha (aberturas, studs extras, quebras forçadas, fileiras
 * de blocking, regra das pontas) entre os pedaços, em x do `start` de cada um. Ids de abertura não mudam ao dividir/juntar (são únicos
 * no projeto); a parede nova ganha `nextWallId`. Parede criada ou mudada perde a marca de revisão (`$reviewed`).
 *
 * Recusas voltam com a frase em inglês para o inspetor (`reason`), nunca exceção.
 */

import {
  isPlanWall,
  isIdFree,
  nextWallId,
  wallLength,
  withoutReviewed,
  type DraftBlockingEntry,
  type DraftExtraStud,
  type DraftOpening,
  type DraftWall,
  type Point,
  type ProjectDraft,
} from './draft';
import { formatMeasure } from './measure';
import { configFromDraft, resolveDraftOpening } from './resolve';

export type WallOp = { ok: true; draft: ProjectDraft; wallIds: string[] } | { ok: false; reason: string };

/** Cópia deslocada na diagonal: paralela à original a 2' em qualquer direção, sem sobrepor o corpo. */
export const DUPLICATE_OFFSET = 24;
/** Menor pedaço de uma divisão. */
export const MIN_PIECE = 1;
const EPS = 1e-6;

/** Campos que duas paredes precisam ter iguais para virar uma. */
const JOIN_FIELDS = [
  'section',
  'height',
  'exterior',
  'bearing',
  'level',
  'floorsSupported',
  'floorSpan',
  'buildingWidth',
  'wallType',
] as const;

// ---- duplicar ---------------------------------------------------------------

/**
 * Cópias das paredes (na ordem do arquivo), logo depois da última delas: mesmas propriedades, aberturas com ids
 * novos (`<parede>-O1`…), sem `$reviewed`. Na planta, todas andam o mesmo `(+24, −24)` — o conjunto mantém a forma.
 */
export function duplicateWalls(d: ProjectDraft, wallIds: readonly string[]): WallOp {
  const sources = d.walls.filter((w) => wallIds.includes(w.id));
  if (sources.length === 0) return { ok: false, reason: 'Select a wall to duplicate' };
  const at = Math.max(...sources.map((w) => d.walls.indexOf(w))) + 1;
  let next: ProjectDraft = d;
  const copies: DraftWall[] = [];
  const taken = new Set<string>();
  for (const w of sources) {
    const id = nextWallId(next);
    const openings = w.openings.map((o) => ({ ...structuredClone(o), id: freeOpeningId(next, id, taken) }));
    const copy: DraftWall = { ...withoutReviewed(structuredClone(w)), id, openings };
    if (w.start !== undefined) copy.start = round({ x: w.start.x + DUPLICATE_OFFSET, y: w.start.y - DUPLICATE_OFFSET });
    if (w.end !== undefined) copy.end = round({ x: w.end.x + DUPLICATE_OFFSET, y: w.end.y - DUPLICATE_OFFSET });
    copies.push(copy);
    next = { ...next, walls: [...next.walls, copy] };
  }
  return {
    ok: true,
    draft: { ...d, walls: [...d.walls.slice(0, at), ...copies, ...d.walls.slice(at)] },
    wallIds: copies.map((c) => c.id),
  };
}

function freeOpeningId(d: ProjectDraft, wallId: string, taken: Set<string>): string {
  for (let n = 1; ; n += 1) {
    const id = `${wallId}-O${n}`;
    if (!taken.has(id) && isIdFree(d, id, 'opening')) {
      taken.add(id);
      return id;
    }
  }
}

// ---- dividir ----------------------------------------------------------------

/**
 * Divide a parede em `at` (do `start`): o primeiro pedaço fica com o id, o segundo ganha um id novo logo depois.
 * Aberturas, studs extras e quebras forçadas vão para o pedaço onde estão (as do segundo andam −`at`); a regra da
 * ponta `start` fica no primeiro, a da `end` no segundo. Parede solta: o segundo pedaço guarda o layout de studs da
 * parede inteira (`layoutOrigin − at`). Recusa um corte dentro de uma abertura ou de um grupo de studs extras.
 */
export function splitWall(d: ProjectDraft, wallId: string, at: number): WallOp {
  const w = d.walls.find((x) => x.id === wallId);
  if (w === undefined) return { ok: false, reason: `Wall ${wallId} no longer exists` };
  const length = wallLength(w);
  if (length === undefined) return { ok: false, reason: `${wallId} has no length yet` };
  const cut = round1(at);
  if (!(cut >= MIN_PIECE && cut <= length - MIN_PIECE))
    return {
      ok: false,
      reason: `Split between ${formatMeasure(MIN_PIECE)} and ${formatMeasure(length - MIN_PIECE)} from the start`,
    };
  const config = configFromDraft(d);
  const first: DraftOpening[] = [];
  const second: DraftOpening[] = [];
  for (const o of w.openings) {
    const s = openingSpan(d, o, config);
    if (s === undefined || s.s1 <= cut + EPS) first.push(o);
    else if (s.s0 >= cut - EPS) second.push(shifted(o, -cut));
    else return { ok: false, reason: `Opening ${o.id} spans ${formatMeasure(cut)}; split beside it` };
  }
  const t = config.studThickness;
  const studsA: DraftExtraStud[] = [];
  const studsB: DraftExtraStud[] = [];
  for (const e of w.extraStuds ?? []) {
    if (e.x === undefined || e.x + t * (e.count ?? 1) <= cut + EPS) studsA.push(e);
    else if (e.x >= cut - EPS) studsB.push({ ...e, x: round1(e.x - cut) });
    else
      return { ok: false, reason: `Extra stud at ${formatMeasure(e.x)} spans ${formatMeasure(cut)}; split beside it` };
  }
  const base = withoutReviewed(w);
  const a: DraftWall = { ...base, openings: first };
  const b: DraftWall = { ...structuredClone(base), id: nextWallId(d), openings: second };
  setOrDrop(a, 'extraStuds', studsA);
  setOrDrop(b, 'extraStuds', studsB);
  if (w.panelBreaks !== undefined) {
    a.panelBreaks = w.panelBreaks.filter((x) => x < cut - EPS);
    b.panelBreaks = w.panelBreaks.filter((x) => x > cut + EPS).map((x) => round1(x - cut));
  }
  // Blocking (S36): preset e fileira da parede inteira ficam nos dois pedaços; fileira com trecho vai cortada a cada um.
  if (w.blocking !== undefined) {
    a.blocking = blockingPiece(w.blocking, 0, cut);
    b.blocking = blockingPiece(w.blocking, cut, length);
  }
  splitEnds(w, a, b);
  if (isPlanWall(w) && w.start !== undefined && w.end !== undefined) {
    const p = round(pointAt(w.start, w.end, cut));
    a.end = p;
    b.start = p;
  } else {
    a.length = cut;
    b.length = round1(length - cut);
    if (w.layoutOrigin !== undefined || cut % 16 !== 0) b.layoutOrigin = round1((w.layoutOrigin ?? 0) - cut);
  }
  const i = d.walls.indexOf(w);
  return {
    ok: true,
    draft: { ...d, walls: [...d.walls.slice(0, i), a, b, ...d.walls.slice(i + 1)] },
    wallIds: [a.id, b.id],
  };
}

function splitEnds(w: DraftWall, a: DraftWall, b: DraftWall): void {
  delete a.ends;
  delete b.ends;
  if (w.ends?.start !== undefined) a.ends = { start: w.ends.start };
  if (w.ends?.end !== undefined) b.ends = { end: w.ends.end };
}

/**
 * Onde dividir por padrão: no meio (ao 1"), ou na borda de abertura mais próxima quando o meio cai dentro de uma.
 * `undefined` quando a parede não tem comprimento.
 */
export function suggestSplit(d: ProjectDraft, wallId: string): number | undefined {
  const w = d.walls.find((x) => x.id === wallId);
  const length = w === undefined ? undefined : wallLength(w);
  if (w === undefined || length === undefined || length < 2 * MIN_PIECE) return undefined;
  const mid = Math.round(length / 2);
  const config = configFromDraft(d);
  const inside = w.openings
    .map((o) => openingSpan(d, o, config))
    .find((s) => s !== undefined && s.s0 < mid - EPS && s.s1 > mid + EPS);
  if (inside === undefined) return mid;
  const edge = mid - inside.s0 <= inside.s1 - mid ? inside.s0 : inside.s1;
  return edge >= MIN_PIECE && edge <= length - MIN_PIECE ? round1(edge) : mid;
}

// ---- juntar -----------------------------------------------------------------

/**
 * Junta duas paredes de planta colineares que se encostam ponta a ponta numa só, com o id e o sentido da primeira
 * do arquivo. Pede os campos de framing iguais (seção, altura, papel, pavimento…); aberturas e studs extras da outra
 * vão para a posição equivalente (invertidos se ela corria ao contrário); quebras forçadas voltam ao automático.
 */
export function joinWalls(d: ProjectDraft, aId: string, bId: string): WallOp {
  const pair = d.walls.filter((w) => w.id === aId || w.id === bId);
  if (pair.length !== 2 || aId === bId) return { ok: false, reason: 'Select two walls to join' };
  const [a, b] = pair as [DraftWall, DraftWall];
  if (a.start === undefined || a.end === undefined || b.start === undefined || b.end === undefined)
    return { ok: false, reason: 'Only walls drawn on the plan can be joined' };
  const dirA = dirOf(a.start, a.end);
  const dirB = dirOf(b.start, b.end);
  if (
    dirA === undefined ||
    dirA !== dirB ||
    Math.abs(dirA === 'x' ? a.start.y - b.start.y : a.start.x - b.start.x) > EPS
  ) {
    return { ok: false, reason: `${a.id} and ${b.id} are not on the same line` };
  }
  // A ponta compartilhada e as pontas de fora; os corpos não podem se sobrepor.
  const shared = (['start', 'end'] as const).flatMap((ea) =>
    (['start', 'end'] as const).filter((eb) => same(a[ea]!, b[eb]!)).map((eb) => ({ ea, eb })),
  )[0];
  if (shared === undefined) return { ok: false, reason: `${a.id} and ${b.id} don’t meet end to end` };
  const farA = shared.ea === 'start' ? 'end' : 'start';
  const farB = shared.eb === 'start' ? 'end' : 'start';
  const p = a[shared.ea]!;
  if (dot(sub(a[farA]!, p), sub(b[farB]!, p)) >= 0) return { ok: false, reason: `${a.id} and ${b.id} overlap` };
  // Geometria antes dos campos: "não se encostam" diz mais que "seção diferente" a quem selecionou duas quaisquer.
  const differ = JOIN_FIELDS.filter((k) => a[k] !== b[k]);
  if (differ.length > 0)
    return { ok: false, reason: `${a.id} and ${b.id} differ in ${differ.join(', ')}; make them match first` };
  // Blocking (S36): só junta com as mesmas fileiras e nenhuma com trecho (o trecho de uma não vale na outra).
  if (JSON.stringify(a.blocking ?? []) !== JSON.stringify(b.blocking ?? []))
    return { ok: false, reason: `${a.id} and ${b.id} differ in blocking; make them match first` };
  if ((a.blocking ?? []).some((e) => typeof e !== 'string' && (e.from !== undefined || e.to !== undefined)))
    return { ok: false, reason: `${a.id} has blocking rows with a from/to range; make them whole-wall first` };
  // A primeira manda no sentido: a de fora dela é o start (ou o end) da parede junta.
  const start = farA === 'start' ? a.start : b[farB]!;
  const end = farA === 'start' ? b[farB]! : a.end;
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const u = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  const config = configFromDraft(d);
  const t = config.studThickness;
  const openings: DraftOpening[] = [];
  const extraStuds: DraftExtraStud[] = [];
  for (const w of [a, b]) {
    const L = wallLength(w)!;
    const wu = { x: (w.end!.x - w.start!.x) / L, y: (w.end!.y - w.start!.y) / L };
    const reversed = dot(wu, u) < 0;
    const map = (s: number): number =>
      round1(dot(sub({ x: w.start!.x + wu.x * s, y: w.start!.y + wu.y * s }, start), u));
    for (const o of w.openings) {
      if (o.center !== undefined) openings.push({ ...o, center: map(o.center) });
      else if (o.offset === undefined) openings.push(o);
      else if (!reversed) openings.push({ ...o, offset: map(o.offset) });
      else {
        const s = openingSpan(d, o, config);
        if (s === undefined || s.s1 === s.s0)
          return { ok: false, reason: `Opening ${o.id} has no known width to flip; give it a rough width first` };
        openings.push({ ...o, offset: map(s.s1) });
      }
    }
    for (const e of w.extraStuds ?? [])
      extraStuds.push(e.x === undefined ? e : { ...e, x: map(reversed ? e.x + t * (e.count ?? 1) : e.x) });
  }
  const joined: DraftWall = { ...withoutReviewed(a), start, end, openings };
  delete joined.panelBreaks;
  setOrDrop(joined, 'extraStuds', extraStuds);
  const ends = {
    start: farA === 'start' ? a.ends?.start : b.ends?.[farB],
    end: farA === 'start' ? b.ends?.[farB] : a.ends?.end,
  };
  delete joined.ends;
  if (ends.start !== undefined || ends.end !== undefined)
    joined.ends = {
      ...(ends.start === undefined ? {} : { start: ends.start }),
      ...(ends.end === undefined ? {} : { end: ends.end }),
    };
  return {
    ok: true,
    draft: { ...d, walls: d.walls.filter((w) => w !== b).map((w) => (w === a ? joined : w)) },
    wallIds: [a.id],
  };
}

/** Por que as duas não juntam (`undefined` = juntam). */
export function joinBlocker(d: ProjectDraft, aId: string, bId: string): string | undefined {
  const r = joinWalls(d, aId, bId);
  return r.ok ? undefined : r.reason;
}

// ---- auxiliares -------------------------------------------------------------

/** Faixa [s0, s1] do RO no eixo, do `start`; só a posição (s0 = s1) sem largura conhecida; `undefined` sem posição. */
function openingSpan(
  d: ProjectDraft,
  o: DraftOpening,
  config: ReturnType<typeof configFromDraft>,
): { s0: number; s1: number } | undefined {
  const r = resolveDraftOpening(d, o, config);
  if (r.ok) return { s0: r.opening.offset, s1: r.opening.offset + r.opening.roughWidth };
  const width = o.roughWidth;
  if (o.offset !== undefined) return { s0: o.offset, s1: o.offset + (width ?? 0) };
  if (o.center !== undefined)
    return width === undefined
      ? { s0: o.center, s1: o.center }
      : { s0: o.center - width / 2, s1: o.center + width / 2 };
  return undefined;
}

function shifted(o: DraftOpening, delta: number): DraftOpening {
  const out = { ...o };
  if (out.center !== undefined) out.center = round1(out.center + delta);
  if (out.offset !== undefined) out.offset = round1(out.offset + delta);
  return out;
}

/** As fileiras de blocking do pedaço `[lo, hi]` (x do `start` da parede), em x do pedaço; trecho fora sai. */
function blockingPiece(list: readonly DraftBlockingEntry[], lo: number, hi: number): DraftBlockingEntry[] {
  return list.flatMap((e): DraftBlockingEntry[] => {
    if (typeof e === 'string' || (e.from === undefined && e.to === undefined)) return [e];
    if ((e.to ?? Infinity) <= lo + EPS || (e.from ?? -Infinity) >= hi - EPS) return [];
    const row = { ...e };
    if (e.from !== undefined) row.from = round1(Math.max(e.from, lo) - lo);
    if (e.to !== undefined) row.to = round1(Math.min(e.to, hi) - lo);
    return [row];
  });
}

function setOrDrop(w: DraftWall, key: 'extraStuds', list: DraftExtraStud[]): void {
  if (list.length === 0) delete w[key];
  else w[key] = list;
}

function dirOf(a: Point, b: Point): 'x' | 'y' | undefined {
  if (Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS) return 'x';
  if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS) return 'y';
  return undefined;
}

function pointAt(a: Point, b: Point, s: number): Point {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: a.x + ((b.x - a.x) / L) * s, y: a.y + ((b.y - a.y) / L) * s };
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const same = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;

/** 1/16" (precisão da fábrica), sem restos de ponto flutuante nem −0. */
function round1(n: number): number {
  return Math.round(n * 16) / 16 + 0;
}

function round(p: Point): Point {
  return { x: round1(p.x), y: round1(p.y) };
}
