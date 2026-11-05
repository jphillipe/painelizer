// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDraft } from '@/lib/editor/draft';
import { CatalogEditor } from './catalog-editor';

afterEach(cleanup);

const draft = (config: ProjectDraft['config']): ProjectDraft => ({ config: { studSpacing: 16, studLength: [92.625], ...config }, walls: [] });

/** S40: tabela de preços e sheathing do tipo de parede no catálogo. */
describe('CatalogEditor — Prices (S40)', () => {
  it('sem preços: "Add price" grava a primeira linha', async () => {
    const dispatch = vi.fn();
    render(<CatalogEditor draft={draft({})} dispatch={dispatch} />);
    expect(screen.getByText('Prices (0)')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Add price/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'updateConfig', patch: { prices: [{ section: '2x4', length: 96, price: 0 }] } });
  });

  it('editar preço e tamanho grava a linha; remover tira; repetida é apontada', async () => {
    const dispatch = vi.fn();
    const prices = [
      { section: '2x6' as const, length: 96, price: 5 },
      { section: '2x6' as const, length: 96, price: 6 },
    ];
    render(<CatalogEditor draft={draft({ prices })} dispatch={dispatch} />);
    expect(screen.getByText(/Same size and length as an earlier line/)).toBeTruthy();
    const price = document.getElementById('pr-0-value') as HTMLInputElement;
    await userEvent.clear(price);
    await userEvent.type(price, '5.25{Enter}');
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'updateConfig', patch: { prices: [{ section: '2x6', length: 96, price: 5.25 }, prices[1]] } });
    const size = document.getElementById('pr-1-section') as HTMLInputElement;
    await userEvent.clear(size);
    await userEvent.type(size, '2x8{Enter}');
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'updateConfig', patch: { prices: [prices[0], { section: '2x8', length: 96, price: 6 }] } });
    await userEvent.click(screen.getByRole('button', { name: 'Remove price 1' }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'updateConfig', patch: { prices: [prices[1]] } });
  });

  it('por pé: comprimento "any"; o sheathing do tipo aparece no cartão', () => {
    render(
      <CatalogEditor
        draft={draft({ prices: [{ section: 'LVL 1.75x9.25', perFoot: 9.5 }], wallTypes: { 'WT-1': { section: '2x6', sheathing: false } } })}
        dispatch={vi.fn()}
      />,
    );
    expect(document.getElementById('pr-0-mode')?.textContent).toBe('Per foot');
    expect(document.getElementById('pr-0-length')).toBeNull();
    expect(document.getElementById('wt-WT-1-sheathing')?.textContent).toBe('No sheathing');
  });
});
