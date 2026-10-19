/**
 * Estado do editor de paredes (S21): o draft, a seleção e o histórico (undo/redo). Reducer puro, testado sem
 * React. `revision` cresce a cada mudança do draft e é a chave da checagem do motor com debounce
 * (`useProjectCheck`): uma resposta de revisão mais antiga que a atual é descartada.
 *
 * Edição (S21.1): toda ação passa por `commit`, que empilha o draft anterior; um arraste manda vários commits
 * com o mesmo `txn` e vira um undo só. Patch com chave `undefined` apaga a chave (campo limpo).
 */

import {
  draftFromText,
  isIdFree,
  isPlanWall,
  nextOpeningId,
  nextWallId,
  type DraftBuilding,
  type DraftConfig,
  type DraftOpening,
  type DraftProblem,
  type DraftWall,
  type Point,
  type ProjectDraft,
} from './draft';

export type Selection =
  | { kind: 'none' }
  | { kind: 'project' }
  | { kind: 'wall'; wallId: string }
  | { kind: 'opening'; wallId: string; openingId: string };

export type DraftSource = 'extraction' | 'sample' | 'file';

/** Patch de edição: chave presente com `undefined` apaga o campo. */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

export interface EditorState {
  draft: ProjectDraft | undefined;
  /** Problemas da leitura tolerante do arquivo (`draftFromText`). */
  loadProblems: DraftProblem[];
  /** Mensagem quando o texto nem abre (JSON inválido). */
  loadError: string | undefined;
  source: DraftSource | undefined;
  selection: Selection;
  past: ProjectDraft[];
  future: ProjectDraft[];
  /** Transação aberta (um arraste): commits com o mesmo id substituem o draft sem empilhar histórico. */
  txn: string | undefined;
  revision: number;
  /** Alguma edição desde a carga. */
  dirty: boolean;
}

export type EditorAction =
  | { type: 'load'; text: string; source: DraftSource }
  | { type: 'reset' }
  | { type: 'select'; selection: Selection }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'endTransaction' }
  | { type: 'updateProject'; patch: Patch<Pick<ProjectDraft, 'name' | 'date' | 'revision' | 'northAngle'>> }
  | { type: 'updateConfig'; patch: Patch<Omit<DraftConfig, 'building' | 'openingTypes' | 'headerSchedule' | 'extra'>> }
  | { type: 'updateBuilding'; patch: Patch<DraftBuilding> }
  | { type: 'updateWall'; wallId: string; patch: Patch<Omit<DraftWall, 'id' | 'openings' | 'extra'>> }
  | { type: 'renameWall'; wallId: string; newId: string }
  /** Move uma ponta; ao mover `start`, aberturas e studs extras ficam no lugar em planta (offsets deslocam). */
  | { type: 'moveEndpoint'; wallId: string; end: 'start' | 'end'; point: Point; txn?: string }
  /** Parede solta: `length`; em planta: move `end` ao longo do eixo. */
  | { type: 'setWallLength'; wallId: string; length: number }
  /** Nova parede depois de `afterWallId` (ou no fim), copiando altura, seção, pavimento e papel; em planta, continua da ponta `end` virando 90°. */
  | { type: 'addWall'; afterWallId?: string }
  | { type: 'removeWall'; wallId: string }
  | { type: 'addOpening'; wallId: string }
  | { type: 'removeOpening'; wallId: string; openingId: string }
  | { type: 'updateOpening'; wallId: string; openingId: string; patch: Patch<Omit<DraftOpening, 'id' | 'extra'>> }
  | { type: 'renameOpening'; wallId: string; openingId: string; newId: string }
  /** Borda esquerda do RO em `s0` (do `start`); escreve `center` ou `offset` conforme a forma da abertura. */
  | { type: 'moveOpening'; wallId: string; openingId: string; s0: number; roughWidth: number; txn?: string };

export const HISTORY_LIMIT = 100;
/** Comprimento mínimo de parede ao mover uma ponta. */
export const MIN_WALL_LENGTH = 1;
/** Parede nova: comprimento e abertura default (janela 36 × 48). */
export const NEW_WALL_LENGTH = 96;
export const NEW_OPENING = { roughWidth: 36, roughHeight: 48 } as const;

export const initialEditorState: EditorState = {
  draft: undefined,
  loadProblems: [],
  loadError: undefined,
  source: undefined,
  selection: { kind: 'none' },
  past: [],
  future: [],
  txn: undefined,
  revision: 0,
  dirty: false,
};

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load': {
      const load = draftFromText(action.text);
      if (!load.ok) {
        return { ...initialEditorState, loadError: load.problems.map((p) => p.text).join('; '), loadProblems: load.problems, source: action.source, revision: state.revision + 1 };
      }
      return { ...initialEditorState, draft: load.draft, loadProblems: load.problems, source: action.source, revision: state.revision + 1 };
    }
    case 'reset':
      return { ...initialEditorState, revision: state.revision + 1 };
    case 'select':
      return { ...state, selection: action.selection, txn: undefined };
    case 'endTransaction':
      return state.txn === undefined ? state : { ...state, txn: undefined };
    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (prev === undefined || state.draft === undefined) return state;
      return fixSelection({ ...state, draft: prev, past: state.past.slice(0, -1), future: [state.draft, ...state.future], txn: undefined, revision: state.revision + 1, dirty: true });
    }
    case 'redo': {
      const next = state.future[0];
      if (next === undefined || state.draft === undefined) return state;
      return fixSelection({ ...state, draft: next, past: [...state.past, state.draft], future: state.future.slice(1), txn: undefined, revision: state.revision + 1, dirty: true });
    }
  }
  const d = state.draft;
  if (d === undefined) return state;
  switch (action.type) {
    case 'updateProject':
      return commit(state, applyPatch(d, action.patch));
    case 'updateConfig':
      return commit(state, { ...d, config: applyPatch(d.config, action.patch) });
    case 'updateBuilding': {
      const building = applyPatch(d.config.building ?? {}, action.patch);
      return commit(state, { ...d, config: Object.keys(building).length === 0 ? omit(d.config, 'building') : { ...d.config, building } });
    }
    case 'updateWall':
      return commit(state, mapWall(d, action.wallId, (w) => applyPatch(w, action.patch)));
    case 'renameWall': {
      const newId = action.newId.trim();
      if (newId === '' || newId === action.wallId || !isIdFree(d, newId, 'wall')) return state;
      return commit(reselect(state, action.wallId, newId), mapWall(d, action.wallId, (w) => ({ ...w, id: newId })));
    }
    case 'moveEndpoint': {
      const w = d.walls.find((x) => x.id === action.wallId);
      if (w === undefined || w.start === undefined || w.end === undefined) return state;
      const start = action.end === 'start' ? action.point : w.start;
      const end = action.end === 'end' ? action.point : w.end;
      if (Math.hypot(end.x - start.x, end.y - start.y) < MIN_WALL_LENGTH) return state;
      let moved: DraftWall = { ...w, start, end };
      if (action.end === 'start') {
        // Deslocamento do start projetado no eixo antigo: aberturas e studs extras ficam no lugar em planta.
        const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
        if (len > 0) {
          const ux = (w.end.x - w.start.x) / len;
          const uy = (w.end.y - w.start.y) / len;
          const delta = (start.x - w.start.x) * ux + (start.y - w.start.y) * uy;
          moved = shiftAlong(moved, -delta);
        }
      }
      return commit(state, mapWall(d, action.wallId, () => moved), action.txn);
    }
    case 'setWallLength': {
      const w = d.walls.find((x) => x.id === action.wallId);
      if (w === undefined || !(action.length >= MIN_WALL_LENGTH)) return state;
      if (!isPlanWall(w)) return commit(state, mapWall(d, action.wallId, () => ({ ...w, length: action.length })));
      if (w.start === undefined || w.end === undefined) return state;
      const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
      if (len === 0) return state;
      const end = { x: w.start.x + ((w.end.x - w.start.x) / len) * action.length, y: w.start.y + ((w.end.y - w.start.y) / len) * action.length };
      return commit(state, mapWall(d, action.wallId, () => ({ ...w, end: round(end) })));
    }
    case 'addWall': {
      const ref = d.walls.find((x) => x.id === action.afterWallId) ?? d.walls[d.walls.length - 1];
      const id = nextWallId(d);
      const wall: DraftWall = { id, openings: [] };
      if (ref !== undefined) {
        if (ref.height !== undefined) wall.height = ref.height;
        if (ref.section !== undefined) wall.section = ref.section;
        if (ref.exterior !== undefined) wall.exterior = ref.exterior;
        if (ref.bearing !== undefined) wall.bearing = ref.bearing;
        if (ref.level !== undefined) wall.level = ref.level;
        if (ref.floorsSupported !== undefined) wall.floorsSupported = ref.floorsSupported;
        if (ref.floorSpan !== undefined) wall.floorSpan = ref.floorSpan;
      } else {
        wall.section = '2x4';
        wall.exterior = false;
        wall.bearing = false;
        const precut = d.config.studLength?.[0];
        if (precut !== undefined) wall.height = precut + 3 * (d.config.plateThickness ?? 1.5);
      }
      const plan = ref === undefined ? d.walls.length === 0 || isPlanWall(d.walls[0]!) : isPlanWall(ref);
      if (plan) {
        if (ref?.start !== undefined && ref.end !== undefined) {
          // Continua da ponta end, virando 90° à esquerda (sentido anti-horário em planta).
          const len = Math.hypot(ref.end.x - ref.start.x, ref.end.y - ref.start.y) || 1;
          const ux = (ref.end.x - ref.start.x) / len;
          const uy = (ref.end.y - ref.start.y) / len;
          wall.start = ref.end;
          wall.end = round({ x: ref.end.x - uy * NEW_WALL_LENGTH, y: ref.end.y + ux * NEW_WALL_LENGTH });
        } else {
          wall.start = { x: 0, y: 0 };
          wall.end = { x: NEW_WALL_LENGTH, y: 0 };
        }
      } else {
        wall.length = NEW_WALL_LENGTH;
      }
      const at = ref === undefined ? d.walls.length : d.walls.indexOf(ref) + 1;
      const walls = [...d.walls.slice(0, at), wall, ...d.walls.slice(at)];
      return { ...commit(state, { ...d, walls }), selection: { kind: 'wall', wallId: id } };
    }
    case 'removeWall': {
      if (!d.walls.some((w) => w.id === action.wallId)) return state;
      return commit(state, { ...d, walls: d.walls.filter((w) => w.id !== action.wallId) });
    }
    case 'addOpening': {
      const w = d.walls.find((x) => x.id === action.wallId);
      if (w === undefined) return state;
      const id = nextOpeningId(d, w.id);
      const length = w.length ?? (w.start !== undefined && w.end !== undefined ? Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) : undefined);
      const mid = length === undefined ? 48 : length / 2;
      const firstTag = Object.keys(d.config.openingTypes ?? {})[0];
      const opening: DraftOpening =
        firstTag !== undefined
          ? { id, tag: firstTag, center: round1(mid) }
          : { id, type: 'window', offset: round1(Math.max(0, mid - NEW_OPENING.roughWidth / 2)), ...NEW_OPENING };
      const next = commit(state, mapWall(d, w.id, (x) => ({ ...x, openings: [...x.openings, opening] })));
      return { ...next, selection: { kind: 'opening', wallId: w.id, openingId: id } };
    }
    case 'removeOpening': {
      const w = d.walls.find((x) => x.id === action.wallId);
      if (w === undefined || !w.openings.some((o) => o.id === action.openingId)) return state;
      return commit(state, mapWall(d, action.wallId, (x) => ({ ...x, openings: x.openings.filter((o) => o.id !== action.openingId) })));
    }
    case 'updateOpening':
      return commit(state, mapOpening(d, action.wallId, action.openingId, (o) => applyPatch(o, action.patch)));
    case 'renameOpening': {
      const newId = action.newId.trim();
      if (newId === '' || newId === action.openingId || !isIdFree(d, newId, 'opening')) return state;
      const sel = state.selection;
      const reselected: EditorState =
        sel.kind === 'opening' && sel.openingId === action.openingId ? { ...state, selection: { kind: 'opening', wallId: action.wallId, openingId: newId } } : state;
      return commit(reselected, mapOpening(d, action.wallId, action.openingId, (o) => ({ ...o, id: newId })));
    }
    case 'moveOpening': {
      const s0 = Math.max(0, action.s0);
      return commit(
        state,
        mapOpening(d, action.wallId, action.openingId, (o) =>
          o.center !== undefined || o.offset === undefined ? { ...omit(o, 'offset'), center: round1(s0 + action.roughWidth / 2) } : { ...o, offset: round1(s0) },
        ),
        action.txn,
      );
    }
  }
  return state;
}

/**
 * Troca o draft registrando histórico. Com `txn` igual ao da transação aberta, substitui sem empilhar (um
 * arraste inteiro = um undo); qualquer outro commit fecha a transação.
 */
export function commit(state: EditorState, draft: ProjectDraft, txn?: string): EditorState {
  if (state.draft === undefined) return state;
  const coalesce = txn !== undefined && txn === state.txn;
  const past = coalesce ? state.past : [...state.past, state.draft].slice(-HISTORY_LIMIT);
  return fixSelection({ ...state, draft, past, future: coalesce ? state.future : [], txn, revision: state.revision + 1, dirty: true });
}

export const canUndo = (s: EditorState): boolean => s.past.length > 0;
export const canRedo = (s: EditorState): boolean => s.future.length > 0;

/** Aplica um patch: `undefined` apaga a chave; o resto substitui. */
export function applyPatch<T extends object>(obj: T, patch: Patch<NoInfer<T>>): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out as T;
}

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const out = { ...obj };
  delete out[key];
  return out;
}

function mapWall(d: ProjectDraft, wallId: string, f: (w: DraftWall) => DraftWall): ProjectDraft {
  return { ...d, walls: d.walls.map((w) => (w.id === wallId ? f(w) : w)) };
}

function mapOpening(d: ProjectDraft, wallId: string, openingId: string, f: (o: DraftOpening) => DraftOpening): ProjectDraft {
  return mapWall(d, wallId, (w) => ({ ...w, openings: w.openings.map((o) => (o.id === openingId ? f(o) : o)) }));
}

/** Desloca offsets, centros e studs extras ao longo do eixo (o `start` mudou de lugar). */
function shiftAlong(w: DraftWall, delta: number): DraftWall {
  if (delta === 0) return w;
  const openings = w.openings.map((o) => {
    const out = { ...o };
    if (out.center !== undefined) out.center = round1(out.center + delta);
    if (out.offset !== undefined) out.offset = round1(out.offset + delta);
    return out;
  });
  const next: DraftWall = { ...w, openings };
  if (w.extraStuds !== undefined) next.extraStuds = w.extraStuds.map((e) => (e.x === undefined ? e : { ...e, x: round1(e.x + delta) }));
  return next;
}

/** Arredonda a 1/16" (precisão da fábrica), evitando restos de ponto flutuante. */
function round1(n: number): number {
  return Math.round(n * 16) / 16;
}

function round(p: Point): Point {
  return { x: round1(p.x), y: round1(p.y) };
}

function reselect(state: EditorState, oldId: string, newId: string): EditorState {
  const s = state.selection;
  if (s.kind === 'wall' && s.wallId === oldId) return { ...state, selection: { kind: 'wall', wallId: newId } };
  if (s.kind === 'opening' && s.wallId === oldId) return { ...state, selection: { ...s, wallId: newId } };
  return state;
}

/** Seleção de peça que deixou de existir volta a nada (ou à parede, se só a abertura sumiu). */
function fixSelection(state: EditorState): EditorState {
  const { draft, selection } = state;
  if (draft === undefined || selection.kind === 'none' || selection.kind === 'project') return state;
  const wall = draft.walls.find((w) => w.id === selection.wallId);
  if (wall === undefined) return { ...state, selection: { kind: 'none' } };
  if (selection.kind === 'opening' && !wall.openings.some((o) => o.id === selection.openingId)) {
    return { ...state, selection: { kind: 'wall', wallId: wall.id } };
  }
  return state;
}
