// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupIssues, type IssueGroup } from '@/lib/editor/issue-groups';
import { issueFromNotice, type IdIndex, type Issue } from '@/lib/editor/problems';
import type { DraftEdit } from '@/lib/editor/state';
import type { SuggestResult } from '@/types/panels';
import { IssueGroupsList } from './issue-groups-list';

afterEach(cleanup);

const ids: IdIndex = {
  walls: ['I1', 'I2'],
  openings: new Map([
    ['I1', ['I1-A']],
    ['I2', ['I2-B']],
  ]),
};
const mismatch = (wallId: string, openingId: string): Issue =>
  issueFromNotice(
    {
      source: 'engine',
      code: 'DOOR_RO_HEIGHT_MISMATCH',
      message: 'x',
      wallId,
      openingId,
      params: { roughHeight: 82.5, headerBase: 81.5 },
    },
    'warning',
    ids,
  );
const overlap = issueFromNotice(
  { source: 'engine', code: 'STUDS_OVERLAP', message: 'x', panelId: '1-I1-P1', params: { overlap: 0.375 } },
  'warning',
  ids,
);
const edits: DraftEdit[] = [{ target: 'openingType', tag: 'A', patch: { roughHeight: 81.5 } }];
const proposal: Extract<SuggestResult, { ok: true }> = {
  ok: true,
  explanation: 'The door rough opening is 1" taller than the header base.',
  confidence: 'medium',
  needsFromHuman: '',
  edits,
  lines: ['Opening type A: RO height → 6\'-9 1/2"'],
  rejected: [],
  structural: false,
  effect: { before: 2, after: 0, newProblems: [], grownProblems: [], newWarnings: [] },
};

function show(onSuggest: () => Promise<SuggestResult>, extra: { stale?: boolean; issues?: Issue[] } = {}) {
  const onApplyEdits = vi.fn();
  const suggest = vi.fn<(group: IssueGroup) => Promise<SuggestResult>>(onSuggest);
  render(
    <IssueGroupsList
      groups={groupIssues(extra.issues ?? [mismatch('I1', 'I1-A'), mismatch('I2', 'I2-B')], ids)}
      stale={extra.stale ?? false}
      checking={false}
      selection={{ kind: 'none' }}
      onSelect={() => {}}
      onAction={() => {}}
      onApplyEdits={onApplyEdits}
      onSuggest={suggest}
    />,
  );
  return { onApplyEdits, suggest };
}

/** S51: "Suggest a fix" — a IA propõe, o cartão mostra o efeito medido, e só o clique em "Apply" edita. */
describe('IssueGroupsList — sugestão por IA (S51)', () => {
  it('clique → espera → cartão com explicação, edições e efeito; "Apply" entrega as edições e fecha o cartão', async () => {
    const user = userEvent.setup();
    let answer: (r: SuggestResult) => void = () => {};
    const { onApplyEdits, suggest } = show(() => new Promise<SuggestResult>((resolve) => (answer = resolve)));
    await user.click(screen.getByRole('button', { name: 'Suggest a fix' }));
    expect(screen.getByText('Asking the AI…')).toBeTruthy();
    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest.mock.calls[0]![0]).toMatchObject({ family: 'DOOR_RO_HEIGHT_MISMATCH', count: 2 });
    expect(onApplyEdits).not.toHaveBeenCalled();
    answer(proposal);
    const card = await screen.findByRole('region', { name: 'AI suggestion' });
    expect(card.textContent).toContain('medium confidence');
    expect(card.textContent).toContain('The door rough opening is 1" taller than the header base.');
    expect(card.textContent).toContain('Opening type A: RO height → 6\'-9 1/2"');
    expect(card.textContent).toContain('Engine check: 2 → 0 here');
    expect(card.textContent).toContain('No new problems');
    expect(card.textContent).not.toContain('confirm with the engineer');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApplyEdits).toHaveBeenCalledWith(edits);
    expect(screen.queryByRole('region', { name: 'AI suggestion' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Suggest a fix' })).toBeTruthy();
  });

  it('"Dismiss" fecha sem editar', async () => {
    const user = userEvent.setup();
    const { onApplyEdits } = show(async () => proposal);
    await user.click(screen.getByRole('button', { name: 'Suggest a fix' }));
    await screen.findByRole('region', { name: 'AI suggestion' });
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onApplyEdits).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'AI suggestion' })).toBeNull();
  });

  it('sem edições: diz o que falta e não oferece "Apply"', async () => {
    const user = userEvent.setup();
    const nothing: SuggestResult = {
      ok: true,
      explanation: 'The header has to come from the engineer.',
      confidence: 'low',
      needsFromHuman: 'The header from the structural framing plan (SA1.2).',
      edits: [],
      lines: [],
      rejected: [],
      structural: false,
    };
    show(async () => nothing);
    await user.click(screen.getByRole('button', { name: 'Suggest a fix' }));
    const card = await screen.findByRole('region', { name: 'AI suggestion' });
    expect(card.textContent).toContain('No edit proposed');
    expect(card.textContent).toContain('The header from the structural framing plan (SA1.2).');
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('problema novo, valor estrutural e edições descartadas aparecem como avisos antes do "Apply"', async () => {
    const user = userEvent.setup();
    show(async () => ({
      ...proposal,
      structural: true,
      rejected: ['opening NOPE (wall I9): not in the project'],
      effect: {
        before: 2,
        after: 0,
        newProblems: ['Project header thicker than the wall'],
        grownProblems: [],
        newWarnings: ['Studs overlap'],
      },
    }));
    await user.click(screen.getByRole('button', { name: 'Suggest a fix' }));
    const card = await screen.findByRole('region', { name: 'AI suggestion' });
    expect(card.textContent).toContain('Adds a new problem: Project header thicker than the wall');
    expect(card.textContent).toContain('New warning: Studs overlap');
    expect(card.textContent).toContain('Structural value — confirm with the engineer');
    expect(card.textContent).toContain('1 edit from the AI was discarded');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
  });

  it('falha (resposta de erro ou exceção) vira uma frase, com "Try again"; a lista continua inteira', async () => {
    const user = userEvent.setup();
    let calls = 0;
    show(async () => {
      calls += 1;
      if (calls === 1) return { ok: false, message: 'The AI is busy right now. Try again in a minute.' };
      throw new Error('network');
    });
    await user.click(screen.getByRole('button', { name: 'Suggest a fix' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The AI is busy right now.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The AI suggestion failed. Try again.');
    expect(screen.getByText('Door RO height differs from the header height')).toBeTruthy();
  });

  it('sem botão em "Fine to leave", nem quando a lista não recebe `onSuggest`; desligado com a checagem atrasada', async () => {
    show(async () => proposal, { issues: [overlap] });
    expect(screen.queryByRole('button', { name: 'Suggest a fix' })).toBeNull();
    cleanup();
    show(async () => proposal, { stale: true });
    expect((screen.getByRole('button', { name: 'Suggest a fix' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    render(
      <IssueGroupsList
        groups={groupIssues([mismatch('I1', 'I1-A')], ids)}
        stale={false}
        checking={false}
        selection={{ kind: 'none' }}
        onSelect={() => {}}
        onAction={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Suggest a fix' })).toBeNull();
  });
});

/** S51 (revisão): o cartão não deixa aplicar às cegas. */
describe('IssueGroupsList — sugestão por IA: proteções (revisão da S51)', () => {
  const groups = groupIssues([mismatch('I1', 'I1-A'), mismatch('I2', 'I2-B')], ids);
  const list = (onSuggest: () => Promise<SuggestResult>, onApplyEdits: (e: DraftEdit[]) => void, revision: number) => (
    <IssueGroupsList
      groups={groups}
      stale={false}
      checking={false}
      selection={{ kind: 'none' }}
      onSelect={() => {}}
      onAction={() => {}}
      onApplyEdits={onApplyEdits}
      onSuggest={onSuggest}
      revision={revision}
    />
  );

  it('limpeza que chega como null é aplicada como "apagar o campo"', async () => {
    const user = userEvent.setup();
    const onApplyEdits = vi.fn();
    const clear: SuggestResult = {
      ...proposal,
      edits: [{ target: 'opening', wallId: 'I1', openingId: 'I1-A', patch: { headerHeight: null } }],
    } as SuggestResult;
    render(list(async () => clear, onApplyEdits, 1));
    await user.click(screen.getByRole('button', { name: 'Suggest a fix' }));
    await user.click(await screen.findByRole('button', { name: 'Apply' }));
    expect(onApplyEdits.mock.calls[0]![0]).toStrictEqual([
      { target: 'opening', wallId: 'I1', openingId: 'I1-A', patch: { headerHeight: undefined } },
    ]);
  });

  it('valor estrutural: "Apply" só liga depois de marcar que conferiu com o engenheiro', async () => {
    const user = userEvent.setup();
    const onApplyEdits = vi.fn();
    render(list(async () => ({ ...proposal, structural: true }) as SuggestResult, onApplyEdits, 1));
    await user.click(screen.getByRole('button', { name: 'Suggest a fix' }));
    const apply = (await screen.findByRole('button', { name: 'Apply' })) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /checked these values with the engineer/ }));
    expect(apply.disabled).toBe(false);
    await user.click(apply);
    expect(onApplyEdits).toHaveBeenCalledTimes(1);
  });

  it('o projeto mudou depois do pedido: o cartão avisa e não deixa aplicar', async () => {
    const user = userEvent.setup();
    const onApplyEdits = vi.fn();
    let answer: (r: SuggestResult) => void = () => {};
    const onSuggest = () => new Promise<SuggestResult>((resolve) => (answer = resolve));
    const view = render(list(onSuggest, onApplyEdits, 1));
    await user.click(screen.getByRole('button', { name: 'Suggest a fix' }));
    view.rerender(list(onSuggest, onApplyEdits, 2));
    answer(proposal);
    const card = await screen.findByRole('region', { name: 'AI suggestion' });
    expect(card.textContent).toContain('The project changed since this was computed');
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Ask again' })).toBeTruthy();
  });

  it('piora de um problema que já existia e causa não resolvida aparecem no cartão; sem ocorrência antes, não diz "resolved"', async () => {
    const user = userEvent.setup();
    const worse: SuggestResult = {
      ...proposal,
      effect: {
        before: 2,
        after: 2,
        newProblems: [],
        grownProblems: ['Header outside the IRC table — engineer required (2 → 3)'],
        newWarnings: [],
      },
    } as SuggestResult;
    const view = render(list(async () => worse, vi.fn(), 1));
    await user.click(screen.getByRole('button', { name: 'Suggest a fix' }));
    const card = await screen.findByRole('region', { name: 'AI suggestion' });
    expect(card.textContent).toContain('Engine check: 2 → 2 here (not resolved)');
    expect(card.textContent).toContain(
      'Makes an existing problem worse: Header outside the IRC table — engineer required (2 → 3)',
    );
    expect(card.textContent).not.toContain('No new problems');
    view.unmount();
    const none: SuggestResult = {
      ...proposal,
      effect: { before: 0, after: 0, newProblems: [], grownProblems: [], newWarnings: [] },
    } as SuggestResult;
    render(list(async () => none, vi.fn(), 1));
    await user.click(screen.getByRole('button', { name: 'Suggest a fix' }));
    const second = await screen.findByRole('region', { name: 'AI suggestion' });
    expect(second.textContent).not.toContain('resolved');
  });
});
