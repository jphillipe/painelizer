// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'react';
import { ISSUE_TARGETS } from '@/lib/editor/issue-targets';
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

/**
 * S46: fora da aba Issues a contagem é por causa, e o que a fábrica resolve sozinha ("fine to leave") não acende
 * parede nem aparece no topo.
 */
describe('WallEditor: contagem por causa (S46)', () => {
  const headerOut = (wallId: string, openingId: string) => ({
    source: 'engine' as const,
    code: 'HEADER_OUT_OF_TABLE',
    message: 'x',
    wallId,
    openingId,
    stage: 'wall' as const,
    params: { why: 'span' },
  });
  const cripples = {
    source: 'engine' as const,
    code: 'FLAT_HEADER_CRIPPLES',
    message: 'y',
    panelId: '1-W03-P1',
    wallId: 'W03',
    openingId: 'P2',
    params: { top: 83, gap: 24.125, topPlate: 107.125, max: 24 },
  };
  const overlap = {
    source: 'engine' as const,
    code: 'STUDS_OVERLAP',
    message: 'z',
    panelId: '1-W04-P1',
    params: { overlap: 0.375 },
  };
  const row = (wallId: string): Element | undefined =>
    [...document.querySelectorAll('ul[aria-label="Walls"] > li')].find((li) => li.textContent?.includes(wallId));

  it('duas paredes com o mesmo erro são uma causa: selo 3, "1 to fix", e a parede do aviso "fine" não acende', () => {
    const failed: CheckState = {
      status: 'done',
      revision: 0,
      stale: false,
      result: { ok: false, problems: [headerOut('W01', 'J1'), headerOut('W02', 'J2')], warnings: [cripples, overlap] },
    };
    const s = load(initialEditorState, 1);
    render(<Editor state={{ ...s, revision: 0 }} checked={failed} />);
    expect(screen.getByRole('tab', { name: /Issues/ }).textContent).toBe('Issues3');
    expect(screen.getByText('1 to fix')).toBeTruthy();
    expect(row('W03')?.querySelector('[title="1 warning"]')).not.toBeNull();
    expect(row('W04')).toBeDefined();
    expect(row('W04')?.querySelector('[title="1 warning"]') ?? null).toBeNull();
  });

  it('só um aviso que a fábrica resolve: pronto para gerar, sem selo de aviso no topo, aba inicial Walls', () => {
    const fine: CheckState = {
      status: 'done',
      revision: 0,
      stale: false,
      result: { ok: true, projectName: 'x', panels: [], warnings: [overlap] },
    };
    const s = load(initialEditorState, 1);
    render(<Editor state={{ ...s, revision: 0 }} checked={fine} />);
    expect(selectedTab()).toMatch(/Walls/);
    expect(screen.getByText(/Ready ·/)).toBeTruthy();
    expect(screen.queryByText(/\d+ to review$/)).toBeNull();
    expect((screen.getByRole('button', { name: /Generate panels/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('tab', { name: /Issues/ }).textContent).toBe('Issues1');
  });
});

/**
 * S47: o clique numa issue leva ao campo que a resolve — seleciona a abertura, abre a seção e põe o cursor no campo.
 * Aqui o editor é de verdade (reducer), não um estado fixo: o clique precisa mudar a seleção.
 */
describe('WallEditor: clique que leva ao campo (S47)', () => {
  function Live({ initial, checked }: { initial: EditorState; checked: CheckState }) {
    const [state, dispatch] = useReducer(editorReducer, initial);
    return (
      <ProjectIOContext value={io}>
        <WallEditor state={state} dispatch={dispatch} check={checked} />
      </ProjectIOContext>
    );
  }
  const headerOut = (wallId: string, openingId: string) => ({
    source: 'engine' as const,
    code: 'HEADER_OUT_OF_TABLE',
    message: 'x',
    wallId,
    openingId,
    stage: 'wall' as const,
    params: { why: 'span' },
  });
  const overlap = {
    source: 'engine' as const,
    code: 'STUDS_OVERLAP',
    message: 'z',
    panelId: '1-W04-P1',
    params: { overlap: 0.375 },
  };
  const failed: CheckState = {
    status: 'done',
    revision: 0,
    stale: false,
    result: { ok: false, problems: [headerOut('W01', 'J1'), headerOut('W02', 'J2')], warnings: [overlap] },
  };
  const openIssues = (): void => {
    act(() => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: /Issues/ }));
      fireEvent.click(screen.getByRole('tab', { name: /Issues/ }));
    });
  };

  it('chip da abertura: seleciona, abre a seção do header e foca o campo "Header"; o mesmo clique de novo foca de novo', async () => {
    render(<Live initial={{ ...load(initialEditorState, 1), revision: 0 }} checked={failed} />);
    openIssues();
    fireEvent.click(screen.getByRole('button', { name: 'J2' }));
    await waitFor(() => expect(document.activeElement?.id).toBe('o-J2-hby'));
    expect(document.getElementById('o-J2-hby')!.closest('details')!.open).toBe(true);
    expect(document.getElementById('o-J2-hby')!.closest('[data-field]')!.hasAttribute('data-field-focus')).toBe(true);
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement?.id).not.toBe('o-J2-hby');
    fireEvent.click(screen.getByRole('button', { name: 'J2' }));
    await waitFor(() => expect(document.activeElement?.id).toBe('o-J2-hby'));
  });

  it('família sem campo que a resolva: só seleciona a parede, sem quebrar', async () => {
    render(<Live initial={{ ...load(initialEditorState, 1), revision: 0 }} checked={failed} />);
    openIssues();
    fireEvent.click(screen.getByText(/Fine to leave \(1\)/));
    fireEvent.click(screen.getByRole('button', { name: 'Studs overlap' }));
    await waitFor(() => expect(document.querySelector('aside[aria-label="Properties"]')?.textContent).toContain('W04'));
    expect(document.querySelector('[data-field-focus]')).toBeNull();
  });
});

/** S46 (revisão): a frase de lista parcial sai da própria checagem — problema + alguma parede montada + alguma não. */
describe('WallEditor: lista parcial (S46)', () => {
  const sentence = 'Walls with a problem are not framed yet — they may add warnings once fixed.';
  const problem = {
    source: 'engine' as const,
    code: 'HEADER_OUT_OF_TABLE',
    message: 'x',
    wallId: 'W02',
    openingId: 'J2',
    stage: 'wall' as const,
    params: { why: 'span' },
  };
  const framed = (wallId: string) => ({ wallId, breaks: [], candidates: [], manual: false });
  const notFramed = (wallId: string) => ({ wallId, candidates: [], manual: false });
  const show = (walls: { wallId: string; breaks?: number[]; candidates: number[]; manual: boolean }[]): void => {
    const failed: CheckState = {
      status: 'done',
      revision: 0,
      stale: false,
      result: { ok: false, problems: [problem], warnings: [], walls },
    };
    render(<Editor state={{ ...load(initialEditorState, 1), revision: 0 }} checked={failed} />);
    act(() => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: /Issues/ }));
      fireEvent.click(screen.getByRole('tab', { name: /Issues/ }));
    });
  };

  it('uma parede parou no erro e outra foi montada: a lista avisa que ainda podem surgir avisos', () => {
    show([notFramed('W02'), framed('W03')]);
    expect(screen.getByText(sentence)).toBeTruthy();
  });

  it('todas as paredes foram montadas (erro só na lista de materiais): a frase não aparece', () => {
    show([framed('W02'), framed('W03')]);
    expect(screen.queryByText(sentence)).toBeNull();
  });

  it('nenhuma parede foi montada: não há aviso nenhum a esperar de outra parede, a frase não aparece', () => {
    show([notFramed('W02'), notFramed('W03')]);
    expect(screen.queryByText(sentence)).toBeNull();
  });
});

/** S47 (revisão): os caminhos que a primeira versão não testava. */
describe('WallEditor: clique que leva ao campo — menu, projeto, seção fechada e ids (S47)', () => {
  function Live({ initial, checked }: { initial: EditorState; checked: CheckState }) {
    const [state, dispatch] = useReducer(editorReducer, initial);
    return (
      <ProjectIOContext value={io}>
        <WallEditor state={state} dispatch={dispatch} check={checked} />
      </ProjectIOContext>
    );
  }
  const base = (): EditorState => ({ ...load(initialEditorState, 1), revision: 0 });
  const done = (result: CheckState['result']): CheckState => ({ status: 'done', revision: 0, stale: false, result });
  const openIssues = (): void => {
    act(() => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: /Issues/ }));
      fireEvent.click(screen.getByRole('tab', { name: /Issues/ }));
    });
  };

  it('menu ⋯ → "Project settings" abre o diálogo (o evento do menu não vira "focus")', async () => {
    const user = userEvent.setup();
    render(<Live initial={base()} checked={check} />);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Project settings' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('issue de projeto: "Open project settings" abre o diálogo com o cursor no campo', async () => {
    const overweight = {
      source: 'engine' as const,
      code: 'PANEL_OVERWEIGHT',
      message: 'x',
      panelId: '1-W01-P1',
      params: {},
    };
    render(
      <Live initial={base()} checked={done({ ok: true, projectName: 'x', panels: [], warnings: [overweight] })} />,
    );
    openIssues();
    fireEvent.click(screen.getByRole('button', { name: 'Open project settings' }));
    await waitFor(() => expect(document.activeElement?.id).toBe('pn-weight'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('campo numa seção que nasce fechada ("Heights"): a seção abre', async () => {
    const tooHigh = (wallId: string, openingId: string) => ({
      source: 'engine' as const,
      code: 'HEADER_ABOVE_TOP_PLATE',
      message: 'x',
      wallId,
      openingId,
      stage: 'wall' as const,
      params: {},
    });
    render(
      <Live
        initial={base()}
        checked={done({ ok: false, problems: [tooHigh('W01', 'J1'), tooHigh('W02', 'J3')], warnings: [] })}
      />,
    );
    openIssues();
    fireEvent.click(screen.getByRole('button', { name: 'J3' }));
    await waitFor(() => expect(document.activeElement?.id).toBe('o-J3-hh'));
    const section = document.getElementById('o-J3-hh')!.closest('details')!;
    expect(section.querySelector('summary')?.textContent).toContain('Heights');
    expect(section.open).toBe(true);
  });

  it('contrato: todo alvo do mapa existe na tela (parede, abertura sem tag, configurações)', async () => {
    const ids = (scope: string): string[][] =>
      Object.values(ISSUE_TARGETS)
        .filter((t) => t.scope === scope)
        .map((t) => [...t.fields]);
    const missing = (prefix: string, groups: string[][]): string[] =>
      groups
        .filter((fields) => !fields.some((f) => document.getElementById(prefix + f) !== null))
        .map((fields) => fields.join('|'));

    const wall = render(<Editor state={{ ...base(), selection: { kind: 'wall', wallId: 'W01' } }} />);
    expect(missing('w-W01-', ids('wall'))).toEqual([]);
    wall.unmount();

    const opening = render(
      <Editor state={{ ...base(), selection: { kind: 'opening', wallId: 'W01', openingId: 'J1' } }} />,
    );
    expect(missing('o-J1-', ids('opening'))).toEqual([]);
    opening.unmount();

    render(<Editor state={{ ...base(), selection: { kind: 'project' } }} />);
    await screen.findByRole('dialog');
    expect(missing('', ids('project'))).toEqual([]);
  });
});

/** S49: o conserto em grupo aplica a mesma edição a todas as aberturas da linha, num passo só de desfazer. */
describe('WallEditor: conserto em grupo (S49)', () => {
  function Live({ initial, checked }: { initial: EditorState; checked: CheckState }) {
    const [state, dispatch] = useReducer(editorReducer, initial);
    const openings =
      state.draft?.walls.flatMap((w) =>
        w.openings.map((o) => ({ id: o.id, header: o.header, headerMark: o.headerMark, headerHeight: o.headerHeight })),
      ) ?? [];
    return (
      <ProjectIOContext value={io}>
        <WallEditor state={state} dispatch={dispatch} check={checked} />
        <output data-testid="openings">{JSON.stringify(openings)}</output>
        <button type="button" onClick={() => dispatch({ type: 'undo' })}>
          test-undo
        </button>
      </ProjectIOContext>
    );
  }
  const base = (): EditorState => ({ ...load(initialEditorState, 1), revision: 0 });
  const openingsNow = (): {
    id: string;
    header?: { section?: unknown; plies?: number; jackStuds?: number };
    headerHeight?: number;
  }[] => JSON.parse(screen.getByTestId('openings').textContent ?? '[]');
  const headerOf = (id: string) => openingsNow().find((o) => o.id === id)?.header;
  const openIssues = (): void => {
    act(() => {
      fireEvent.mouseDown(screen.getByRole('tab', { name: /Issues/ }));
      fireEvent.click(screen.getByRole('tab', { name: /Issues/ }));
    });
  };
  const headerOut = (wallId: string, openingId: string) => ({
    source: 'engine' as const,
    code: 'HEADER_OUT_OF_TABLE',
    message: 'x',
    wallId,
    openingId,
    stage: 'wall' as const,
    params: { why: 'width', width: 600 },
  });

  it('"Set header": seção inválida não aplica; válida vai para as duas aberturas; um undo desfaz as duas', async () => {
    const user = userEvent.setup();
    const failed: CheckState = {
      status: 'done',
      revision: 0,
      stale: false,
      result: { ok: false, problems: [headerOut('W01', 'J1'), headerOut('W02', 'J3')], warnings: [] },
    };
    render(<Live initial={base()} checked={failed} />);
    openIssues();
    const before = [headerOf('J1'), headerOf('J3')];
    await user.click(screen.getByRole('button', { name: 'Set header…' }));
    await user.type(screen.getByLabelText('Header section'), '2x13');
    await user.clear(screen.getByLabelText('Plies'));
    await user.type(screen.getByLabelText('Plies'), '3');
    await user.click(screen.getByRole('button', { name: 'Apply to all 2 openings' }));
    expect(screen.getByRole('alert').textContent).toMatch(/2x4|LVL/);
    expect([headerOf('J1'), headerOf('J3')]).toEqual(before);

    await user.clear(screen.getByLabelText('Header section'));
    await user.type(screen.getByLabelText('Header section'), '2x12');
    await user.click(screen.getByRole('button', { name: 'Apply to all 2 openings' }));
    expect(headerOf('J1')).toEqual({ section: '2x12', plies: 3 });
    expect(headerOf('J3')).toEqual({ section: '2x12', plies: 3 });
    expect(screen.queryByLabelText('Header section')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'test-undo' }));
    expect([headerOf('J1'), headerOf('J3')]).toEqual(before);
  });

  it('altura de porta: os dois botões dizem a medida; o que muda o framing diz isso e sobe o topo do RO', async () => {
    const user = userEvent.setup();
    const mismatch = (wallId: string, openingId: string) => ({
      source: 'engine' as const,
      code: 'DOOR_RO_HEIGHT_MISMATCH',
      message: 'x',
      panelId: '1-' + wallId + '-P1',
      wallId,
      openingId,
      params: { roughHeight: 82.5, headerBase: 81.5 },
    });
    const warned: CheckState = {
      status: 'done',
      revision: 0,
      stale: false,
      result: { ok: true, projectName: 'x', panels: [], warnings: [mismatch('W01', 'P1'), mismatch('W03', 'P2')] },
    };
    render(<Live initial={base()} checked={warned} />);
    openIssues();
    expect(screen.getByRole('button', { name: 'Use 6\'-9 1/2" as the door RO height' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Set the header at 6\'-10 1/2" (changes framing)' }));
    expect(
      openingsNow()
        .filter((o) => o.id === 'P1' || o.id === 'P2')
        .map((o) => o.headerHeight),
    ).toEqual([82.5, 82.5]);
  });
});

/** S50: marcar um aviso como revisado tira a linha do trabalho, apaga a parede e libera o topo; desfaz com "Undo review". */
describe('WallEditor: marcar como revisado (S50)', () => {
  function Live({ initial, checked }: { initial: EditorState; checked: CheckState }) {
    const [state, dispatch] = useReducer(editorReducer, initial);
    return (
      <ProjectIOContext value={io}>
        <WallEditor state={state} dispatch={dispatch} check={checked} />
        <output data-testid="reviewed">{JSON.stringify(state.draft?.extra?.['$reviewedIssues'] ?? [])}</output>
      </ProjectIOContext>
    );
  }
  const cripples = {
    source: 'engine' as const,
    code: 'FLAT_HEADER_CRIPPLES',
    message: 'y',
    panelId: '1-W03-P1',
    wallId: 'W03',
    openingId: 'P2',
    params: { top: 83, gap: 24.125, topPlate: 107.125, max: 24 },
  };
  const ok: CheckState = {
    status: 'done',
    revision: 0,
    stale: false,
    result: { ok: true, projectName: 'x', panels: [], warnings: [cripples] },
  };
  const row = (wallId: string): Element | undefined =>
    [...document.querySelectorAll('ul[aria-label="Walls"] > li')].find((li) => li.textContent?.includes(wallId));

  it('marca: a linha vai para "Reviewed (1)", o selo zera, a parede apaga, o topo fica só "Ready"; desmarca: volta', async () => {
    const user = userEvent.setup();
    render(<Live initial={{ ...load(initialEditorState, 1), revision: 0 }} checked={ok} />);
    expect(row('W03')?.querySelector('[title="1 warning"]')).not.toBeNull();
    expect(screen.getAllByText('1 to review').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: /Issues/ }));
    expect(screen.getByRole('tab', { name: /Issues/ }).textContent).toBe('Issues1');
    await user.click(screen.getByRole('button', { name: 'Mark as reviewed' }));

    expect(screen.getByRole('tab', { name: /Issues/ }).textContent).toBe('Issues0');
    expect(screen.getByText('Reviewed (1)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark as reviewed' })).toBeNull();
    expect(JSON.parse(screen.getByTestId('reviewed').textContent ?? '[]')).toHaveLength(1);
    expect(screen.queryAllByText('1 to review')).toHaveLength(0);
    expect(screen.getByText(/Ready ·/)).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: /Walls/ }));
    expect(row('W03')?.querySelector('[title="1 warning"]') ?? null).toBeNull();

    await user.click(screen.getByRole('tab', { name: /Issues/ }));
    await user.click(screen.getByText('Reviewed (1)'));
    await user.click(screen.getByRole('button', { name: 'Undo review' }));
    expect(JSON.parse(screen.getByTestId('reviewed').textContent ?? '[]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Mark as reviewed' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Issues/ }).textContent).toBe('Issues1');
  });
});
