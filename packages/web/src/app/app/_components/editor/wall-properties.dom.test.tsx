// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DraftWall, ProjectDraft } from '@/lib/editor/draft';
import { WallProperties } from './wall-properties';

afterEach(cleanup);

const wall = (extra: Partial<DraftWall> = {}): DraftWall => ({
  id: 'W01',
  length: 144,
  height: 97.125,
  section: '2x4',
  exterior: false,
  bearing: false,
  openings: [],
  ...extra,
});

const draftWith = (w: DraftWall): ProjectDraft => ({
  config: { studSpacing: 16, studLength: [92.625], wallTypes: { 'WT-4': { section: '2x4', blocking: ['kitchen-base'] } } },
  walls: [w],
});

const renderWall = (w: DraftWall) => {
  const dispatch = vi.fn();
  render(<WallProperties draft={draftWith(w)} wall={w} provenance={undefined} issues={[]} dispatch={dispatch} onSelect={() => {}} />);
  return dispatch;
};

/** S36: seção "Blocking" do inspetor da parede. */
describe('WallProperties — Blocking (S36)', () => {
  it('lista presets pelo nome e fileiras com centro, trecho e uso; remover tira o item', async () => {
    const dispatch = renderWall(wall({ blocking: ['bath-towel', { y: 54, from: 96, label: 'Rail' }] }));
    expect(screen.getByText('Blocking (2)')).toBeTruthy();
    expect(screen.getByText(/Towel bar · 4'-0"/)).toBeTruthy();
    expect((document.getElementById('w-W01-bk-1-l') as HTMLInputElement).value).toBe('Rail');
    await userEvent.click(screen.getByRole('button', { name: 'Remove blocking row 1' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'updateWall', wallId: 'W01', patch: { blocking: [{ y: 54, from: 96, label: 'Rail' }] } });
  });

  it('"Add row" acrescenta uma fileira a 36"', async () => {
    const dispatch = renderWall(wall());
    expect(screen.getByText('Blocking (0)')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Add row/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'updateWall', wallId: 'W01', patch: { blocking: [{ y: 36 }] } });
  });

  it('sem lista própria mostra a do tipo; editar copia, "None" grava []', async () => {
    const dispatch = renderWall(wall({ wallType: 'WT-4' }));
    expect(screen.getByText(/From wall type WT-4: Base cabinets \/ countertop · 3'-0"/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Edit for this wall' }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'updateWall', wallId: 'W01', patch: { blocking: ['kitchen-base'] } });
    await userEvent.click(screen.getByRole('button', { name: 'None on this wall' }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'updateWall', wallId: 'W01', patch: { blocking: [] } });
  });
});

/** S37: seção "Posts" do inspetor da parede. */
describe('WallProperties — Posts (S37)', () => {
  it('"Add post" acrescenta um 4x4 no meio da parede', async () => {
    const dispatch = renderWall(wall());
    expect(screen.getByText('Posts (0)')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Add post/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'updateWall', wallId: 'W01', patch: { posts: [{ x: 72, section: '4x4' }] } });
  });

  it('mostra rótulo, conectores e quanto o post ocupa; remover o último apaga a lista', async () => {
    const dispatch = renderWall(wall({ posts: [{ x: 40, section: '4x6', label: 'P-01', base: 'HDU2', top: 'LVL above' }] }));
    expect(screen.getByText('Posts (1)')).toBeTruthy();
    expect((document.getElementById('w-W01-post-0-l') as HTMLInputElement).value).toBe('P-01');
    expect((document.getElementById('w-W01-post-0-b') as HTMLInputElement).value).toBe('HDU2');
    expect((document.getElementById('w-W01-post-0-t') as HTMLInputElement).value).toBe('LVL above');
    // 4x6 na parede 2x4: face larga ao longo da parede.
    expect(screen.getByText(/5 1\/2" along the wall \(wide face along the wall\)/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Remove post 1' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'updateWall', wallId: 'W01', patch: { posts: undefined } });
  });
});
