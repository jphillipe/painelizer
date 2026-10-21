import { describe, expect, it } from 'vitest';
import { deleteAllowed, inEditableContext } from './use-editor-shortcuts';

const el = (tagName: string, inside: string[] = []): EventTarget => ({ tagName, closest: (sel: string) => (inside.some((s) => sel.includes(s)) ? ({} as Element) : null) }) as unknown as EventTarget;

describe('atalhos do editor: onde Delete vale (M2)', () => {
  it('apaga com foco em lugar nenhum ou na planta', () => {
    expect(deleteAllowed(null)).toBe(true);
    expect(deleteAllowed(el('BODY'))).toBe(true);
    expect(deleteAllowed(el('svg', ['data-plan-canvas']))).toBe(true);
    expect(deleteAllowed(el('rect', ['data-plan-canvas']))).toBe(true);
  });

  it('não apaga com um botão, uma linha da lista ou um summary em foco', () => {
    expect(deleteAllowed(el('BUTTON'))).toBe(false);
    expect(deleteAllowed(el('SUMMARY'))).toBe(false);
    expect(deleteAllowed(el('A'))).toBe(false);
  });

  it('campos, selects e diálogos desligam todos os atalhos', () => {
    expect(inEditableContext(el('INPUT'))).toBe(true);
    expect(inEditableContext(el('TEXTAREA'))).toBe(true);
    expect(inEditableContext(el('DIV', ['role="dialog"']))).toBe(true);
    expect(inEditableContext(el('BUTTON', ['role="combobox"']))).toBe(true);
    expect(inEditableContext(el('BUTTON'))).toBe(false);
    expect(inEditableContext(null)).toBe(false);
  });
});
