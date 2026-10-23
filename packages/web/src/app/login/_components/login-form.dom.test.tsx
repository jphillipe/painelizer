// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignInInput } from '@/schemas/auth';
import type { SignInResult } from '@/services/auth.service';

// A action de verdade importa `server-only`; aqui interessa o que o formulário faz com a resposta.
vi.mock('../_actions/sign-in', () => ({ signInAction: {} }));
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
let reply: SignInResult = { ok: true, user: { id: 'u1', email: 'alice@example.com' } };
const execute = vi.fn<(input: SignInInput) => void>();
vi.mock('next-safe-action/hooks', () => ({
  useAction: (_action: unknown, opts: { onSuccess: (r: { data: SignInResult }) => void }) => ({
    execute: (input: SignInInput) => {
      execute(input);
      opts.onSuccess({ data: reply });
    },
    isPending: false,
  }),
}));

const { LoginForm } = await import('./login-form');

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  execute.mockReset();
});
afterEach(cleanup);

describe('LoginForm (S22.0)', () => {
  it('valida antes de chamar a action: e-mail inválido e senha vazia ficam na tela', async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/app" />);
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email address.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(execute).not.toHaveBeenCalled();
  });

  it('manda e-mail e senha; sucesso vai ao `next` e recarrega o servidor', async () => {
    const user = userEvent.setup();
    reply = { ok: true, user: { id: 'u1', email: 'alice@example.com' } };
    render(<LoginForm next="/app/projects/1" />);
    await user.type(screen.getByLabelText('Email'), ' alice@example.com ');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]![0]).toEqual({ email: 'alice@example.com', password: 'secret' });
    expect(push).toHaveBeenCalledWith('/app/projects/1');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('credencial errada aparece no card, sem navegar, com o foco na senha', async () => {
    const user = userEvent.setup();
    reply = { ok: false, message: 'Email or password is incorrect.' };
    render(<LoginForm next="/app" />);
    await user.type(screen.getByLabelText('Email'), 'alice@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Email or password is incorrect.'));
    expect(push).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText('Password'));
  });
});
