/**
 * Cliente HTTP único do app (docs/10-design.md §7): ky, usado só dentro de services e só onde há HTTP de
 * verdade (APIs externas; Supabase na S22). Motor e extração rodam em processo. Erros HTTP viram
 * `ServiceError` com status e corpo, para o `handleServerError` traduzir.
 */

import ky, { HTTPError, TimeoutError, type KyInstance, type Options } from 'ky';

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export const HTTP_DEFAULTS: Options = {
  timeout: 30_000,
  retry: { limit: 2, methods: ['get', 'put', 'head', 'delete', 'options', 'trace'] },
  hooks: {
    beforeError: [
      async (error) => {
        if (error instanceof HTTPError) {
          let body: unknown;
          try {
            body = await error.response.clone().json();
          } catch {
            body = await error.response.clone().text().catch(() => undefined);
          }
          const message = `HTTP ${error.response.status} ${error.request.method} ${error.request.url}`;
          return Object.assign(error, { serviceError: new ServiceError(message, error.response.status, body) });
        }
        return error;
      },
    ],
  },
};

/** Instância base. Services derivam com `http.extend({ prefixUrl })`. */
export const http: KyInstance = ky.create(HTTP_DEFAULTS);

/** Converte qualquer erro do ky em `ServiceError`; outros erros passam adiante. */
export function toServiceError(e: unknown): ServiceError | undefined {
  if (e instanceof ServiceError) return e;
  if (typeof e === 'object' && e !== null && 'serviceError' in e) return (e as { serviceError: ServiceError }).serviceError;
  if (e instanceof HTTPError) return new ServiceError(`HTTP ${e.response.status}`, e.response.status);
  if (e instanceof TimeoutError) return new ServiceError('request timed out');
  return undefined;
}
