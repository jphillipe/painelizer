// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorPage from './error';

afterEach(cleanup);

describe('error.tsx (2026-10-23)', () => {
  it('mostra a mensagem e a referência, e "Try again" chama o reset do Next', async () => {
    const reset = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('Setting up fake worker failed'), { digest: 'abc123' });
    render(<ErrorPage error={error} reset={reset} />);
    expect(screen.getByRole('alert').textContent).toContain('Setting up fake worker failed');
    expect(screen.getByText('abc123')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Back to the app/ }).getAttribute('href')).toBe('/app');
    await userEvent.setup().click(screen.getByRole('button', { name: /Try again/ }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('erro sem mensagem vira "Unknown error", sem referência', () => {
    render(<ErrorPage error={new Error('')} reset={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('Unknown error');
    expect(screen.queryByText(/Reference:/)).toBeNull();
  });
});
