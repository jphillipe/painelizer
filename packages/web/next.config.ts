import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  // Pacotes do workspace cujos `exports` apontam para fontes .ts: o Next compila.
  transpilePackages: ['core', 'cli', 'extract'],
  // Ficam fora do bundle do servidor e rodam como no Node (pdfjs legacy, pdf-lib, SDK da Anthropic).
  // @napi-rs/canvas é nativo (recortes das plantas no extract): fora do bundle, rastreado como arquivo.
  serverExternalPackages: ['pdfjs-dist', 'pdf-lib', '@anthropic-ai/sdk', '@resvg/resvg-js', '@napi-rs/canvas'],
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // Deploy em container (Cloud Run, docs/12-hospedagem-cloud-run.md): `.next/standalone` leva só o que o rastreio
  // de arquivos lista, com o `server.js` em `packages/web/` por causa do `outputFileTracingRoot` no monorepo.
  output: 'standalone',
  experimental: {
    // Upload do PDF da planta por server action (S20.3).
    serverActions: { bodySizeLimit: '300mb' },
    // O proxy de login (src/proxy.ts, S22.0) guarda o corpo do pedido, e esse buffer tem teto próprio: 10 MB por
    // padrão. Acima disso o corpo chega truncado à action ("Unexpected end of form", 500) — visto com um conjunto
    // de 19,7 MB em 2026-11-03. Mesmo teto do serverActions; o do Cloud Run (32 MB por pedido) continua até a S22.3.
    proxyClientMaxBodySize: '300mb',
  },
};

export default config;
