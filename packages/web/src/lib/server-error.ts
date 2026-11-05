/**
 * Mensagem de erro de servidor para a UI (docs/10-design.md §7). Erros de domínio voltam com a própria mensagem;
 * o resto vinha como "Something went wrong on the server", o que escondia a causa fora da máquina de
 * desenvolvimento (no Cloud Run só os logs a mostram). Ferramenta interna atrás de login: a mensagem leva o nome e
 * o texto do erro, curtos, para quem viu a falha poder relatar. O stack continua só no log do servidor.
 */

import { toServiceError } from './http';
import { englishMessage, extractErrorMessage } from './messages.en';

/** Erros dos adaptadores do Supabase (S26): têm `code`; a frase vem do código, o texto do erro vai entre parênteses. */
const ADAPTER_ERRORS = new Set(['ProjectsTableError', 'DrawingsStoreError', 'ExtractJobsTableError']);

const DOMAIN_ERRORS = new Set(['ProjectError', 'BuildError', 'ExtractError', 'SignedOutError']);
const MAX_DETAIL = 240;

export function describeServerError(e: unknown): string {
  const se = toServiceError(e);
  if (se) return se.message;
  if (e instanceof Error && DOMAIN_ERRORS.has(e.name)) return domainMessage(e);
  if (e instanceof Error && ADAPTER_ERRORS.has(e.name) && typeof (e as { code?: unknown }).code === 'string') {
    const sentence = englishMessage({ code: (e as unknown as { code: string }).code }) ?? 'The database refused the request.';
    const detail = `${e.name}: ${e.message}`.replace(/\s+/g, ' ').trim();
    return `${sentence} (${detail.length > MAX_DETAIL ? `${detail.slice(0, MAX_DETAIL)}…` : detail})`;
  }
  if (e instanceof Error) {
    const detail = `${e.name}: ${e.message}`.replace(/\s+/g, ' ').trim();
    return `Something went wrong on the server (${detail.length > MAX_DETAIL ? `${detail.slice(0, MAX_DETAIL)}…` : detail}).`;
  }
  return 'Something went wrong on the server.';
}

/**
 * Erros de domínio com texto em português (parser, build, leitura): a frase sai do código (S26), nunca do texto.
 * `SignedOutError` já é inglês.
 */
function domainMessage(e: Error): string {
  const x = e as Error & { code?: string; params?: Record<string, unknown>; path?: string; problems?: unknown[] };
  if (e.name === 'ExtractError') return extractErrorMessage(x.code, x.params ?? {});
  if (e.name === 'ProjectError') return englishMessage({ code: 'PROJECT_INVALID', params: { path: x.path ?? 'the root' } }) ?? 'The project file is invalid.';
  if (e.name === 'BuildError') return `The project can’t be built (${x.problems?.length ?? 1} problem(s)).`;
  return e.message;
}
