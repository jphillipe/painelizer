// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Sheet } from '@/lib/files';
import type { PanelSummary } from '@/types/panels';
import { ResultSheets } from './result-sheets';

afterEach(cleanup);

const ids = ['1-W01-P1', '1-W01-P2', '1-W02-P1'];
const sheets: Sheet[] = ids.map((id) => ({ panelId: id, path: `panels/${id}.svg`, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>${id}</text></svg>` }));
const panels: PanelSummary[] = ids.map((id) => ({ id, wallId: id.split('-')[1]!, length: 144, pieces: 20, weightLb: 200 }));

function setup(selected: string, extra: Partial<Parameters<typeof ResultSheets>[0]> = {}) {
  const onSelect = vi.fn();
  const onShowAll = vi.fn();
  const utils = render(<ResultSheets sheets={sheets} panels={panels} warningsByPanel={new Map([['1-W01-P2', 2]])} selected={selected} onSelect={onSelect} showAll={false} onShowAll={onShowAll} onPrint={() => {}} {...extra} />);
  return { onSelect, onShowAll, ...utils };
}

/** Navegação entre folhas (M3) com cliques e teclas de verdade (M10). */
describe('ResultSheets (M10)', () => {
  it('mostra a folha selecionada com "x of y"; Next / Previous chamam onSelect com a vizinha', () => {
    const { onSelect } = setup('1-W01-P2');
    expect(screen.getByRole('img', { name: 'Sheet 1-W01-P2' })).toBeTruthy();
    expect(screen.getByText(/2 of 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next sheet' }));
    expect(onSelect).toHaveBeenLastCalledWith('1-W02-P1');
    fireEvent.click(screen.getByRole('button', { name: 'Previous sheet' }));
    expect(onSelect).toHaveBeenLastCalledWith('1-W01-P1');
    expect(screen.getByTitle('2 warnings').textContent).toBe('2');
  });

  it('nas pontas o botão correspondente fica desligado; a lista seleciona ao clicar', () => {
    const { onSelect } = setup('1-W01-P1');
    expect((screen.getByRole('button', { name: 'Previous sheet' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Next sheet' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByText('1-W02-P1'));
    expect(onSelect).toHaveBeenLastCalledWith('1-W02-P1');
    cleanup();
    setup('1-W02-P1');
    expect((screen.getByRole('button', { name: 'Next sheet' }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('ul[aria-label="Sheets"] button[aria-current="true"]')?.textContent).toContain('1-W02-P1');
  });

  it('← → trocam de folha; dentro de um campo ou com modificador, não', () => {
    const { onSelect } = setup('1-W01-P2');
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith('1-W02-P1');
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith('1-W01-P1');
    onSelect.mockClear();
    fireEvent.keyDown(document.body, { key: 'ArrowRight', ctrlKey: true });
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('"Show all sheets" despeja todas e desliga as setas; o botão PDF chama onPdf com a folha aberta', () => {
    const onPdf = vi.fn();
    const { onShowAll, onSelect } = setup('1-W01-P1', { onPdf });
    fireEvent.click(screen.getByLabelText('Show all sheets'));
    expect(onShowAll).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    expect(onPdf).toHaveBeenCalledWith(sheets[0]);
    cleanup();
    setup('1-W01-P1', { showAll: true });
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Next sheet' })).toBeNull();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
