// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyTeamResult, PendingInvite, TeamMember } from '@/services/team.service';

// As actions de verdade importam `server-only`, o Supabase e a chave secret; aqui são etiquetas para o `useAction` falso.
vi.mock('../_actions/change-password', () => ({ changePasswordAction: { kind: 'password' } }));
vi.mock('../_actions/profile', () => ({ setMyNameAction: { kind: 'myName' } }));
vi.mock('../_actions/invite-member', () => ({ inviteMemberAction: { kind: 'invite' } }));
vi.mock('../_actions/invites', () => ({ renewInviteAction: { kind: 'renew' }, revokeInviteAction: { kind: 'revoke' } }));
vi.mock('../_actions/team-members', () => ({
  setMemberRoleAction: { kind: 'role' },
  removeMemberAction: { kind: 'remove' },
  setMemberNameAction: { kind: 'name' },
  memberResetLinkAction: { kind: 'reset' },
  setMemberDisabledAction: { kind: 'disable' },
  deleteMemberAccountAction: { kind: 'delete' },
}));
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
const OFF = '33333333-3333-4333-8333-333333333333';
const INV = '44444444-4444-4444-8444-444444444444';
const mk = (userId: string, email: string, role: 'admin' | 'editor', extra: Partial<TeamMember> = {}): TeamMember => ({ userId, email, name: undefined, role, joinedAt: '2026-11-04T00:00:00Z', disabled: false, ...extra });
const pending: PendingInvite = { id: INV, email: 'fresh@x.com', name: 'Fresh', role: 'editor', createdAt: '2026-11-06T00:00:00Z', expiresAt: '2026-11-13T12:00:00Z', expired: false, invitedBy: 'me@x.com' };
const team = (role: 'admin' | 'editor', invites: PendingInvite[] = []): MyTeamResult => ({
  ok: true,
  team: {
    id: 't1',
    name: 'National Lumber',
    role,
    myName: 'Me Myself',
    members: [mk(ME, 'me@x.com', role, { name: 'Me Myself' }), mk(ED, 'ed@x.com', 'editor'), mk(OFF, 'off@x.com', 'editor', { name: 'Off Person', disabled: true })],
    invites,
  },
});

const view = (role: 'admin' | 'editor', opts: { accountsEnabled?: boolean; invites?: PendingInvite[] } = {}) => (
  <AccountView state="ok" email="me@x.com" userId={ME} team={team(role, opts.invites)} accountsEnabled={opts.accountsEnabled ?? true} />
);

async function openMenu(u: ReturnType<typeof userEvent.setup>, email: string) {
  await u.click(screen.getByRole('button', { name: `Actions for ${email}` }));
  return screen.findByRole('menu');
}

beforeEach(() => {
  calls.length = 0;
  refresh.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  for (const k of ['password', 'myName', 'role', 'remove', 'name', 'disable', 'delete', 'revoke']) responses[k] = () => ({ ok: true });
  responses['invite'] = (input) => ({ ok: true, status: 'invite_link', email: input['email'], url: 'https://app/invite/TOKEN1', expiresAt: '2026-11-13T12:00:00Z' });
  responses['renew'] = () => ({ ok: true, email: 'fresh@x.com', url: 'https://app/invite/TOKEN2', expiresAt: '2026-11-13T12:00:00Z' });
  responses['reset'] = () => ({ ok: true, email: 'ed@x.com', url: 'https://app/auth/confirm?token_hash=h&type=recovery' });
});
afterEach(cleanup);

describe('AccountView (S32, S41)', () => {
  it('sem Supabase explica e não mostra formulário', () => {
    render(<AccountView state="unconfigured" />);
    expect(screen.getByText('Accounts are not set up on this server')).toBeTruthy();
    expect(screen.queryByLabelText('New password')).toBeNull();
  });

  it('troca de senha: confere as duas antes de mandar; sucesso limpa e avisa', async () => {
    const u = userEvent.setup();
    render(<AccountView state="ok" email="me@x.com" userId={ME} team={team('editor')} accountsEnabled={false} notice="reset" />);
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

  it('editor: o próprio nome no topo e no cartão (salva), o time com nome e situação, sem controles', async () => {
    const u = userEvent.setup();
    render(view('editor'));
    expect(screen.getByText('Signed in as Me Myself (me@x.com).')).toBeTruthy();
    expect(screen.getByText('Off Person')).toBeTruthy();
    expect(screen.getByText('Disabled')).toBeTruthy();
    expect(screen.queryByLabelText('Role of ed@x.com')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Actions for ed@x.com' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add or invite' })).toBeNull();
    const save = screen.getByRole('button', { name: 'Save name' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await u.clear(screen.getByLabelText('Name'));
    await u.type(screen.getByLabelText('Name'), 'Me Again');
    await u.click(save);
    await waitFor(() => expect(calls).toEqual([{ kind: 'myName', input: { name: 'Me Again' } }]));
    expect(toast.success).toHaveBeenCalledWith('Name saved.');
  });

  it('admin: papel, nome, tirar do time (com confirmação)', async () => {
    const u = userEvent.setup();
    render(view('admin'));
    await u.selectOptions(screen.getByLabelText('Role of ed@x.com'), 'admin');
    await waitFor(() => expect(calls).toEqual([{ kind: 'role', input: { userId: ED, role: 'admin' } }]));
    expect(refresh).toHaveBeenCalledTimes(1);

    await u.click(within(await openMenu(u, 'ed@x.com')).getByRole('menuitem', { name: 'Edit name…' }));
    const rename = await screen.findByRole('dialog');
    await u.type(within(rename).getByLabelText('Name'), 'Ed Lumber');
    await u.click(within(rename).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ kind: 'name', input: { userId: ED, name: 'Ed Lumber' } }));

    await u.click(within(await openMenu(u, 'ed@x.com')).getByRole('menuitem', { name: 'Remove from team…' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ kind: 'remove', input: { userId: ED } }));
  });

  it('admin: link de nova senha no diálogo (copia), desativar com confirmação, reativar direto', async () => {
    const u = userEvent.setup();
    render(view('admin'));
    await u.click(within(await openMenu(u, 'ed@x.com')).getByRole('menuitem', { name: 'Password reset link' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Password reset link for ed@x.com')).toBeTruthy();
    expect((within(dialog).getByLabelText('Link') as HTMLInputElement).value).toBe('https://app/auth/confirm?token_hash=h&type=recovery');
    await u.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Link copied.'));
    expect(await navigator.clipboard.readText()).toBe('https://app/auth/confirm?token_hash=h&type=recovery');
    await u.click(within(dialog).getByRole('button', { name: 'Done' }));

    await u.click(within(await openMenu(u, 'ed@x.com')).getByRole('menuitem', { name: 'Disable account…' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ kind: 'disable', input: { userId: ED, disabled: true } }));
    expect(toast.success).toHaveBeenLastCalledWith('Account disabled.');

    await u.click(within(await openMenu(u, 'off@x.com')).getByRole('menuitem', { name: 'Enable account' }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ kind: 'disable', input: { userId: OFF, disabled: false } }));
  });

  it('admin: apagar a conta só depois de digitar o e-mail; a própria conta não tem as ações da chave', async () => {
    const u = userEvent.setup();
    render(view('admin'));
    await u.click(within(await openMenu(u, 'ed@x.com')).getByRole('menuitem', { name: 'Delete account…' }));
    const dialog = await screen.findByRole('dialog');
    const del = within(dialog).getByRole('button', { name: 'Delete account' }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    await u.type(within(dialog).getByLabelText('Type the email to confirm'), 'ED@x.com');
    expect(del.disabled).toBe(false);
    await u.click(del);
    await waitFor(() => expect(calls.at(-1)).toEqual({ kind: 'delete', input: { userId: ED } }));

    const mine = await openMenu(u, 'me@x.com');
    for (const name of ['Password reset link', 'Disable account…', 'Delete account…']) expect(within(mine).getByRole('menuitem', { name }).getAttribute('aria-disabled')).toBe('true');
  });

  it('convite: e-mail novo mostra o link uma vez; conta existente vira toast', async () => {
    const u = userEvent.setup();
    render(view('admin'));
    await u.type(screen.getByLabelText('Email'), 'new@x.com');
    await u.type(screen.getByLabelText('Name (optional)'), 'Nova');
    await u.click(screen.getByRole('button', { name: 'Add or invite' }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ kind: 'invite', input: { email: 'new@x.com', role: 'editor', name: 'Nova' } }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Invitation for new@x.com')).toBeTruthy();
    expect(within(dialog).getByText(/shown only now/)).toBeTruthy();
    expect((within(dialog).getByLabelText('Link') as HTMLInputElement).value).toBe('https://app/invite/TOKEN1');
    await u.click(within(dialog).getByRole('button', { name: 'Done' }));

    responses['invite'] = (input) => ({ ok: true, status: 'added', email: input['email'] });
    await u.type(screen.getByLabelText('Email'), 'old@x.com');
    await u.click(screen.getByRole('button', { name: 'Add or invite' }));
    await waitFor(() => expect(toast.success).toHaveBeenLastCalledWith('old@x.com is now in the team.'));
    expect(calls.at(-1)?.input).toEqual({ email: 'old@x.com', role: 'editor' });
  });

  it('convites pendentes: New link mostra o link novo; Withdraw confirma', async () => {
    const u = userEvent.setup();
    render(view('admin', { invites: [pending] }));
    expect(screen.getByText('Fresh · fresh@x.com')).toBeTruthy();
    expect(screen.getByText(/valid until Nov 13, 2026/)).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'New link' }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ kind: 'renew', input: { id: INV } }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText('Link') as HTMLInputElement).value).toBe('https://app/invite/TOKEN2');
    await u.click(within(dialog).getByRole('button', { name: 'Done' }));
    await u.click(screen.getByRole('button', { name: 'Withdraw the invitation for fresh@x.com' }));
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(calls.at(-1)).toEqual({ kind: 'revoke', input: { id: INV } }));
  });

  it('sem chave secret: as ações da chave ficam desabilitadas e a tela explica', async () => {
    const u = userEvent.setup();
    responses['invite'] = () => ({ ok: false, reason: 'needs_secret_key', message: 'There is no account for z@x.com yet…' });
    render(view('admin', { accountsEnabled: false, invites: [pending] }));
    expect(screen.getByText(/can’t make invitation links/)).toBeTruthy();
    expect(screen.getByText(/Password links, disabling and deleting accounts need SUPABASE_SECRET_KEY/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'New link' }) as HTMLButtonElement).disabled).toBe(true);
    const menu = await openMenu(u, 'ed@x.com');
    expect(within(menu).getByRole('menuitem', { name: 'Password reset link' }).getAttribute('aria-disabled')).toBe('true');
    expect(within(menu).getByRole('menuitem', { name: 'Edit name…' }).getAttribute('aria-disabled')).toBeNull();
    await u.keyboard('{Escape}');
    await u.type(screen.getByLabelText('Email'), 'z@x.com');
    await u.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toContain('There is no account for z@x.com yet');
  });

  it('recusa do servidor (último admin) vira toast', async () => {
    const u = userEvent.setup();
    responses['role'] = () => ({ ok: false, reason: 'last_admin', message: 'A team needs at least one admin. Make someone else an admin first.' });
    render(view('admin'));
    await u.selectOptions(screen.getByLabelText('Role of me@x.com'), 'editor');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('A team needs at least one admin. Make someone else an admin first.'));
  });

  it('sem time e sem tabelas: avisos próprios', () => {
    render(<AccountView state="ok" email="me@x.com" userId={ME} team={{ ok: true, team: undefined }} accountsEnabled={false} notice="welcome" />);
    expect(screen.getByText('Welcome to the team')).toBeTruthy();
    expect(screen.getByText('You are not in a team yet')).toBeTruthy();
    expect(screen.queryByText('Your name')).toBeNull();
    cleanup();
    render(<AccountView state="ok" email="me@x.com" userId={ME} team={{ ok: false, reason: 'missing', message: 'Apply the S41 migrations' }} accountsEnabled={false} />);
    expect(screen.getByText('Apply the S41 migrations')).toBeTruthy();
  });
});
