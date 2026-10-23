/**
 * Mensagem de erro de servidor para a UI (docs/10-design.md §7). Erros de domínio voltam com a própria mensagem;
 * o resto vinha como "Something went wrong on the server", o que escondia a causa fora da máquina de
 * desenvolvimento (na Vercel só os logs a mostram). Ferramenta interna atrás de login: a mensagem leva o nome e
 * o texto do erro, curtos, para quem viu a falha poder relatar. O stack continua só no log do servidor.
 */

import { toServiceError } from './http';

const DOMAIN_ERRORS = new Set(['ProjectError', 'BuildError', 'ExtractError', 'SignedOutError']);
const MAX_DETAIL = 240;

export function describeServerError(e: unknown): string {
  const se = toServiceError(e);
  if (se) return se.message;
  if (e instanceof Error && DOMAIN_ERRORS.has(e.name)) return e.message;
  if (e instanceof Error) {
    const detail = `${e.name}: ${e.message}`.replace(/\s+/g, ' ').trim();
    return `Something went wrong on the server (${detail.length > MAX_DETAIL ? `${detail.slice(0, MAX_DETAIL)}…` : detail}).`;
  }
  return 'Something went wrong on the server.';
}
