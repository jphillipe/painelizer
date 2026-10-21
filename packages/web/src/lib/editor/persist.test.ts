import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { clearJob, clearSession, describeAge, JOB_KEY, JOB_MAX_AGE_MS, loadJob, loadSession, saveJob, saveSession, SESSION_KEY, sessionFromState, type StorageLike } from './persist';
import type { Reading } from './project-file';
import { editorReducer, initialEditorState } from './state';

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  limit = Infinity;
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (value.length > this.limit) throw new DOMException('quota', 'QuotaExceededError');
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const reading = { ok: true, projectName: 'Lido', walls: [], model: 'm', report: '#'.repeat(5000) } as unknown as Reading;
const NOW = 1_760_000_000_000;

describe('persist: sessão do editor', () => {
  it('sessão sai do estado (texto do draft, origem, dirty, leitura) e volta igual', () => {
    const s = editorReducer(editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source: 'sample' }), { type: 'removeWall', wallId: 'W05' });
    const session = sessionFromState(s, reading, NOW);
    expect(session).toMatchObject({ version: 1, savedAt: NOW, name: 'Casa 28x40 (visão)', source: 'sample', dirty: true });
    const storage = new MemoryStorage();
    expect(saveSession(storage, session!)).toBe('full');
    const back = loadSession(storage);
    expect(back).toEqual(session);
    // Reabrir pelo mesmo `load` do editor: 4 paredes, marcado como editado.
    const restored = editorReducer(initialEditorState, { type: 'load', text: back!.text, source: back!.source, dirty: back!.dirty });
    expect(restored.draft?.walls).toHaveLength(4);
    expect(restored.dirty).toBe(true);
  });

  it('sem draft não há sessão; clear apaga', () => {
    expect(sessionFromState(initialEditorState, undefined, NOW)).toBeUndefined();
    const storage = new MemoryStorage();
    storage.setItem(SESSION_KEY, 'x');
    clearSession(storage);
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it('quota estourada: grava sem a leitura; se nem assim couber, falha sem lançar', () => {
    const s = editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source: 'extraction' });
    const session = sessionFromState(s, reading, NOW)!;
    const storage = new MemoryStorage();
    storage.limit = JSON.stringify(session).length - 1;
    expect(saveSession(storage, session)).toBe('without-reading');
    expect(loadSession(storage)?.reading).toBeUndefined();
    expect(loadSession(storage)?.text).toBe(session.text);
    storage.limit = 10;
    expect(saveSession(storage, session)).toBe('failed');
  });

  it('lixo no storage é ignorado', () => {
    const storage = new MemoryStorage();
    for (const bad of ['{', 'null', '[]', '{"version":2}', '{"version":1,"savedAt":1,"text":"{}","name":"x","source":"nope"}']) {
      storage.setItem(SESSION_KEY, bad);
      expect(loadSession(storage), bad).toBeUndefined();
    }
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSession(broken)).toBeUndefined();
    expect(() => clearSession(broken)).not.toThrow();
    expect(() => saveJob(broken, { startedAt: 1, files: [] })).not.toThrow();
  });
});

describe('persist: job de extração em voo', () => {
  it('volta enquanto é novo; some depois de uma hora ou quando limpo', () => {
    const storage = new MemoryStorage();
    const job = { startedAt: NOW - 5 * 60_000, files: [{ name: 'A-100.pdf', size: 1000 }] };
    saveJob(storage, job);
    expect(loadJob(storage, NOW)).toEqual(job);
    expect(loadJob(storage, NOW + JOB_MAX_AGE_MS + 1)).toBeUndefined();
    clearJob(storage);
    expect(storage.getItem(JOB_KEY)).toBeNull();
    storage.setItem(JOB_KEY, '{"startedAt":"x"}');
    expect(loadJob(storage, NOW)).toBeUndefined();
  });
});

describe('describeAge', () => {
  it('fala em segundos, minutos, horas e dias', () => {
    expect(describeAge(NOW - 10_000, NOW)).toBe('just now');
    expect(describeAge(NOW - 5 * 60_000, NOW)).toBe('5 min ago');
    expect(describeAge(NOW - 3 * 3_600_000, NOW)).toBe('3 h ago');
    expect(describeAge(NOW - 26 * 3_600_000, NOW)).toBe('1 day ago');
    expect(describeAge(NOW - 50 * 3_600_000, NOW)).toBe('2 days ago');
    expect(describeAge(NOW + 1000, NOW)).toBe('just now');
  });
});
