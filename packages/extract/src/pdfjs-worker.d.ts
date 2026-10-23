/** O pacote não publica tipos para o worker; só o que `pdf.ts` usa (ver o comentário lá). */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
