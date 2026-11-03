import { describe, expect, it, vi } from 'vitest';
// `server-only` só serve para o bundler do Next; no vitest vira módulo vazio.
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ supabaseServer: async () => undefined }));
import * as page from './page';

describe('/app/projects (Server Component, S22.2)', () => {
  it('é renderizada a cada request: a lista e o usuário vêm do banco, nunca do build', () => {
    expect(page.dynamic).toBe('force-dynamic');
  });
});
