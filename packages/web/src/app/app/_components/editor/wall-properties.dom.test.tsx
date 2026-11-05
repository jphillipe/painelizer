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
