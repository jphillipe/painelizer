/**
 * Cliente de server actions (docs/10-design.md §7). Toda action passa por aqui: valida a entrada com zod e
 * traduz erros conhecidos em mensagem para a UI. Problemas de projeto não chegam aqui: os services os
 * devolvem em `data` como `{ ok: false, problems }`.
 */

import { createSafeActionClient } from 'next-safe-action';
import { toServiceError } from './http';

export const actionClient = createSafeActionClient({
  handleServerError(e) {
    const se = toServiceError(e);
    if (se) return se.message;
    if (e instanceof Error && (e.name === 'ProjectError' || e.name === 'BuildError' || e.name === 'ExtractError')) {
      return e.message;
    }
    console.error(e);
    return 'Something went wrong on the server.';
  },
});
