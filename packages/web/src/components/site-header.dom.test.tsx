// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/login/_actions/sign-out', () => ({ signOutAction: {} }));
let pathname = '/app';
const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => pathname, useRouter: () => ({ push, refresh }) }));
const execute = vi.fn();
vi.mock('next-safe-action/hooks', () => ({
  useAction: (_action: unknown, opts: { onSuccess: (r: { data: unknown }) => void }) => ({
    execute: () => {
      execute();
      opts.onSuccess({ data: { ok: true } });
    },
    isPending: false,
  }),
}));

const { SiteHeader } = await import('./site-header');
const user = { id: 'u1', email: 'joao.phillipe1998@gmail.com' };

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  execute.mockReset();
  // Radix usa APIs que o jsdom não tem.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

describe('SiteHeader (S22 header)', () => {
  it('no app: marca, "New project" ativo pela rota e avatar com as iniciais', () => {
    pathname = '/app';
    render(<SiteHeader user={user} />);
    expect(screen.getByRole('link', { name: 'Panelizer — National Lumber' })).toBeTruthy();
    const nav = screen.getByRole('link', { name: 'New project' });
    expect(nav.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('banner').getAttribute('data-tone')).toBe('navy');
    expect(screen.getByRole('button', { name: `Account: ${user.email}` }).textContent).toContain('JP');
  });

  it('sem usuário não há avatar; na tela de login não há navegação mesmo com usuário', () => {
    pathname = '/app';
    const { unmount } = render(<SiteHeader user={undefined} />);
    expect(screen.queryByRole('button', { name: /Account:/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'New project' })).toBeTruthy();
    unmount();
    pathname = '/login';
    render(<SiteHeader user={user} />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('button', { name: /Account:/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Panelizer — National Lumber' })).toBeTruthy();
    expect(screen.getByText(/internal tool/)).toBeTruthy();
    // Sobre o palco navy do login o header vira papel; nas outras telas (papel) fica navy.
    expect(screen.getByRole('banner').getAttribute('data-tone')).toBe('light');
  });

  it('o menu do avatar mostra o e-mail e "Sign out" sai e vai ao login', async () => {
    pathname = '/app';
    const u = userEvent.setup();
    render(<SiteHeader user={user} />);
    await u.click(screen.getByRole('button', { name: `Account: ${user.email}` }));
    const item = await screen.findByRole('menuitem', { name: /Sign out/ });
    expect(screen.getByText('Signed in as')).toBeTruthy();
    await u.click(item);
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith('/login');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
