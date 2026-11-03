import { describe, expect, it } from 'vitest';
import { canSave, describeSave, projectIdFromPath, projectPath, statusAfterSave } from './project-sync';

describe('project-sync (S22.1, puro)', () => {
  it('URL de cada passo e o id de volta', () => {
    expect(projectPath('abc')).toBe('/app/projects/abc');
    expect(projectPath('abc', 3)).toBe('/app/projects/abc/panels');
    expect(projectIdFromPath('/app/projects/abc')).toBe('abc');
    expect(projectIdFromPath('/app/projects/abc/panels')).toBe('abc');
    expect(projectIdFromPath('/app')).toBeUndefined();
    expect(projectIdFromPath('/app/projects')).toBeUndefined();
  });

  it('resultado da gravação → estado do chip', () => {
    const now = 1_700_000_000_000;
    expect(statusAfterSave({ ok: true, revision: 3, savedAt: '2026-11-03T10:00:00Z' }, undefined, now)).toEqual({ kind: 'saved', at: Date.parse('2026-11-03T10:00:00Z') });
    expect(statusAfterSave({ ok: false, reason: 'conflict', revision: 5, updatedAt: 'x', message: 'edited elsewhere' }, undefined, now)).toEqual({ kind: 'conflict', message: 'edited elsewhere', revision: 5 });
    expect(statusAfterSave({ ok: false, reason: 'not_found', message: 'gone' }, undefined, now)).toEqual({ kind: 'deleted', message: 'gone' });
    expect(statusAfterSave({ ok: false, reason: 'unconfigured', message: 'x' }, undefined, now)).toEqual({ kind: 'local' });
    expect(statusAfterSave({ ok: false, reason: 'failed', message: 'boom' }, undefined, now)).toEqual({ kind: 'error', message: 'boom' });
    expect(statusAfterSave(undefined, 'Sign in to continue.', now)).toEqual({ kind: 'error', message: 'Sign in to continue.' });
    expect(statusAfterSave(undefined, undefined, now)).toMatchObject({ kind: 'error' });
  });

  it('conflito e apagado param o auto-save; erro e salvo não', () => {
    expect(canSave({ kind: 'saved', at: 1 })).toBe(true);
    expect(canSave({ kind: 'error', message: 'x' })).toBe(true);
    expect(canSave({ kind: 'saving' })).toBe(true);
    expect(canSave({ kind: 'conflict', message: 'x', revision: 2 })).toBe(false);
    expect(canSave({ kind: 'deleted', message: 'x' })).toBe(false);
    expect(canSave({ kind: 'local' })).toBe(false);
  });

  it('rótulos do chip', () => {
    const now = 1_700_000_000_000;
    expect(describeSave({ kind: 'saved', at: now - 10_000 }, now)).toEqual({ text: 'Saved · just now', tone: 'ok' });
    expect(describeSave({ kind: 'saved', at: now - 5 * 60_000 }, now).text).toBe('Saved · 5 min ago');
    expect(describeSave({ kind: 'saving' }, now)).toEqual({ text: 'Saving…', tone: 'busy' });
    expect(describeSave({ kind: 'conflict', message: 'x', revision: 2 }, now)).toEqual({ text: 'Edited elsewhere', tone: 'warning' });
    expect(describeSave({ kind: 'error', message: 'x' }, now).tone).toBe('error');
    expect(describeSave({ kind: 'local' }, now).tone).toBe('muted');
  });
});
