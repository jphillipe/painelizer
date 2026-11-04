// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSummary } from '@/services/projects.service';

// As actions de verdade importam `server-only` e o Supabase; aqui cada uma é só uma etiqueta que o `useAction` falso reconhece.
vi.mock('../../_actions/rename-project', () => ({ renameProjectAction: { kind: 'rename' } }));
vi.mock('../../_actions/duplicate-project', () => ({ duplicateProjectAction: { kind: 'duplicate' } }));
vi.mock('../../_actions/delete-project', () => ({ deleteProjectAction: { kind: 'delete' } }));
vi.mock('../../_actions/trash-project', () => ({ trashProjectAction: { kind: 'trash' }, restoreProjectAction: { kind: 'restore' } }));
vi.mock('../../_actions/project-history', () => ({ projectHistoryAction: { kind: 'history' }, restoreRevisionAction: { kind: 'restoreRevision' } }));
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', () => ({ toast }));

type Call = { kind: string; input: Record<string, unknown> };
const calls: Call[] = [];
/** Resposta de cada action falsa, por tipo; o teste troca quando quer um erro. */
const responses: Record<string, (input: Record<string, unknown>) => unknown> = {};
vi.mock('next-safe-action/hooks', () => ({
  useAction: (action: { kind: string }, opts: { onSuccess: (r: { data: unknown; input: Record<string, unknown> }) => void; onError: (r: { error: { serverError?: string } }) => void }) => ({
    execute: (input: Record<string, unknown>) => {
      calls.push({ kind: action.kind, input });
      const data = responses[action.kind]?.(input);
      if (data === 'network') opts.onError({ error: { serverError: 'Could not reach the server.' } });
      else opts.onSuccess({ data, input });
    },
    isPending: false,
  }),
}));

const { ProjectsView } = await import('./projects-view');

const projects: ProjectSummary[] = [
  { id: 'a1', name: 'Ringgold St', walls: 28, revision: 5, createdAt: '2026-11-01T10:00:00Z', updatedAt: new Date(Date.now() - 20_000).toISOString(), ownerEmail: 'nick@wr.com', updatedByEmail: 'nick@wr.com', deletedAt: null },
  { id: 'b2', name: 'Casa 28x40', walls: 5, revision: 1, createdAt: '2026-10-30T10:00:00Z', updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), ownerEmail: 'other@wr.com', updatedByEmail: null, deletedAt: null },
];

beforeEach(() => {
  calls.length = 0;
  push.mockReset();
  refresh.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  for (const k of Object.keys(responses)) delete responses[k];
  responses['rename'] = (input) => ({ ok: true, name: input['name'], revision: 6, savedAt: '2026-11-03T12:00:00Z' });
  responses['duplicate'] = () => ({ ok: true, id: 'c3', name: 'Copy of Ringgold St' });
  responses['delete'] = () => ({ ok: true });
  responses['trash'] = () => ({ ok: true });
  responses['restore'] = () => ({ ok: true });
  responses['history'] = () => ({ ok: true, revisions: [{ revision: 20, name: 'Ringgold St', savedByEmail: 'nick@wr.com', createdAt: new Date().toISOString() }, { revision: 1, name: 'Ringgold St', savedByEmail: null, createdAt: '2026-11-01T10:00:00Z' }] });
  responses['restoreRevision'] = () => ({ ok: true, id: 'd4', name: 'Ringgold St (revision 1)' });
  // Radix usa APIs que o jsdom não tem.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

async function openMenu(u: ReturnType<typeof userEvent.setup>, name: string) {
  await u.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  return screen.findByRole('menu');
}

describe('ProjectsView (S22.2)', () => {
  it('lista nome (link ao editor), paredes, idade e autor ("you" para quem está logado)', () => {
    render(<ProjectsView now={Date.now()} projects={projects} state="ok" me="NICK@wr.com" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Saved projects');
    expect(screen.getByText('2 projects · most recently updated first')).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const first = within(rows[0]!);
    expect(first.getByRole('link', { name: 'Ringgold St' }).getAttribute('href')).toBe('/app/projects/a1');
    expect(first.getByText('28')).toBeTruthy();
    expect(first.getByText('just now')).toBeTruthy();
    expect(first.getByText('you')).toBeTruthy();
    const second = within(rows[1]!);
    expect(second.getByText('3 h ago')).toBeTruthy();
    expect(second.getByText('other@wr.com')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'New project' }).getAttribute('href')).toBe('/app?new=1');
  });

  it('sem projetos mostra o convite; sem Supabase explica; erro do banco mostra a mensagem', () => {
    const { unmount } = render(<ProjectsView now={Date.now()} projects={[]} state="ok" />);
    expect(screen.getByText('No projects yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start a project' })).toBeTruthy();
    unmount();
    render(<ProjectsView now={Date.now()} projects={[]} state="unconfigured" />);
    expect(screen.getByText('Projects are not saved on this server')).toBeTruthy();
    cleanup();
    render(<ProjectsView now={Date.now()} projects={[]} state="failed" message="rede caiu" />);
    expect(screen.getByText('Could not load the projects')).toBeTruthy();
    expect(screen.getByText('rede caiu')).toBeTruthy();
  });

  it('Open e Panels no menu levam às rotas do projeto', async () => {
    const u = userEvent.setup();
    render(<ProjectsView now={Date.now()} projects={projects} state="ok" />);
    let menu = await openMenu(u, 'Casa 28x40');
    await u.click(within(menu).getByRole('menuitem', { name: 'Open' }));
    expect(push).toHaveBeenLastCalledWith('/app/projects/b2');
    menu = await openMenu(u, 'Casa 28x40');
    await u.click(within(menu).getByRole('menuitem', { name: 'Panels' }));
    expect(push).toHaveBeenLastCalledWith('/app/projects/b2/panels');
  });

  it('Rename abre o dialog com o nome atual, manda o nome novo e relê a lista; vazio não sai', async () => {
    const u = userEvent.setup();
    render(<ProjectsView now={Date.now()} projects={projects} state="ok" />);
    const menu = await openMenu(u, 'Ringgold St');
    await u.click(within(menu).getByRole('menuitem', { name: 'Rename…' }));
    const input = await screen.findByLabelText('Name');
    expect((input as HTMLInputElement).value).toBe('Ringgold St');
    await u.clear(input);
    await u.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert').textContent).toBe('Give the project a name.');
    expect(calls).toHaveLength(0);
    await u.type(input, '  Ringgold Street  {Enter}');
    await waitFor(() => expect(calls).toEqual([{ kind: 'rename', input: { id: 'a1', name: 'Ringgold Street' } }]));
    expect(toast.success).toHaveBeenCalledWith('Renamed to “Ringgold Street”.');
    expect(refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Rename com o mesmo nome só fecha; recusa do servidor fica no dialog', async () => {
    const u = userEvent.setup();
    responses['rename'] = () => ({ ok: false, reason: 'failed', message: 'The project is being edited right now. Try again in a moment.' });
    render(<ProjectsView now={Date.now()} projects={projects} state="ok" />);
    let menu = await openMenu(u, 'Ringgold St');
    await u.click(within(menu).getByRole('menuitem', { name: 'Rename…' }));
    await u.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls).toHaveLength(0);
    menu = await openMenu(u, 'Ringgold St');
    await u.click(within(menu).getByRole('menuitem', { name: 'Rename…' }));
    await u.type(await screen.findByLabelText('Name'), ' 2{Enter}');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.getByRole('alert').textContent).toContain('being edited right now');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('Duplicate chama a action e avisa com o nome da cópia', async () => {
    const u = userEvent.setup();
    render(<ProjectsView now={Date.now()} projects={projects} state="ok" />);
    const menu = await openMenu(u, 'Ringgold St');
    await u.click(within(menu).getByRole('menuitem', { name: 'Duplicate' }));
    await waitFor(() => expect(calls).toEqual([{ kind: 'duplicate', input: { id: 'a1' } }]));
    expect(toast.success).toHaveBeenCalledWith('Duplicated as “Copy of Ringgold St”.');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('Move to trash pede confirmação; "Keep it" não mexe; confirmar manda à lixeira e relê; erro de rede vira toast', async () => {
    const u = userEvent.setup();
    render(<ProjectsView now={Date.now()} projects={projects} state="ok" />);
    let menu = await openMenu(u, 'Casa 28x40');
    await u.click(within(menu).getByRole('menuitem', { name: 'Move to trash…' }));
    expect((await screen.findByRole('dialog')).textContent).toContain('Move “Casa 28x40” to the trash?');
    await u.click(screen.getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls).toHaveLength(0);

    menu = await openMenu(u, 'Casa 28x40');
    await u.click(within(menu).getByRole('menuitem', { name: 'Move to trash…' }));
    await u.click(await screen.findByRole('button', { name: 'Move to trash' }));
    await waitFor(() => expect(calls).toEqual([{ kind: 'trash', input: { id: 'b2' } }]));
    expect(toast.success).toHaveBeenCalledWith('Moved “Casa 28x40” to the trash.');
    expect(refresh).toHaveBeenCalledTimes(1);

    responses['trash'] = () => 'network';
    menu = await openMenu(u, 'Ringgold St');
    await u.click(within(menu).getByRole('menuitem', { name: 'Move to trash…' }));
    await u.click(await screen.findByRole('button', { name: 'Move to trash' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not reach the server.'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('ProjectsView — busca, filtros, páginas, lixeira e histórico (S32)', () => {
  const trashed: ProjectSummary[] = [{ ...projects[1]!, deletedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }];

  it('a busca vai para a URL; abas All/Mine/Trash e páginas são links', async () => {
    const u = userEvent.setup();
    render(<ProjectsView now={Date.now()} projects={projects} state="ok" query={{ search: '', mine: true, trash: false }} next="2026-11-01T10:00:00Z~b2" />);
    await u.type(screen.getByLabelText('Search projects by name'), '  ring {Enter}');
    expect(push).toHaveBeenLastCalledWith('/app/projects?q=ring&mine=1');
    expect(screen.getByRole('link', { name: 'Mine' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Trash' }).getAttribute('href')).toBe('/app/projects?trash=1');
    expect(screen.getByRole('link', { name: 'Older →' }).getAttribute('href')).toBe('/app/projects?mine=1&before=2026-11-01T10%3A00%3A00Z%7Eb2');
    expect(screen.queryByRole('link', { name: 'Newest' })).toBeNull();
  });

  it('busca sem resultado e lixeira vazia têm o próprio aviso', () => {
    render(<ProjectsView now={Date.now()} projects={[]} state="ok" query={{ search: 'zzz', mine: false, trash: false }} />);
    expect(screen.getByText('No projects match “zzz”')).toBeTruthy();
    cleanup();
    render(<ProjectsView now={Date.now()} projects={[]} state="ok" query={{ search: '', mine: false, trash: true }} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Trash');
    expect(screen.getByText('The trash is empty')).toBeTruthy();
  });

  it('na lixeira: Restore para todos; Delete forever só admin, com confirmação', async () => {
    const u = userEvent.setup();
    const { unmount } = render(<ProjectsView now={Date.now()} projects={trashed} state="ok" query={{ search: '', mine: false, trash: true }} />);
    expect(screen.getByText('2 days ago')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Casa 28x40' })).toBeNull();
    let menu = await openMenu(u, 'Casa 28x40');
    expect((within(menu).getByRole('menuitem', { name: 'Delete forever (admins)' }) as HTMLElement).getAttribute('aria-disabled')).toBe('true');
    await u.click(within(menu).getByRole('menuitem', { name: 'Restore' }));
    await waitFor(() => expect(calls).toEqual([{ kind: 'restore', input: { id: 'b2' } }]));
    expect(toast.success).toHaveBeenCalledWith('Restored “Casa 28x40”.');
    unmount();
    calls.length = 0;
    render(<ProjectsView now={Date.now()} projects={trashed} state="ok" query={{ search: '', mine: false, trash: true }} isAdmin />);
    menu = await openMenu(u, 'Casa 28x40');
    await u.click(within(menu).getByRole('menuitem', { name: 'Delete forever…' }));
    await u.click(await screen.findByRole('button', { name: 'Delete forever' }));
    await waitFor(() => expect(calls).toEqual([{ kind: 'delete', input: { id: 'b2' } }]));
    expect(toast.success).toHaveBeenCalledWith('Deleted “Casa 28x40” for good.');
  });

  it('History lista os retratos e restaura um como projeto novo, abrindo-o', async () => {
    const u = userEvent.setup();
    render(<ProjectsView now={Date.now()} projects={projects} state="ok" />);
    const menu = await openMenu(u, 'Ringgold St');
    await u.click(within(menu).getByRole('menuitem', { name: 'History…' }));
    const dialog = await screen.findByRole('dialog');
    expect(calls).toEqual([{ kind: 'history', input: { id: 'a1' } }]);
    expect(dialog.textContent).toContain('Revision 20');
    expect(dialog.textContent).toContain('nick@wr.com');
    const buttons = within(dialog).getAllByRole('button', { name: 'Restore as new' });
    await u.click(buttons[1]!);
    await waitFor(() => expect(calls.at(-1)).toEqual({ kind: 'restoreRevision', input: { id: 'a1', revision: 1 } }));
    expect(toast.success).toHaveBeenCalledWith('Restored as “Ringgold St (revision 1)”.');
    expect(push).toHaveBeenLastCalledWith('/app/projects/d4');
  });
});
