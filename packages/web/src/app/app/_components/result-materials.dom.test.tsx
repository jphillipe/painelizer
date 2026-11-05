// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BomRow } from '@/types/panels';
import { ResultMaterials } from './result-materials';

afterEach(cleanup);

const bom: BomRow[] = [
  { section: '2x6', stockLength: 96, kind: 'commercial', qty: 10, cutTotal: 800, waste: 160, wastePercent: 16.7, unitPrice: 6.8, cost: 68 },
  { section: '2x12', stockLength: 96, kind: 'commercial', qty: 2, cutTotal: 150, waste: 42, wastePercent: 21.9 },
];

/** S38/S40: aba Materials com preço e chapas. */
describe('ResultMaterials', () => {
  it('seção sem nenhum preço mostra "—" no subtotal; a tabela Sheathing lista as chapas', () => {
    render(
      <ResultMaterials
        bom={bom}
        cost={{ total: 68, unpriced: 1 }}
        sheathing={[{ thickness: 0.4375, width: 48, height: 108, qty: 38, cut: 14, areaSqFt: 1129.5, wastePercent: 17.4 }]}
        cutLists={[]}
        panels={[]}
        onOpenSheet={() => {}}
      />,
    );
    const subtotal = screen.getAllByText('subtotal').map((el) => el.closest('tr')!);
    expect(within(subtotal[0]!).getByText('$68.00')).toBeTruthy();
    expect(within(subtotal[1]!).getAllByText('—')).toHaveLength(1);
    const sheathing = screen.getByRole('region', { name: 'Sheathing' });
    expect(within(sheathing).getByText(`7/16"`)).toBeTruthy();
    expect(within(sheathing).getByText('38')).toBeTruthy();
    expect(within(sheathing).getByText(/Not in the cost total/)).toBeTruthy();
  });

  it('sem chapas, sem a tabela Sheathing', () => {
    render(<ResultMaterials bom={bom} cutLists={[]} panels={[]} onOpenSheet={() => {}} />);
    expect(screen.queryByRole('region', { name: 'Sheathing' })).toBeNull();
  });
});
