// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvitePreview } from '@/services/team.service';

vi.mock('../_actions/accept-invite', () => ({ acceptInviteAction: { kind: 'accept' } }));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const calls: Record<string, unknown>[] = [];
let response: (input: Record<string, unknown>) => unknown = () => ({ ok: true, email: 'fresh@x.com', signedIn: true });
vi.mock('next-safe-action/hooks', () => ({
  useAction: (_action: unknown, opts: { onSuccess: (r: { data: unknown; input: Record<string, unknown> }) => void }) => ({
    execute: (input: Record<string, unknown>) => {
      calls.push(input);
      opts.onSuccess({ data: response(input), input });
    },
    isPending: false,
  }),
}));

const { InviteView } = await import('./invite-view');

const TOKEN = 'A'.repeat(43);
const open: InvitePreview = { state: 'open', email: 'fresh@x.com', name: 'Fresh', role: 'editor', teamName: 'National Lumber', expiresAt: '2026-11-13T12:00:00Z' };

beforeEach(() => {
  calls.length = 0;
  push.mockReset();
  response = () => ({ ok: true, email: 'fresh@x.com', signedIn: true });
});
afterEach(cleanup);

async function fill(u: ReturnType<typeof userEvent.setup>, password: string, confirm: string) {
  await u.type(screen.getByLabelText('Password'), password);
  await u.type(screen.getByLabelText('Repeat it'), confirm);
  await u.click(screen.getByRole('button', { name: 'Create my account' }));
}

describe('página do convite (S41)', () => {
  it('aberto: time, e-mail fixo, nome do convite; senhas conferidas antes; sucesso entra no app', async () => {
    const u = userEvent.setup();
    render(<InviteView token={TOKEN} preview={open} />);
    expect(screen.getByRole('heading', { name: 'Join National Lumber' })).toBeTruthy();
    expect(screen.getByText(/as an editor/)).toBeTruthy();
    expect(screen.getByText(/valid until Nov 13, 2026/)).toBeTruthy();
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    expect(email.value).toBe('fresh@x.com');
    expect(email.readOnly).toBe(true);
    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Fresh');
    await fill(u, 'long enough 1', 'long enough 2');
    expect(screen.getByRole('alert').textContent).toBe('The two passwords don’t match.');
    expect(calls).toEqual([]);
    await u.clear(screen.getByLabelText('Repeat it'));
    await u.type(screen.getByLabelText('Repeat it'), 'long enough 1');
    await u.click(screen.getByRole('button', { name: 'Create my account' }));
    await waitFor(() => expect(calls).toEqual([{ token: TOKEN, name: 'Fresh', password: 'long enough 1', confirm: 'long enough 1' }]));
    expect(push).toHaveBeenCalledWith('/app');
  });

  it('recusa do servidor aparece no formulário; conta criada sem login manda entrar', async () => {
    const u = userEvent.setup();
    response = () => ({ ok: false, reason: 'exists', message: 'There is already an account for fresh@x.com.' });
    render(<InviteView token={TOKEN} preview={open} signedInAs="other@x.com" />);
    expect(screen.getByRole('note').textContent).toContain('signed in as other@x.com');
    await fill(u, 'long enough 1', 'long enough 1');
    expect((await screen.findByRole('alert')).textContent).toBe('There is already an account for fresh@x.com.');
    response = () => ({ ok: true, email: 'fresh@x.com', signedIn: false });
    await u.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(await screen.findByText('Your account is ready')).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it('fechado: a frase e o caminho para entrar, sem formulário', () => {
    render(<InviteView token={TOKEN} preview={{ state: 'expired', message: 'This invitation has expired. Ask your admin for a new one.' }} />);
    expect(screen.getByRole('heading', { name: 'This invitation can’t be used' })).toBeTruthy();
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.getByText(/has expired/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to sign in' }).getAttribute('href')).toBe('/login');
    expect(screen.queryByLabelText('Password')).toBeNull();
  });
});
