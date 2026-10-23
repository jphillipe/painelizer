import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Esqueleto do passo 01 enquanto `/app` carrega (2026-10-23): aparece na navegação para cá (depois do login,
 * pela barra de passos, pelo header) até o servidor mandar a página. Mesma grade do `NewProjectView`: hero,
 * barra de passos, formulário à esquerda e card de prévia à direita, para nada pular quando o conteúdo chega.
 */
export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <header className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-2/3 max-w-xl" />
      </header>
      <div className="grid grid-cols-3 border-y border-line-faint">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-4">
            <Skeleton className="size-7 rounded-pill" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[5fr_7fr] lg:items-start">
        <Card className="gap-5 p-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="mt-2 h-5 w-28" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-48 rounded-pill" />
        </Card>
        <Card className="gap-0 overflow-hidden p-0">
          <Skeleton className="h-12 w-full rounded-none bg-navy-900/80" />
          <Skeleton className="aspect-[16/10] w-full rounded-none" />
          <div className="space-y-3 p-6">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </Card>
      </div>
      <p className="sr-only">Loading the project page…</p>
    </div>
  );
}
