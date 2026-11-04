// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorTopBar } from './editor-top-bar';
import type { CheckState } from './use-project-check';

afterEach(cleanup);

const check: CheckState = { status: 'done', result: { ok: true, projectName: 'x', panels: [] as never, warnings: [] }, revision: 1, stale: false };
const base = { name: 'Casa', walls: 4, openings: 2, pending: false, needsData: false, onGenerate: () => {}, steps: <span>steps</span>, menu: [], check, problems: 0, warnings: 0, ready: true };

/** S23 (A4): o conflito não oferece mais só "Reload" (que apagava as edições sem dizer). */
describe('EditorTopBar — conflito do auto-save (S23)', () => {
  it('Save as copy sai direto; Overwrite e Reload pedem confirmação; "Keep working" não faz nada', async () => {
    const actions = { saveAsCopy: vi.fn(), overwrite: vi.fn(), reload: vi.fn() };
    render(<EditorTopBar {...base} save={{ kind: 'conflict', message: 'edited elsewhere', revision: 7 }} saveActions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save as copy' }));
    expect(actions.saveAsCopy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Overwrite' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('revision 7');
    fireEvent.click(screen.getByRole('button', { name: 'Keep working' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(actions.overwrite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Overwrite' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getAllByRole('button', { name: 'Overwrite' }).at(-1)!);
    expect(actions.overwrite).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect((await screen.findByRole('dialog')).textContent).toContain('Your changes since the last save are lost');
    fireEvent.click(screen.getAllByRole('button', { name: 'Reload' }).at(-1)!);
    expect(actions.reload).toHaveBeenCalledTimes(1);
  });

  it('projeto apagado no servidor: oferece salvar como cópia', () => {
    const actions = { saveAsCopy: vi.fn() };
    render(<EditorTopBar {...base} save={{ kind: 'deleted', message: 'gone' }} saveActions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save as copy' }));
    expect(actions.saveAsCopy).toHaveBeenCalledTimes(1);
  });
});
