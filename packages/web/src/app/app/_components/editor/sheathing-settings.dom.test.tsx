// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SheathingSettings } from './sheathing-settings';

afterEach(cleanup);

/** S38: seção "Sheathing" das configurações do projeto (o select mostra; o patch é testado em lib/editor/sheathing). */
describe('SheathingSettings (S38)', () => {
  it('desligado: só o seletor, em "Off"', () => {
    render(<SheathingSettings config={{}} onChange={vi.fn()} />);
    expect(document.getElementById('sh-walls')?.textContent).toBe('Off (default)');
    expect(document.getElementById('sh-thk')).toBeNull();
  });

  it('ligado: paredes e campos com os defaults como placeholder; editar grava só o campo', async () => {
    const onChange = vi.fn();
    render(<SheathingSettings config={{ sheathing: { overhang: { corner: 'auto' }, walls: 'all' } }} onChange={onChange} />);
    expect(document.getElementById('sh-walls')?.textContent).toBe('All walls');
    const h = document.getElementById('sh-h') as HTMLInputElement;
    expect(h.placeholder).toBe(`8'-0"`);
    expect((document.getElementById('sh-corner') as HTMLInputElement).value).toBe('');
    await userEvent.type(h, `9'{Enter}`);
    expect(onChange).toHaveBeenLastCalledWith({ sheet: { height: 108 }, overhang: { corner: 'auto' }, walls: 'all' });
  });
});
