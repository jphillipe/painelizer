/** Mensagem de um erro qualquer (`Error.message`, senão o texto do valor) — um `catch` tipa o erro como `unknown`. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
