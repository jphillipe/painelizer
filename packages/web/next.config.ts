import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  // Pacotes do workspace cujos `exports` apontam para fontes .ts: o Next compila.
  transpilePackages: ['core', 'cli', 'extract'],
  // Ficam fora do bundle do servidor e rodam como no Node (pdfjs legacy, pdf-lib, SDK da Anthropic).
  serverExternalPackages: ['pdfjs-dist', 'pdf-lib', '@anthropic-ai/sdk'],
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  experimental: {
    // Upload do PDF da planta por server action (S20.3).
    serverActions: { bodySizeLimit: '300mb' },
  },
};

export default config;
