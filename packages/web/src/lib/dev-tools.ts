/**
 * Ferramentas de desenvolvimento ("Advanced", M5): importar arquivo de projeto e resposta gravada do modelo. Ligadas
 * fora de produção ou com `PANELIZER_DEV_TOOLS=1`. A mesma regra decide a tela (props das páginas) e o servidor
 * (S23, A9): esconder o botão não basta — a action `finishResponse` é um POST que qualquer sessão logada alcança.
 */
export function devToolsEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env['NODE_ENV'] !== 'production' || env['PANELIZER_DEV_TOOLS'] === '1';
}
