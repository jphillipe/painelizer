// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { editorReducer, initialEditorState, type EditorState } from '@/lib/editor/state';
import { ProjectIOContext, type ProjectIO } from './editor-context';
import type { CheckState } from './use-project-check';
import { WallEditor } from './wall-editor';

vi.mock('../../_actions/apply-project-data', () => ({ applyProjectData: {} }));
vi.mock('../../_actions/check-project', () => ({ checkProject: {} }));
vi.mock('../../_actions/download-pdf', () => ({ downloadPdf: {} }));
vi.mock('next-safe-action/hooks', () => ({
  useAction: () => ({ execute: () => {}, executeAsync: async () => undefined, isPending: false }),
}));

afterEach(cleanup);

beforeAll(() => {
  // jsdom não tem matchMedia: tela larga (três painéis).
  window.matchMedia ??= ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

const io: ProjectIO = {
  outcome: undefined,
  onOutcome: () => {},
  pending: false,
  onGenerate: () => {},
  steps: null,
  onStartOver: () => {},
  sourceFiles: [],
  storedDrawings: [],
  storage: undefined,
  save: undefined,
  onRetrySave: undefined,
  saveActions: undefined,
};
const check: CheckState = { status: 'idle', result: undefined, revision: 0, stale: false };
const load = (s: EditorState, i: number): EditorState =>
  editorReducer(s, { type: 'load', text: EXAMPLES[i]!.text, source: 'sample' });

function Editor({ state, checked = check }: { state: EditorState; checked?: CheckState }) {
  return (
    <ProjectIOContext value={io}>
      <WallEditor state={state} dispatch={vi.fn()} check={checked} />
    </ProjectIOContext>
  );
}

const selectedTab = (): string | null =>
  document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? null;

/**
 * Correção da S30: o workspace remonta só quando outro projeto entra (`load`), não quando o draft muda de identidade.
 * Antes a chave vinha de `draft !== último draft visto` num ref mutado no render; quando o React reexecuta o reducer
 * (atualização rebaseada durante a hidratação ou uma transição), o mesmo `load` devolve um draft novo a cada render, o
 * workspace remontava a cada render e o editor caía em "Maximum update depth exceeded" (`/app?new=1` + exemplo).
 */
describe('WallEditor: remontagem do workspace', () => {
  it('draft novo da mesma carga (reducer reexecutado) não remonta; uma carga nova remonta', () => {
    const s = load(initialEditorState, 1);
    const { rerender } = render(<Editor state={s} />);
    act(() => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: /Issues/ }));
      fireEvent.click(screen.getByRole('tab', { name: /Issues/ }));
    });
    expect(selectedTab()).toMatch(/Issues/);
    // O mesmo `load` reaplicado ao estado de antes: conteúdo igual, objeto novo.
    const replayed = load(initialEditorState, 1);
    expect(replayed.draft).not.toBe(s.draft);
    rerender(<Editor state={{ ...replayed, revision: s.revision }} />);
    expect(selectedTab()).toMatch(/Issues/);
    // Outro projeto: o workspace volta ao início (aba Walls).
    rerender(<Editor state={load(s, 0)} />);
    expect(selectedTab()).toMatch(/Walls/);
  });
});

/**
 * S45: o erro de uma parede não esconde os avisos das outras. A checagem devolve os dois (`ok: false` com
 * `warnings`) e a lista mostra os dois; "Generate" continua bloqueado pelo erro.
 */
describe('WallEditor: avisos junto com erros (S45)', () => {
  const failed: CheckState = {
    status: 'done',
    revision: 0,
    stale: false,
    result: {
      ok: false,
      problems: [
        {
          source: 'engine',
          code: 'HEADER_OUT_OF_TABLE',
          message: 'x',
          wallId: 'W02',
          openingId: 'J2',
          stage: 'wall',
          params: { why: 'span' },
        },
      ],
      warnings: [
        {
          source: 'engine',
          code: 'FLAT_HEADER_CRIPPLES',
          message: 'y',
          panelId: '1-W03-P1',
          wallId: 'W03',
          openingId: 'P2',
          hypothesis: 'P55',
          params: { top: 83, gap: 24.125, topPlate: 107.125, max: 24 },
        },
      ],
    },
  };

  it('a lista de issues mostra o erro de uma parede e o aviso de outra; Generate continua bloqueado', () => {
    const s = load(initialEditorState, 1);
    render(<Editor state={{ ...s, revision: 0 }} checked={failed} />);
    act(() => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: /Issues/ }));
      fireEvent.click(screen.getByRole('tab', { name: /Issues/ }));
    });
    expect(screen.getByText('Header outside the IRC table — engineer required')).toBeTruthy();
    expect(screen.getByText('Flat header framed with cripples — factory to review')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Generate panels/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('na lista de paredes, a do erro conta 1 problema e a do aviso conta 1 aviso (cada issue na sua parede)', () => {
    const s = load(initialEditorState, 1);
    render(<Editor state={{ ...s, revision: 0 }} checked={failed} />);
    const row = (wallId: string): Element | undefined =>
      [...document.querySelectorAll('ul[aria-label="Walls"] > li')].find((li) => li.textContent?.includes(wallId));
    const has = (wallId: string, title: string): boolean => row(wallId)?.querySelector(`[title="${title}"]`) != null;
    expect(row('W02')).toBeDefined();
    expect([has('W02', '1 problem'), has('W02', '1 warning')]).toEqual([true, false]);
    expect([has('W03', '1 problem'), has('W03', '1 warning')]).toEqual([false, true]);
  });

  it('checagem com erro e sem a lista de avisos (arquivo que não abriu): só o erro, sem quebrar', () => {
    const s = load(initialEditorState, 1);
    const noWarnings: CheckState = {
      ...failed,
      result: { ok: false, problems: failed.result!.ok ? [] : failed.result!.problems },
    };
    render(<Editor state={{ ...s, revision: 0 }} checked={noWarnings} />);
    act(() => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: /Issues/ }));
      fireEvent.click(screen.getByRole('tab', { name: /Issues/ }));
    });
    expect(screen.getByText('Header outside the IRC table — engineer required')).toBeTruthy();
    expect(screen.queryByText('Flat header framed with cripples — factory to review')).toBeNull();
  });
});
