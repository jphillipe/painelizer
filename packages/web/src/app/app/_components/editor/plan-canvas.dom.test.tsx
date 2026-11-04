// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { draftFromText, type ProjectDraft } from '@/lib/editor/draft';
import { planGeometry } from '@/lib/editor/geometry';
import { fitViewport, planToScreen } from '@/lib/editor/viewport';
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

/** S29: quebras de painel na planta — clique no ponto acrescenta, arrastar move com snap no candidato, duplo clique tira. */
describe('PlanCanvas: quebras de painel (S29)', () => {
  const candidates = Array.from({ length: 29 }, (_, i) => (i + 1) * 16);
  const breaks = new Map([['W01', { breaks: [144], manual: false, candidates }]]);

  it('só a parede selecionada tem pontos e pegas; as outras só desenham o traço', () => {
    const d = load(EXAMPLES[1]!.text);
    const { container } = render(<PlanCanvas geometry={planGeometry(d)} selection={{ kind: 'none' }} issuesByWall={new Map()} fitKey="t" onSelect={() => {}} onEndpointDrag={() => {}} breaks={breaks} onBreaksChange={() => {}} initialSize={SIZE} />);
    expect(container.querySelector('[data-panel-breaks="auto"]')).not.toBeNull();
    expect(container.querySelector('[data-break-candidate]')).toBeNull();
    expect(container.querySelector('[data-break-index]')).toBeNull();
  });

  it('clique num ponto acrescenta; arrastar a quebra vai ao candidato mais próximo; duplo clique tira', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    try {
      const d = load(EXAMPLES[1]!.text);
      const geometry = planGeometry(d);
      const w01 = geometry.walls.find((w) => w.wallId === 'W01')!;
      const onBreaksChange = vi.fn();
      const onDragEnd = vi.fn();
      const { container } = render(
        <PlanCanvas geometry={geometry} selection={{ kind: 'wall', wallId: 'W01' }} issuesByWall={new Map()} fitKey="t" onSelect={() => {}} onEndpointDrag={() => {}} breaks={breaks} onBreaksChange={onBreaksChange} onDragEnd={onDragEnd} initialSize={SIZE} />,
      );
      const svg = container.querySelector('[data-plan-canvas] svg')!;
      // O 144 já é quebra: não vira ponto.
      expect(container.querySelector('[data-break-candidate="144"]')).toBeNull();
      const dot = container.querySelector('[data-break-candidate="320"] circle')!;
      fireEvent.pointerDown(dot, pointer(0, 0));
      fireEvent.pointerUp(dot, pointer(0, 0));
      expect(onBreaksChange).toHaveBeenLastCalledWith('W01', [144, 320]);

      const start = handleAt(container, 'start');
      const end = handleAt(container, 'end');
      const scale = (end.x - start.x) / (w01.end.x - w01.start.x);
      const grip = container.querySelector('[data-break-index="0"] line')!;
      const x0 = Number(grip.getAttribute('x1'));
      const y0 = (Number(grip.getAttribute('y1')) + Number(grip.getAttribute('y2'))) / 2;
      fireEvent.pointerDown(grip, pointer(x0, y0));
      fireEvent.pointerMove(svg, pointer(x0 + 20.4 * scale, y0 + 15));
      act(() => void vi.advanceTimersToNextFrame());
      expect(onBreaksChange).toHaveBeenLastCalledWith('W01', [160], expect.any(String));
      expect(container.textContent).toContain(`break 13'-4"`);
      fireEvent.pointerUp(svg, pointer(x0 + 20.4 * scale, y0));
      expect(onDragEnd).toHaveBeenCalledTimes(1);

      fireEvent.doubleClick(grip);
      expect(onBreaksChange).toHaveBeenLastCalledWith('W01', []);
    } finally {
      vi.useRealTimers();
    }
  });
});

/** S30: seleção múltipla, arraste do corpo da seleção e "Draw wall". */
describe('PlanCanvas: produtividade (S30)', () => {
  const at = (geometry: ReturnType<typeof planGeometry>, p: { x: number; y: number }): { x: number; y: number } => planToScreen(fitViewport(geometry.bounds!, SIZE, 40), p);

  it('Shift+clique põe e tira a parede da seleção', () => {
    const d = load(EXAMPLES[1]!.text);
    const onSelect = vi.fn();
    const { container } = render(<PlanCanvas geometry={planGeometry(d)} selection={{ kind: 'wall', wallId: 'W01' }} issuesByWall={new Map()} fitKey="t" onSelect={onSelect} initialSize={SIZE} />);
    const w03 = container.querySelector('[data-wall-id="W03"] .wall-body')!;
    fireEvent.pointerDown(w03, pointer(100, 100));
    fireEvent.pointerUp(w03, pointer(100, 100, { shiftKey: true }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'walls', wallIds: ['W01', 'W03'] });
    const w01 = container.querySelector('[data-wall-id="W01"] .wall-body')!;
    fireEvent.pointerDown(w01, pointer(100, 100));
    fireEvent.pointerUp(w01, pointer(100, 100, { ctrlKey: true }));
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'none' });
  });

  it('arrastar o corpo de uma parede selecionada move a seleção inteira com snap de 1" (uma transação); parede não selecionada faz pan', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    try {
      const d = load(EXAMPLES[1]!.text);
      const geometry = planGeometry(d);
      const scale = fitViewport(geometry.bounds!, SIZE, 40).scale;
      const onWallsMove = vi.fn();
      const onDragEnd = vi.fn();
      const { container } = render(
        <PlanCanvas geometry={geometry} selection={{ kind: 'walls', wallIds: ['W01', 'W05'] }} issuesByWall={new Map()} fitKey="t" onSelect={() => {}} onEndpointDrag={() => {}} onWallsMove={onWallsMove} onDragEnd={onDragEnd} initialSize={SIZE} />,
      );
      expect(container.querySelector('[data-handle]')).toBeNull(); // alças só com uma parede
      const svg = container.querySelector('[data-plan-canvas] svg')!;
      const body = container.querySelector('[data-wall-id="W05"] .wall-body')!;
      const from = at(geometry, { x: 264, y: 100 });
      fireEvent.pointerDown(body, pointer(from.x, from.y));
      fireEvent.pointerMove(svg, pointer(from.x + 12.3 * scale, from.y - 2.4 * scale));
      act(() => void vi.advanceTimersToNextFrame());
      expect(onWallsMove).toHaveBeenCalledTimes(1);
      const [ids, dx, dy, txn] = onWallsMove.mock.calls[0]!;
      expect([ids, dx, dy]).toEqual([['W01', 'W05'], 12, 2]);
      expect(container.textContent).toContain(`move 1'-0", 2"`);
      // O segundo quadro manda só o que falta (o draft já andou o primeiro).
      fireEvent.pointerMove(svg, pointer(from.x + 24.2 * scale, from.y - 2.4 * scale));
      act(() => void vi.advanceTimersToNextFrame());
      expect(onWallsMove.mock.calls[1]!.slice(1)).toEqual([12, 0, txn]);
      fireEvent.pointerUp(svg, pointer(from.x + 24.2 * scale, from.y));
      expect(onDragEnd).toHaveBeenCalledTimes(1);

      onWallsMove.mockClear();
      const other = container.querySelector('[data-wall-id="W03"] .wall-body')!;
      fireEvent.pointerDown(other, pointer(300, 50));
      fireEvent.pointerMove(svg, pointer(340, 80));
      act(() => void vi.advanceTimersToNextFrame());
      fireEvent.pointerUp(svg, pointer(340, 80));
      expect(onWallsMove).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('setas movem todas as paredes selecionadas', () => {
    const d = load(EXAMPLES[1]!.text);
    const onWallsMove = vi.fn();
    const { container } = render(<PlanCanvas geometry={planGeometry(d)} selection={{ kind: 'walls', wallIds: ['W02', 'W04'] }} issuesByWall={new Map()} fitKey="t" onSelect={() => {}} onWallsMove={onWallsMove} initialSize={SIZE} />);
    const svg = container.querySelector('[data-plan-canvas] svg')!;
    fireEvent.keyDown(svg, { key: 'ArrowLeft', altKey: true });
    expect(onWallsMove).toHaveBeenCalledWith(['W02', 'W04'], -12, 0, expect.any(String));
  });

  it('"Draw wall": dois cliques com snap na ponta e ortogonal criam a parede; a próxima começa no fim; Esc solta a ponta', () => {
    const d = load(EXAMPLES[1]!.text);
    const geometry = planGeometry(d);
    const onDrawWall = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(<PlanCanvas geometry={geometry} selection={{ kind: 'none' }} issuesByWall={new Map()} fitKey="t" onSelect={onSelect} onEndpointDrag={() => {}} onDrawWall={onDrawWall} initialSize={SIZE} />);
    const svg = container.querySelector('[data-plan-canvas] svg')!;
    expect(svg.getAttribute('data-drawing')).toBe('true');
    const click = (p: { x: number; y: number }): void => {
      fireEvent.pointerDown(svg, pointer(p.x, p.y));
      fireEvent.pointerUp(svg, pointer(p.x, p.y));
    };
    // Perto do fim da W01 (480, 0): gruda na ponta.
    click(at(geometry, { x: 478.5, y: 1.5 }));
    expect(onSelect).not.toHaveBeenCalled();
    // Segundo clique torto: sai ortogonal (y da âncora), x gruda no eixo da W05 (x = 264).
    const end = at(geometry, { x: 265.5, y: 9 });
    fireEvent.pointerMove(svg, pointer(end.x, end.y));
    expect(container.querySelector('[data-draw-preview]')).not.toBeNull();
    click(end);
    expect(onDrawWall).toHaveBeenCalledWith({ x: 480, y: 0 }, { x: 264, y: 0 });
    click(at(geometry, { x: 264, y: 100.2 }));
    expect(onDrawWall).toHaveBeenLastCalledWith({ x: 264, y: 0 }, { x: 264, y: 100 });
    fireEvent.keyDown(svg, { key: 'Escape' });
    click(at(geometry, { x: 100.4, y: 200 }));
    expect(onDrawWall).toHaveBeenCalledTimes(2); // Esc soltou a ponta: este clique é um começo
  });
});
