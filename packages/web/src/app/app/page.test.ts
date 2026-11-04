import { describe, expect, it, vi } from 'vitest';
// `server-only` só serve para o bundler do Next; no vitest vira módulo vazio.
vi.mock('server-only', () => ({}));
import * as page from './page';

describe('/app (Server Component)', () => {
  it('é renderizada a cada request, nunca pré-renderizada no build', () => {
    // Sem isto, um build sem variáveis de ambiente (a imagem do Cloud Run) congela "AI reading is off" e
    // o header sem usuário no HTML estático. Regressão vista em 2026-10-30.
    expect(page.dynamic).toBe('force-dynamic');
  });
});
