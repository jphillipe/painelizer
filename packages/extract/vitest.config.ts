import { defineConfig } from 'vitest/config';

/**
 * S23: a 1ª rodada fria carrega o pdf.js (~9 s em `buildRequest` e no `--dry-run`) e estourava os 5 s padrão,
 * derrubando o deploy (que roda `pnpm test`) por motivo alheio ao commit. A extração real tem timeout próprio.
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
});
