// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { draftFromText, type ProjectDraft } from '@/lib/editor/draft';
import { planGeometry } from '@/lib/editor/geometry';
import { PlanCanvas } from './plan-canvas';

afterEach(cleanup);

const load = (text: string): ProjectDraft => {
  const r = draftFromText(text);
  if (!r.ok) throw new Error('should open');
  return r.draft;
};

beforeAll(() => {
  // jsdom não implementa captura de ponteiro; o canvas trata a captura como conveniência.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
});

const SIZE = { width: 800, height: 600 };
const handleAt = (container: HTMLElement, end: 'start' | 'end'): { el: Element; x: number; y: number } => {
  const el = container.querySelector(`[data-handle="${end}"]`)!;
  const c = el.querySelector('circle')!;
  return { el, x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) };
};
const pointer = (x: number, y: number, extra: object = {}): object => ({ pointerId: 1, button: 0, clientX: x, clientY: y, ...extra });

/** Arraste por pointer events (M10): clique seleciona; alça move a ponta no eixo com snap; soltar fecha a transação. */
describe('PlanCanvas: ponteiro (M10)', () => {
  it('clique sem mover seleciona a parede; arrastar o fundo não seleciona', () => {
    const d = load(EXAMPLES[1]!.text);
    const onSelect = vi.fn();
    const { container } = render(<PlanCanvas geometry={planGeometry(d)} selection={{ kind: 'none' }} issuesByWall={new Map()} fitKey="t" onSelect={onSelect} initialSize={SIZE} />);
    const svg = container.querySelector('[data-plan-canvas] svg')!;
    const wall = container.querySelector('[data-wall-id="W03"] *')!;
    fireEvent.pointerDown(wall, pointer(100, 100));
    fireEvent.pointerUp(wall, pointer(100, 100));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'wall', wallId: 'W03' });
    onSelect.mockClear();
    fireEvent.pointerDown(svg, pointer(10, 10));
    fireEvent.pointerMove(svg, pointer(60, 40));
    fireEvent.pointerUp(svg, pointer(60, 40));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('arrastar a alça do fim move a ponta no eixo, com snap de 1" (Shift: 1/8"), e fecha a transação ao soltar', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    try {
      const d = load(EXAMPLES[1]!.text);
      const geometry = planGeometry(d);
      const w01 = geometry.walls.find((w) => w.wallId === 'W01')!;
      const onEndpointDrag = vi.fn();
      const onDragEnd = vi.fn();
      const { container } = render(
        <PlanCanvas geometry={geometry} selection={{ kind: 'wall', wallId: 'W01' }} issuesByWall={new Map()} fitKey="t" onSelect={() => {}} onEndpointDrag={onEndpointDrag} onOpeningDrag={() => {}} onDragEnd={onDragEnd} initialSize={SIZE} />,
      );
      const svg = container.querySelector('[data-plan-canvas] svg')!;
      const start = handleAt(container, 'start');
      const end = handleAt(container, 'end');
      const scale = (end.x - start.x) / (w01.end.x - w01.start.x); // px por polegada (W01 é horizontal)
      expect(scale).toBeGreaterThan(0);

      fireEvent.pointerDown(end.el, pointer(end.x, end.y));
      // 36.4" para a direita e 20 px para baixo: fica no eixo, arredonda para 36".
      fireEvent.pointerMove(svg, pointer(end.x + 36.4 * scale, end.y + 20));
      expect(onEndpointDrag).not.toHaveBeenCalled(); // um dispatch por quadro
      act(() => void vi.advanceTimersToNextFrame());
      expect(onEndpointDrag).toHaveBeenCalledTimes(1);
      const [wallId, which, point, txn] = onEndpointDrag.mock.calls[0]!;
      expect(wallId).toBe('W01');
      expect(which).toBe('end');
      expect(point.x).toBeCloseTo(w01.end.x + 36, 6);
      expect(point.y).toBeCloseTo(w01.end.y, 6);
      expect(typeof txn).toBe('string');
      expect(container.textContent).toContain(`43'-0" axis`); // cota ao lado do cursor: 40' + 36"

      // Shift: 1/8".
      fireEvent.pointerMove(svg, pointer(end.x + 36.4 * scale, end.y, { shiftKey: true }));
      act(() => void vi.advanceTimersToNextFrame());
      expect(onEndpointDrag).toHaveBeenCalledTimes(2);
      expect(onEndpointDrag.mock.calls[1]![2].x).toBeCloseTo(w01.end.x + 36.375, 6);
      expect(onEndpointDrag.mock.calls[1]![3]).toBe(txn); // mesma transação: um undo só

      expect(onDragEnd).not.toHaveBeenCalled();
      fireEvent.pointerUp(svg, pointer(end.x + 36.4 * scale, end.y));
      expect(onDragEnd).toHaveBeenCalledTimes(1);
      expect(container.textContent).not.toContain(`43'-0" axis`);
    } finally {
      vi.useRealTimers();
    }
  });

  it('mover menos de 3 px ainda é clique; cancelar o ponteiro não fecha transação nem seleciona', () => {
    const d = load(EXAMPLES[1]!.text);
    const onSelect = vi.fn();
    const onDragEnd = vi.fn();
    const { container } = render(<PlanCanvas geometry={planGeometry(d)} selection={{ kind: 'none' }} issuesByWall={new Map()} fitKey="t" onSelect={onSelect} onEndpointDrag={() => {}} onDragEnd={onDragEnd} initialSize={SIZE} />);
    const svg = container.querySelector('[data-plan-canvas] svg')!;
    const wall = container.querySelector('[data-wall-id="W02"] *')!;
    fireEvent.pointerDown(wall, pointer(100, 100));
    fireEvent.pointerMove(svg, pointer(101, 102));
    fireEvent.pointerUp(svg, pointer(101, 102));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'wall', wallId: 'W02' });
    onSelect.mockClear();
    fireEvent.pointerDown(wall, pointer(100, 100));
    fireEvent.pointerCancel(svg, pointer(100, 100));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onDragEnd).not.toHaveBeenCalled();
  });
});
