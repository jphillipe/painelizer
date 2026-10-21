// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { doneSteps, StepBar } from './step-bar';

afterEach(cleanup);

/** Barra de passos com cliques (M10): só um passo concluído e não ativo leva a algum lugar. */
describe('StepBar (M10)', () => {
  it('no editor com projeto: Drawings volta, Review é o atual, Panels ainda não existe', () => {
    const onGo = vi.fn();
    render(<StepBar active={2} done={doneSteps(true, false)} onGo={onGo} />);
    const [drawings, review, panels] = screen.getAllByRole('button') as HTMLButtonElement[];
    expect(drawings!.disabled).toBe(false);
    expect(review!.disabled).toBe(true);
    expect(panels!.disabled).toBe(true);
    expect(screen.getByRole('listitem', { current: 'step' }).textContent).toContain('Review walls');
    fireEvent.click(drawings!);
    fireEvent.click(panels!);
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(onGo).toHaveBeenCalledWith(1);
  });

  it('com resultado, Review volta do passo 3 (M2: antes o editor ficava inalcançável); compacta usa rótulos curtos', () => {
    const onGo = vi.fn();
    render(<StepBar active={3} done={doneSteps(true, true)} onGo={onGo} compact />);
    fireEvent.click(screen.getByTitle('Review walls'));
    expect(onGo).toHaveBeenCalledWith(2);
    expect(screen.getByTitle('Panels').textContent).toContain('Panels');
    expect(screen.getByTitle('Upload drawings').textContent).toContain('Drawings');
  });
});
