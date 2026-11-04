// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyTeamResult } from '@/services/team.service';

// As actions de verdade importam `server-only`, o Supabase e a chave secret; aqui são etiquetas para o `useAction` falso.
vi.mock('../_actions/change-password', () => ({ changePasswordAction: { kind: 'password' } }));
vi.mock('../_actions/invite-member', () => ({ inviteMemberAction: { kind: 'invite' } }));
vi.mock('../_actions/team-members', () => ({ setMemberRoleAction: { kind: 'role' }, removeMemberAction: { kind: 'remove' } }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', () => ({ toast }));

type Call = { kind: string; input: Record<string, unknown> };
const calls: Call[] = [];
const responses: Record<string, (input: Record<string, unknown>) => unknown> = {};
vi.mock('next-safe-action/hooks', () => ({
  useAction: (action: { kind: string }, opts: { onSuccess: (r: { data: unknown; input: Record<string, unknown> }) => void }) => ({
    execute: (input: Record<string, unknown>) => {
      calls.push({ kind: action.kind, input });
      opts.onSuccess({ data: responses[action.kind]?.(input), input });
    },
    isPending: false,
  }),
}));

const { AccountView } = await import('./account-view');

const ME = '11111111-1111-4111-8111-111111111111';
const ED = '22222222-2222-4222-8222-222222222222';
const team = (role: 'admin' | 'editor'): MyTeamResult => ({
  ok: true,
  team: {
    id: 't1',
    name: 'National Lumber',
    role,
    members: [
      { userId: ME, email: 'me@x.com', role, joinedAt: '2026-11-04T00:00:00Z' },
      { userId: ED, email: 'ed@x.com', role: 'editor', joinedAt: '2026-11-04T00:01:00Z' },
    ],
  },
});

beforeEach(() => {
  calls.length = 0;
  refresh.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  responses['password'] = () => ({ ok: true });
  responses['invite'] = (input) => ({ ok: true, status: 'invited', email: input['email'] });
  responses['role'] = () => ({ ok: true });
  responses['remove'] = () => ({ ok: true });
});
afterEach(cleanup);

describe('AccountView (S32)', () => {
  it('sem Supabase explica e não mostra formulário', () => {
    render(<AccountView state="unconfigured" />);
    expect(screen.getByText('Accounts are not set up on this server')).toBeTruthy();
    expect(screen.queryByLabelText('New password')).toBeNull();
  });

  it('troca de senha: confere as duas antes de mandar; sucesso limpa e avisa', async () => {
    const u = userEvent.setup();
    render(<AccountView state="ok" email="me@x.com" userId={ME} team={team('editor')} invitesEnabled={false} notice="reset" />);
    expect(screen.getByText('Choose a new password')).toBeTruthy();
    await u.type(screen.getByLabelText('New password'), 'senha boa 1');
    await u.type(screen.getByLabelText('Repeat it'), 'senha boa 2');
    await u.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByRole('alert').textContent).toBe('The two passwords don’t match.');
    expect(calls).toEqual([]);
    await u.clear(screen.getByLabelText('Repeat it'));
    await u.type(screen.getByLabelText('Repeat it'), 'senha boa 1');
    await u.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(calls).toEqual([{ kind: 'password', input: { password: 'senha boa 1', confirm: 'senha boa 1' } }]));
    expect(toast.success).toHaveBeenCalledWith('Password changed.');
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('');
  });

  it('editor vê o time sem controles; admin troca papel, tira (com confirmação) e convida', async () => {
    const u = userEvent.setup();
    const { unmount } = render(<AccountView state="ok" email="me@x.com" userId={ME} team={team('editor')} invitesEnabled />);
    expect(screen.getByText('Team · National Lumber')).toBeTruthy();
    expect(screen.queryByLabelText('Role of ed@x.com')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add or invite' })).toBeNull();
    unmount();

    render(<AccountView state="ok" email="me@x.com" userId={ME} team={team('admin')} invitesEnabled />);
    await u.selectOptions(screen.getByLabelText('Role of ed@x.com'), 'admin');
    await waitFor(() => expect(calls).toEqual([{ kind: 'role', input: { userId: ED, role: 'admin' } }]));
    expect(refresh).toHaveBeenCalledTimes(1);

    await u.click(screen.getByRole('button', { name: 'Remove ed@x.com from the team' }));
    const dialog = await screen.findByRole('dialog');
    await u.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ kind: 'remove', input: { userId: ED } }));

    await u.type(screen.getByLabelText('Email'), 'new@x.com');
    await u.click(screen.getByRole('button', { name: 'Add or invite' }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ kind: 'invite', input: { email: 'new@x.com', role: 'editor' } }));
    expect(toast.success).toHaveBeenLastCalledWith('Invitation sent to new@x.com.');
  });

  it('recusa do servidor (último admin) vira toast; convite sem chave secret explica', async () => {
    const u = userEvent.setup();
    responses['role'] = () => ({ ok: false, reason: 'last_admin', message: 'A team needs at least one admin. Make someone else an admin first.' });
    responses['invite'] = () => ({ ok: false, reason: 'invites_off', message: 'There is no account for z@x.com yet…' });
    render(<AccountView state="ok" email="me@x.com" userId={ME} team={team('admin')} invitesEnabled={false} />);
    expect(screen.getByText(/can’t send invitations/)).toBeTruthy();
    await u.selectOptions(screen.getByLabelText('Role of me@x.com'), 'editor');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('A team needs at least one admin. Make someone else an admin first.'));
    await u.type(screen.getByLabelText('Email'), 'z@x.com');
    await u.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toContain('There is no account for z@x.com yet');
  });

  it('sem time e sem tabelas: avisos próprios', () => {
    render(<AccountView state="ok" email="me@x.com" userId={ME} team={{ ok: true, team: undefined }} invitesEnabled={false} notice="welcome" />);
    expect(screen.getByText('Welcome to the team')).toBeTruthy();
    expect(screen.getByText('You are not in a team yet')).toBeTruthy();
    cleanup();
    render(<AccountView state="ok" email="me@x.com" userId={ME} team={{ ok: false, reason: 'missing', message: 'Apply the S32 migrations' }} invitesEnabled={false} />);
    expect(screen.getByText('Apply the S32 migrations')).toBeTruthy();
  });
});
