import { describe, expect, it } from 'vitest';
import { createProjectSchema, PROJECT_TEXT_MAX, saveProjectSchema } from './project';

describe('schemas de projeto (S23, A9: limite de tamanho)', () => {
  const id = '6f1c2b8e-4a5d-4c3b-9e2f-1a2b3c4d5e6f';

  it('aceita até o teto e recusa acima dele, na criação e na gravação', () => {
    const fits = `{"a":"${'x'.repeat(PROJECT_TEXT_MAX - 8)}"}`;
    expect(fits.length).toBe(PROJECT_TEXT_MAX);
    expect(saveProjectSchema.safeParse({ id, revision: 1, text: fits }).success).toBe(true);
    const tooBig = `${fits} `;
    const save = saveProjectSchema.safeParse({ id, revision: 1, text: tooBig });
    expect(save.success).toBe(false);
    expect(save.error?.issues[0]?.message).toContain('too large');
    expect(createProjectSchema.safeParse({ text: tooBig }).success).toBe(false);
  });
});
