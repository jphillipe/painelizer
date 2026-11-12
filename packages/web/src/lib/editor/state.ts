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
  isReviewed,
  REVIEWED_KEY,
  isPlanWall,
  nextOpeningId,
  nextWallId,
  type DraftBuilding,
  type DraftConfig,
  type DraftHeaderEntry,
  type DraftWallType,
  type DraftOpening,
  type DraftOpeningType,
  type DraftProblem,
  type DraftWall,
  type Point,
  type ProjectDraft,
} from './draft';
import { extraDrawingsOf, PROJECT_DRAWINGS_KEY, type DrawingRef } from '../drawings';
import { inView, UNDERLAY_KEY, underlayOf, withoutView, type Underlay, type UnderlayView } from './underlay';
import { duplicateWalls, joinWalls, splitWall, type WallOp } from './wall-ops';

export type Selection =
  | { kind: 'none' }
  | { kind: 'project' }
  | { kind: 'wall'; wallId: string }
  /** Seleção múltipla (S30): duas ou mais paredes, na ordem em que entraram. Uma volta a `wall`. */
  | { kind: 'walls'; wallIds: string[] }
  | { kind: 'opening'; wallId: string; openingId: string };

/** Paredes da seleção: a parede, as paredes, ou a parede da abertura. */
export function selectedWallIds(s: Selection): string[] {
  if (s.kind === 'wall' || s.kind === 'opening') return [s.wallId];
  return s.kind === 'walls' ? s.wallIds : [];
}

/** Seleção das paredes dadas: nenhuma → `none`, uma → `wall`, mais → `walls` (sem repetição). */
export function wallsSelection(ids: readonly string[]): Selection {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { kind: 'none' };
  if (unique.length === 1) return { kind: 'wall', wallId: unique[0]! };
  return { kind: 'walls', wallIds: unique };
}

/** Shift/Ctrl+clique (S30): põe a parede na seleção, ou tira se já estava. Uma abertura selecionada conta como a parede dela. */
export function toggledWall(s: Selection, wallId: string): Selection {
  const ids = selectedWallIds(s);
  return wallsSelection(ids.includes(wallId) ? ids.filter((id) => id !== wallId) : [...ids, wallId]);
}

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
  /**
   * Campo a revelar no inspetor (S47), vindo do clique numa issue. Objeto novo a cada `select` com `focus` — o
   * workspace reage à identidade, então o mesmo clique repetido foca de novo; some em `select` sem `focus`.
   */
  focus?: { fieldIds: string[] } | undefined;
  past: ProjectDraft[];
  future: ProjectDraft[];
  /** Transação aberta (um arraste): commits com o mesmo id substituem o draft sem empilhar histórico. */
  txn: string | undefined;
  revision: number;
  /**
   * Cargas (`load`/`reset`) desde o início: a chave do workspace, que remonta só quando outro projeto entra. Contada
   * aqui, não pela identidade do draft: o React pode reexecutar o reducer (atualização rebaseada na hidratação ou numa
   * transição) e o mesmo `load` devolve um draft novo a cada vez — com a identidade como chave, o workspace remontava a
   * cada render ("Maximum update depth exceeded" ao abrir um exemplo logo depois de `/app?new=1`).
   */
  loads: number;
  /** Alguma edição desde a carga. */
  dirty: boolean;
  /** Opacidade/visibilidade do underlay (S23): estado de UI, fora do draft — não grava nem sobe `revision`. */
  underlayView?: UnderlayView;
}

/** Underlay do draft como a planta o mostra (com a vista do editor por cima). */
export function viewedUnderlay(state: Pick<EditorState, 'draft' | 'underlayView'>): Underlay | undefined {
  return state.draft === undefined ? undefined : inView(underlayOf(state.draft), state.underlayView);
}

export type EditorAction =
  /** `dirty` (M2): sessão retomada do navegador que já tinha edições — continua marcada como editada. */
  | { type: 'load'; text: string; source: DraftSource; dirty?: boolean }
  | { type: 'reset' }
  /** `focus` (S47): ids de DOM do campo que resolve a issue clicada, em ordem de preferência. */
  | { type: 'select'; selection: Selection; focus?: readonly string[] }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'endTransaction' }
  | { type: 'updateProject'; patch: Patch<Pick<ProjectDraft, 'name' | 'date' | 'revision' | 'northAngle'>> }
  | { type: 'updateConfig'; patch: Patch<Omit<DraftConfig, 'building' | 'openingTypes' | 'headerSchedule' | 'wallTypes' | 'extra'>> }
  | { type: 'updateBuilding'; patch: Patch<DraftBuilding> }
  | { type: 'updateWall'; wallId: string; patch: Patch<Omit<DraftWall, 'id' | 'openings' | 'extra'>> }
  | { type: 'renameWall'; wallId: string; newId: string }
  /** Move uma ponta; ao mover `start`, aberturas e studs extras ficam no lugar em planta (offsets deslocam). */
  | { type: 'moveEndpoint'; wallId: string; end: 'start' | 'end'; point: Point; txn?: string }
  /** Parede solta: `length`; em planta: move `end` ao longo do eixo. */
  | { type: 'setWallLength'; wallId: string; length: number }
  /**
   * Nova parede depois de `afterWallId` (ou no fim), copiando altura, seção, pavimento, papel e wall type; em planta, continua da
   * ponta `end` virando 90° — ou, com `segment` (S30: "Draw wall"), entre os dois pontos dados.
   */
  | { type: 'addWall'; afterWallId?: string | undefined; segment?: { start: Point; end: Point } }
  | { type: 'removeWall'; wallId: string }
  /** Seleção múltipla (S30): apaga, move ou edita campos comuns de várias paredes — um undo só. */
  | { type: 'removeWalls'; wallIds: readonly string[] }
  /** Paredes inteiras deslocadas (M5 nudge; S30 arraste do corpo); aberturas vão junto (offsets não mudam). Só em planta. */
  | { type: 'moveWalls'; wallIds: readonly string[]; dx: number; dy: number; txn?: string }
  | { type: 'updateWalls'; wallIds: readonly string[]; patch: Patch<Pick<DraftWall, 'height' | 'section' | 'exterior' | 'bearing' | 'level' | 'floorsSupported' | 'floorSpan' | 'wallType'>> }
  /** Cópias logo depois das originais, deslocadas na planta; a seleção passa às cópias (`wall-ops`). */
  | { type: 'duplicateWalls'; wallIds: readonly string[] }
  /** Divide em `at` (do `start`); os dois pedaços ficam selecionados. Recusa = estado igual (o inspetor diz por quê). */
  | { type: 'splitWall'; wallId: string; at: number }
  /** Junta duas colineares que se encostam; fica a primeira do arquivo, selecionada. */
  | { type: 'joinWalls'; wallIds: readonly [string, string] }
  /** Marca de revisão humana (M5): `$reviewed` no `extra` da parede — o CLI ignora chaves com `$`. */
  | { type: 'setReviewed'; wallId: string; reviewed: boolean }
  /** Planta do arquiteto por baixo (M6): imagem e calibração em `$underlay` na raiz; `undefined` remove. Undoável. */
  | { type: 'setUnderlay'; underlay: Underlay | undefined }
  /** S32: desenhos subidos ao Storage pelo editor (`$drawings` na raiz; projeto de arquivo ou sample). Undoável. */
  | { type: 'addDrawings'; drawings: readonly DrawingRef[] }
  /** Só opacidade/visibilidade do underlay: estado de UI (S23) — o draft, a revisão e o histórico não mudam. */
  | { type: 'setUnderlayView'; opacity?: number; visible?: boolean }
  /** `preset` (S21.4): id e tag que a leitura já tinha para uma abertura que ficou fora do projeto (sem posição). */
  | { type: 'addOpening'; wallId: string; preset?: { id?: string | undefined; tag?: string | undefined } }
  | { type: 'removeOpening'; wallId: string; openingId: string }
  | { type: 'updateOpening'; wallId: string; openingId: string; patch: Patch<Omit<DraftOpening, 'id' | 'extra'>> }
  | { type: 'renameOpening'; wallId: string; openingId: string; newId: string }
  /** Borda esquerda do RO em `s0` (do `start`); escreve `center` ou `offset` conforme a forma da abertura. */
  | { type: 'moveOpening'; wallId: string; openingId: string; s0: number; roughWidth: number; txn?: string }
  /** Quebras forçadas (S29): a lista inteira; `undefined` volta ao automático. Ordenada, a 1/16", sem repetição. */
  | { type: 'setPanelBreaks'; wallId: string; breaks: readonly number[] | undefined; txn?: string }
  /** Catálogo (S29): cria/substitui (`value`) ou apaga (`undefined`) um tipo de abertura ou marca de header. */
  | { type: 'setOpeningType'; tag: string; value: DraftOpeningType | undefined }
  | { type: 'setHeaderEntry'; mark: string; value: DraftHeaderEntry | undefined }
  /** Tipo de parede (S35): cria/substitui ou apaga a linha de `config.wallTypes`. */
  | { type: 'setWallType'; tag: string; value: DraftWallType | undefined }
  /** Renomeia a chave do catálogo na mesma posição e troca `tag`/`headerMark` das aberturas que a usavam. */
  | { type: 'renameOpeningType'; tag: string; newTag: string }
  | { type: 'renameHeaderEntry'; mark: string; newMark: string }
  /** Renomeia a tag do tipo na mesma posição e troca `wallType` das paredes que a usavam. */
  | { type: 'renameWallType'; tag: string; newTag: string };

export const HISTORY_LIMIT = 100;
export { isReviewed, REVIEWED_KEY };

export function reviewedCount(walls: readonly Pick<DraftWall, 'extra'>[]): number {
  return walls.filter(isReviewed).length;
}
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
  loads: 0,
  dirty: false,
};

/** Resultados já calculados, por estado de entrada e ação (os objetos), para `editorReducer` ser estável sob reaplicação. */
const replays = new WeakMap<EditorState, WeakMap<EditorAction, EditorState>>();

/**
 * O reducer do editor, **estável sob reaplicação**: o mesmo estado com a mesma ação (os mesmos objetos) devolve o mesmo
 * resultado, não um igual. O React reaplica as ações da fila quando rebaseia uma atualização (uma de prioridade menor
 * ficou para trás — atrás de uma transição de rota que ainda não terminou, por exemplo); sem isto, cada reaplicação do
 * `load` relia o texto e devolvia um draft novo, cada draft novo disparava os efeitos que dependem dele, que pediam outro
 * render, que reaplicava o `load` — "Maximum update depth exceeded" ao abrir um exemplo logo depois de `/app?new=1`
 * (correção da S30). Quem despacha cria um objeto de ação novo a cada vez, então fora da reaplicação nada muda.
 */
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  let byAction = replays.get(state);
  const known = byAction?.get(action);
  if (known !== undefined) return known;
  const next = reduce(state, action);
  if (byAction === undefined) {
    byAction = new WeakMap();
    replays.set(state, byAction);
  }
  byAction.set(action, next);
  return next;
}

function reduce(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load': {
      const load = draftFromText(action.text);
      if (!load.ok) {
        return { ...initialEditorState, loadError: load.problems.map((p) => p.text).join('; '), loadProblems: load.problems, source: action.source, revision: state.revision + 1, loads: state.loads + 1 };
      }
      return { ...initialEditorState, draft: load.draft, loadProblems: load.problems, source: action.source, revision: state.revision + 1, loads: state.loads + 1, dirty: action.dirty === true };
    }
    case 'reset':
      return { ...initialEditorState, revision: state.revision + 1, loads: state.loads + 1 };
    case 'select':
      return { ...state, selection: action.selection, txn: undefined, focus: Array.isArray(action.focus) ? { fieldIds: [...action.focus] } : undefined };
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
        // S35: a parede de referência pode só trazer a tag (seção, posição e carga vêm do tipo).
        if (ref.wallType !== undefined) wall.wallType = ref.wallType;
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
      const plan = action.segment !== undefined || (ref === undefined ? d.walls.length === 0 || isPlanWall(d.walls[0]!) : isPlanWall(ref));
      if (action.segment !== undefined) {
        const { start, end } = action.segment;
        if (Math.hypot(end.x - start.x, end.y - start.y) < MIN_WALL_LENGTH) return state;
        wall.start = round(start);
        wall.end = round(end);
      } else if (plan) {
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
    case 'removeWalls': {
      if (!d.walls.some((w) => action.wallIds.includes(w.id))) return state;
      return commit(state, { ...d, walls: d.walls.filter((w) => !action.wallIds.includes(w.id)) });
    }
    case 'moveWalls': {
      const { dx, dy } = action;
      const moving = d.walls.filter((w) => action.wallIds.includes(w.id) && w.start !== undefined && w.end !== undefined);
      if (moving.length === 0 || (dx === 0 && dy === 0)) return state;
      const walls = d.walls.map((w) => (moving.includes(w) ? { ...w, start: round({ x: w.start!.x + dx, y: w.start!.y + dy }), end: round({ x: w.end!.x + dx, y: w.end!.y + dy }) } : w));
      return commit(state, { ...d, walls }, action.txn);
    }
    case 'updateWalls': {
      if (!d.walls.some((w) => action.wallIds.includes(w.id))) return state;
      return commit(state, { ...d, walls: d.walls.map((w) => (action.wallIds.includes(w.id) ? applyPatch(w, action.patch) : w)) });
    }
    case 'duplicateWalls':
      return applyOp(state, duplicateWalls(d, action.wallIds));
    case 'splitWall':
      return applyOp(state, splitWall(d, action.wallId, action.at));
    case 'joinWalls':
      return applyOp(state, joinWalls(d, action.wallIds[0], action.wallIds[1]));
    case 'setUnderlay': {
      const extra = { ...(d.extra ?? {}) };
      const before = underlayOf(d);
      if (action.underlay === undefined) delete extra[UNDERLAY_KEY];
      else extra[UNDERLAY_KEY] = withoutView(action.underlay);
      const next = commit(state, Object.keys(extra).length === 0 ? omit(d, 'extra') : { ...d, extra });
      // Desenho novo (ou removido) volta à vista padrão; calibrar o mesmo desenho mantém a vista.
      return action.underlay === undefined || action.underlay.image !== before?.image ? omit(next, 'underlayView') : next;
    }
    case 'addDrawings': {
      if (action.drawings.length === 0) return state;
      const known = new Set(extraDrawingsOf(d.extra).map((x) => x.path));
      const added = action.drawings.filter((x) => !known.has(x.path));
      if (added.length === 0) return state;
      return commit(state, { ...d, extra: { ...(d.extra ?? {}), [PROJECT_DRAWINGS_KEY]: [...extraDrawingsOf(d.extra), ...added] } });
    }
    case 'setUnderlayView': {
      const current = viewedUnderlay(state);
      if (current === undefined) return state;
      const next = inView(current, action);
      if (next === undefined || (next.opacity === current.opacity && next.visible === current.visible)) return state;
      return { ...state, underlayView: { opacity: next.opacity, visible: next.visible } };
    }
    case 'setReviewed': {
      const w = d.walls.find((x) => x.id === action.wallId);
      if (w === undefined || isReviewed(w) === action.reviewed) return state;
      const extra = { ...(w.extra ?? {}) };
      if (action.reviewed) extra[REVIEWED_KEY] = true;
      else delete extra[REVIEWED_KEY];
      return commit(state, mapWall(d, action.wallId, (x) => (Object.keys(extra).length === 0 ? omit(x, 'extra') : { ...x, extra })));
    }
    case 'addOpening': {
      const w = d.walls.find((x) => x.id === action.wallId);
      if (w === undefined) return state;
      const preset = action.preset ?? {};
      const id = preset.id !== undefined && preset.id !== '' && isIdFree(d, preset.id, 'opening') ? preset.id : nextOpeningId(d, w.id);
      const length = w.length ?? (w.start !== undefined && w.end !== undefined ? Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) : undefined);
      const mid = length === undefined ? 48 : length / 2;
      const tags = Object.keys(d.config.openingTypes ?? {});
      const firstTag = preset.tag !== undefined && tags.includes(preset.tag) ? preset.tag : tags[0];
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
    case 'setPanelBreaks': {
      if (!d.walls.some((w) => w.id === action.wallId)) return state;
      const breaks = action.breaks === undefined ? undefined : [...new Set(action.breaks.map(round1))].sort((a, b) => a - b);
      return commit(state, mapWall(d, action.wallId, (w) => (breaks === undefined ? omit(w, 'panelBreaks') : { ...w, panelBreaks: breaks })), action.txn);
    }
    case 'setOpeningType':
      return commit(state, { ...d, config: withEntry(d.config, 'openingTypes', action.tag, action.value) });
    case 'setHeaderEntry':
      return commit(state, { ...d, config: withEntry(d.config, 'headerSchedule', action.mark, action.value) });
    case 'renameOpeningType': {
      const newTag = action.newTag.trim();
      const types = d.config.openingTypes;
      if (newTag === '' || newTag === action.tag || types?.[action.tag] === undefined || types[newTag] !== undefined) return state;
      const walls = d.walls.map((w) => ({ ...w, openings: w.openings.map((o) => (o.tag === action.tag ? { ...o, tag: newTag } : o)) }));
      return commit(state, { ...d, walls, config: { ...d.config, openingTypes: renameKey(types, action.tag, newTag) } });
    }
    case 'setWallType':
      return commit(state, { ...d, config: withEntry(d.config, 'wallTypes', action.tag, action.value) });
    case 'renameWallType': {
      const newTag = action.newTag.trim();
      const types = d.config.wallTypes;
      if (newTag === '' || newTag === action.tag || types?.[action.tag] === undefined || types[newTag] !== undefined) return state;
      const walls = d.walls.map((w) => (w.wallType === action.tag ? { ...w, wallType: newTag } : w));
      return commit(state, { ...d, walls, config: { ...d.config, wallTypes: renameKey(types, action.tag, newTag) } });
    }
    case 'renameHeaderEntry': {
      const newMark = action.newMark.trim();
      const schedule = d.config.headerSchedule;
      if (newMark === '' || newMark === action.mark || schedule?.[action.mark] === undefined || schedule[newMark] !== undefined) return state;
      const walls = d.walls.map((w) => ({ ...w, openings: w.openings.map((o) => (o.headerMark === action.mark ? { ...o, headerMark: newMark } : o)) }));
      return commit(state, { ...d, walls, config: { ...d.config, headerSchedule: renameKey(schedule, action.mark, newMark) } });
    }
  }
  return state;
}

/** Resultado de uma operação de parede: commit com as paredes resultantes selecionadas; recusa não muda nada. */
function applyOp(state: EditorState, op: WallOp): EditorState {
  return op.ok ? { ...commit(state, op.draft), selection: wallsSelection(op.wallIds) } : state;
}

/** Catálogo com a entrada trocada ou apagada; catálogo vazio sai do config. */
function withEntry<K extends 'openingTypes' | 'headerSchedule' | 'wallTypes'>(
  config: DraftConfig,
  key: K,
  name: string,
  value: NonNullable<DraftConfig[K]>[string] | undefined,
): DraftConfig {
  const name0 = name.trim();
  if (name0 === '') return config;
  const next = { ...(config[key] ?? {}) } as Record<string, unknown>;
  if (value === undefined) delete next[name0];
  else next[name0] = value;
  return Object.keys(next).length === 0 ? omit(config, key) : { ...config, [key]: next };
}

/** A chave `from` vira `to` na mesma posição (a ordem do catálogo é a do arquivo). */
function renameKey<T>(o: Record<string, T>, from: string, to: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(o)) out[k === from ? to : k] = v;
  return out;
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

/** Desloca offsets, centros, studs extras, posts, quebras forçadas e trechos de blocking ao longo do eixo (o `start` mudou de lugar). */
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
  // Posts (S37): ficam no lugar em planta, como os studs extras.
  if (w.posts !== undefined) next.posts = w.posts.map((p) => (p.x === undefined ? p : { ...p, x: round1(p.x + delta) }));
  if (w.panelBreaks !== undefined) next.panelBreaks = w.panelBreaks.map((x) => round1(x + delta));
  // Fileiras de blocking com trecho (S36): o trecho fica no lugar em planta, como os studs extras.
  if (w.blocking !== undefined) {
    next.blocking = w.blocking.map((e) =>
      typeof e === 'string'
        ? e
        : {
            ...e,
            ...(e.from === undefined ? {} : { from: round1(e.from + delta) }),
            ...(e.to === undefined ? {} : { to: round1(e.to + delta) }),
          },
    );
  }
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
  if (s.kind === 'walls') return { ...state, selection: { kind: 'walls', wallIds: s.wallIds.map((id) => (id === oldId ? newId : id)) } };
  if (s.kind === 'opening' && s.wallId === oldId) return { ...state, selection: { ...s, wallId: newId } };
  return state;
}

/** Seleção de peça que deixou de existir volta a nada (ou à parede, se só a abertura sumiu). */
function fixSelection(state: EditorState): EditorState {
  const { draft, selection } = state;
  if (draft === undefined || selection.kind === 'none' || selection.kind === 'project') return state;
  if (selection.kind === 'walls') {
    const kept = selection.wallIds.filter((id) => draft.walls.some((w) => w.id === id));
    return kept.length === selection.wallIds.length ? state : { ...state, selection: wallsSelection(kept) };
  }
  const wall = draft.walls.find((w) => w.id === selection.wallId);
  if (wall === undefined) return { ...state, selection: { kind: 'none' } };
  if (selection.kind === 'opening' && !wall.openings.some((o) => o.id === selection.openingId)) {
    return { ...state, selection: { kind: 'wall', wallId: wall.id } };
  }
  return state;
}
