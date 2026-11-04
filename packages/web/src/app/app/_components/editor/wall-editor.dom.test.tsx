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

function Editor({ state }: { state: EditorState }) {
  return (
    <ProjectIOContext value={io}>
      <WallEditor state={state} dispatch={vi.fn()} check={check} />
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
