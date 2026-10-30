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
  },
};

export default config;
