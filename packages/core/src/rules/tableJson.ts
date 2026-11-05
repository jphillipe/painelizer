/**
 * Apoio à leitura das tabelas IRC digitadas em JSON (`headers.ts`, `kings.ts`): acumula erros de estrutura com
 * o caminho do campo. Chaves que começam com `$` são comentários e passam.
 */

export interface TableErrors {
  errors: string[];
  err: (path: string, msg: string) => void;
  isObj: (v: unknown) => v is Record<string, unknown>;
  /** Acusa cada chave de `o` fora de `allowed`. */
  keys: (path: string, o: Record<string, unknown>, allowed: string[]) => void;
}

export function tableErrors(): TableErrors {
  const errors: string[] = [];
  const err = (path: string, msg: string): void => {
    errors.push(`${path}: ${msg}`);
  };
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const keys = (path: string, o: Record<string, unknown>, allowed: string[]): void => {
    for (const k of Object.keys(o)) if (!k.startsWith('$') && !allowed.includes(k)) err(path, `unknown field "${k}"`);
  };
  return { errors, err, isObj, keys };
}
