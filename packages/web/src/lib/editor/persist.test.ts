import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { clearJob, clearSession, describeAge, JOB_KEY, JOB_MAX_AGE_MS, latestSession, loadJob, loadSession, pruneSessions, saveJob, saveSession, SESSION_KEY, SESSION_MAX_AGE_MS, sessionFromState, sessionKey, unsavedEdits, type StorageLike } from './persist';
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
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
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
      get length(): number {
        throw new Error('blocked');
      },
      key: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSession(broken)).toBeUndefined();
    expect(() => clearSession(broken)).not.toThrow();
    expect(() => saveJob(broken, { startedAt: 1, files: [] })).not.toThrow();
    expect(latestSession(broken, NOW)).toBeUndefined();
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

describe('persist: projeto salvo no servidor (S22.1)', () => {
  it('a sessão lembra id e revisão, e ignora um projeto malformado', () => {
    const storage = new MemoryStorage();
    const state = editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source: 'sample' });
    const session = sessionFromState(state, undefined, NOW, { id: 'p1', revision: 3 });
    expect(session?.project).toEqual({ id: 'p1', revision: 3 });
    expect(sessionFromState(state, undefined, NOW)?.project).toBeUndefined();
    saveSession(storage, session!);
    expect(loadSession(storage, sessionKey('p1'))?.project).toEqual({ id: 'p1', revision: 3 });
    storage.setItem(SESSION_KEY, JSON.stringify({ ...session, project: { id: 'p1', revision: 0 } }));
    expect(loadSession(storage)?.project).toBeUndefined();
    storage.setItem(SESSION_KEY, JSON.stringify({ ...session, project: 'p1' }));
    expect(loadSession(storage)?.project).toBeUndefined();
  });
});

describe('persist: uma sessão por projeto (S23, A6)', () => {
  const state = editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source: 'sample' });

  it('abrir outro projeto não sobrescreve a sessão do primeiro; o banner oferece a mais recente', () => {
    const storage = new MemoryStorage();
    saveSession(storage, sessionFromState(state, undefined, NOW - 2000, { id: 'a', revision: 1 })!);
    saveSession(storage, sessionFromState(state, undefined, NOW - 1000)!);
    saveSession(storage, sessionFromState(state, undefined, NOW - 3000, { id: 'b', revision: 4 })!);
    expect(loadSession(storage, sessionKey('a'))?.project?.id).toBe('a');
    expect(loadSession(storage, sessionKey('b'))?.project?.id).toBe('b');
    expect(loadSession(storage)?.project).toBeUndefined();
    expect(latestSession(storage, NOW)?.savedAt).toBe(NOW - 1000);
    clearSession(storage);
    expect(latestSession(storage, NOW)?.project?.id).toBe('a');
  });

  it('limpeza por idade: sessão velha ou ilegível sai; outras chaves do storage ficam', () => {
    const storage = new MemoryStorage();
    storage.setItem(JOB_KEY, '{}');
    storage.setItem('other.app', 'x');
    saveSession(storage, sessionFromState(state, undefined, NOW - SESSION_MAX_AGE_MS - 1, { id: 'old', revision: 1 })!);
    saveSession(storage, sessionFromState(state, undefined, NOW - 60_000, { id: 'new', revision: 1 })!);
    storage.setItem(sessionKey('lixo'), '{');
    expect(pruneSessions(storage, NOW)).toBe(2);
    expect([...storage.map.keys()].sort()).toEqual([JOB_KEY, 'other.app', sessionKey('new')].sort());
    expect(latestSession(storage, NOW + SESSION_MAX_AGE_MS)).toBeUndefined();
  });

  it('quota estourada: as outras sessões saem (a mais velha primeiro) antes de perder a leitura', () => {
    const storage = new MemoryStorage();
    const big = sessionFromState(state, reading, NOW, { id: 'big', revision: 1 })!;
    saveSession(storage, sessionFromState(state, undefined, NOW - 5000, { id: 'a', revision: 1 })!);
    saveSession(storage, sessionFromState(state, undefined, NOW - 1000, { id: 'b', revision: 1 })!);
    // Cabe uma sessão grande, mas não com as duas pequenas: o storage do fake conta o total.
    const total = (): number => [...storage.map.values()].reduce((n, v) => n + v.length, 0);
    const room = total() + JSON.stringify(big).length - storage.getItem(sessionKey('a'))!.length;
    storage.setItem = function (this: MemoryStorage, key: string, value: string): void {
      const without = total() - (this.map.get(key)?.length ?? 0);
      if (without + value.length > room) throw new DOMException('quota', 'QuotaExceededError');
      this.map.set(key, value);
    };
    expect(saveSession(storage, big)).toBe('full');
    expect(storage.getItem(sessionKey('a'))).toBeNull();
    expect(storage.getItem(sessionKey('b'))).not.toBeNull();
    expect(loadSession(storage, sessionKey('big'))?.reading).toBeDefined();
  });
});

describe('persist: retomada da leitura (S23, A1)', () => {
  it('o jobId vai e volta; job de antes da S23 (sem id) volta sem ele', () => {
    const storage = new MemoryStorage();
    const job = { jobId: 'job-123', startedAt: NOW - 60_000, files: [{ name: 'A-100.pdf', size: 1000 }] };
    saveJob(storage, { ...job, resumed: true } as typeof job);
    expect(loadJob(storage, NOW)).toEqual(job);
    storage.setItem(JOB_KEY, JSON.stringify({ startedAt: NOW, files: [] }));
    expect(loadJob(storage, NOW)).toEqual({ startedAt: NOW, files: [] });
    storage.setItem(JOB_KEY, JSON.stringify({ jobId: 7, startedAt: NOW, files: [] }));
    expect(loadJob(storage, NOW)?.jobId).toBeUndefined();
  });
});

describe('persist: edições que o servidor não tem (S23, A9)', () => {
  it('mesma revisão e texto diferente: volta a sessão; revisão nova no servidor ou texto igual: vale o servidor', () => {
    const storage = new MemoryStorage();
    const base = editorReducer(initialEditorState, { type: 'load', text: EXAMPLES[1]!.text, source: 'file' });
    const edited = editorReducer(base, { type: 'removeWall', wallId: base.draft!.walls[0]!.id });
    saveSession(storage, sessionFromState(edited, undefined, NOW, { id: 'p1', revision: 3 })!);
    expect(unsavedEdits(storage, 'p1', 3, EXAMPLES[1]!.text)?.text).toBe(sessionFromState(edited, undefined, NOW)!.text);
    expect(unsavedEdits(storage, 'p1', 4, EXAMPLES[1]!.text)).toBeUndefined();
    expect(unsavedEdits(storage, 'p2', 3, EXAMPLES[1]!.text)).toBeUndefined();
    saveSession(storage, sessionFromState(base, undefined, NOW, { id: 'p1', revision: 3 })!);
    expect(unsavedEdits(storage, 'p1', 3, EXAMPLES[1]!.text)).toBeUndefined();
  });
});
