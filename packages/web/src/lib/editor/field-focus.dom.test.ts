// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD_FOCUS_MS, revealField, revealFirst } from './field-focus';

/** S47: revelar o campo que resolve uma issue — abrir a seção, focar e destacar por um instante. */
describe('revealField / revealFirst', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <details id="outer"><summary>Outer</summary>
        <details id="inner"><summary>Header and studs</summary>
          <div data-field id="box"><label for="o-D1-hby">Header</label><button id="o-D1-hby" type="button">IRC table</button></div>
          <input id="o-D1-offset" />
        </details>
      </details>`;
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  const details = (id: string): HTMLDetailsElement => document.getElementById(id) as HTMLDetailsElement;

  it('abre as seções recolhidas em volta, foca o campo e destaca a caixa dele por um instante', () => {
    const field = document.getElementById('o-D1-hby')!;
    expect([details('outer').open, details('inner').open]).toEqual([false, false]);
    revealField(field);
    expect([details('outer').open, details('inner').open]).toEqual([true, true]);
    expect(document.activeElement).toBe(field);
    const box = document.getElementById('box')!;
    expect(box.hasAttribute('data-field-focus')).toBe(true);
    vi.advanceTimersByTime(FIELD_FOCUS_MS);
    expect(box.hasAttribute('data-field-focus')).toBe(false);
  });

  it('campo sem caixa `data-field`: o destaque vai no próprio campo', () => {
    const field = document.getElementById('o-D1-offset')!;
    revealField(field);
    expect(field.hasAttribute('data-field-focus')).toBe(true);
    expect(document.activeElement).toBe(field);
  });

  it('revealFirst: o primeiro id que existir na tela (posição por borda quando não há o campo do eixo)', () => {
    revealFirst(['o-D1-center', 'o-D1-offset']);
    vi.advanceTimersByTime(0);
    expect(document.activeElement?.id).toBe('o-D1-offset');
  });

  it('revealFirst: espera o campo aparecer; se nunca aparece, desiste sem quebrar; cancelar para as tentativas', () => {
    revealFirst(['late']);
    vi.advanceTimersByTime(100);
    const late = document.createElement('input');
    late.id = 'late';
    document.body.append(late);
    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(late);

    late.blur();
    revealFirst(['never']);
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    expect(document.activeElement).toBe(document.body);

    const cancel = revealFirst(['later']);
    cancel();
    const later = document.createElement('input');
    later.id = 'later';
    document.body.append(later);
    vi.advanceTimersByTime(5000);
    expect(document.activeElement).toBe(document.body);
  });
});
