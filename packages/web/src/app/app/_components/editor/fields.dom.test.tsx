// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeasureInput, NumberInput } from './fields';

afterEach(cleanup);

/** O inspetor de verdade: o pai guarda o valor e o devolve ao campo depois de cada commit. */
function Controlled({ initial, onCommit, required }: { initial: number | undefined; onCommit: (v: number | undefined) => void; required?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MeasureInput
        id="len"
        value={value}
        onCommit={(v) => {
          setValue(v);
          onCommit(v);
        }}
        aria-label="Length"
        required={required === true}
      />
      <button type="button">elsewhere</button>
    </>
  );
}

/** Interação real com o `CommitInput` (M10): a regra "blur/Enter confirma, Esc reverte" tem de valer num DOM. */
describe('CommitInput no DOM (M10)', () => {
  it('Enter confirma uma vez só: o blur que o Enter provoca não confirma de novo', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Controlled initial={96} onCommit={onCommit} />);
    const input = screen.getByLabelText('Length');
    expect(input).toHaveProperty('value', `8'-0"`);
    await user.clear(input);
    await user.type(input, `12'-6"{Enter}`);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(150);
    expect(document.activeElement).not.toBe(input);
    // Entrar e sair de novo (Tab) não repete o commit: o valor confirmado é o mesmo.
    await user.click(input);
    await user.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('blur confirma e o campo mostra o valor formatado; Esc reverte ao último confirmado sem chamar onCommit', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Controlled initial={96} onCommit={onCommit} />);
    const input = screen.getByLabelText('Length');
    await user.clear(input);
    await user.type(input, '120');
    await user.click(screen.getByText('elsewhere'));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith(120);
    expect(input).toHaveProperty('value', `10'-0"`);

    await user.clear(input);
    await user.type(input, '999{Escape}');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(input).toHaveProperty('value', `10'-0"`);
    expect(document.activeElement).not.toBe(input);
  });

  it('texto inválido mostra o erro inline, não confirma e mantém o foco', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(<Controlled initial={96} onCommit={onCommit} required />);
    const input = screen.getByLabelText('Length');
    await user.clear(input);
    await user.type(input, 'abc{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(input);
    await user.clear(input);
    await user.type(input, '{Enter}');
    expect(screen.getByRole('alert').textContent).toBe('Required');
    expect(onCommit).not.toHaveBeenCalled();
    // Corrigir limpa o erro.
    await user.type(input, '8{Enter}');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onCommit).toHaveBeenCalledWith(8);
  });

  it('valor novo de fora só entra no campo quando ele não está em foco', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const { rerender } = render(<NumberInput id="n" value={2} onCommit={onCommit} integer placeholder="n" />);
    const input = screen.getByPlaceholderText('n');
    await user.click(input);
    await user.clear(input);
    await user.type(input, '7');
    rerender(<NumberInput id="n" value={3} onCommit={onCommit} integer placeholder="n" />);
    expect(input).toHaveProperty('value', '7'); // o que o humano digita fica
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(7);
    rerender(<NumberInput id="n" value={4} onCommit={onCommit} integer placeholder="n" />);
    expect(input).toHaveProperty('value', '4'); // sem foco, o draft manda
  });
});
