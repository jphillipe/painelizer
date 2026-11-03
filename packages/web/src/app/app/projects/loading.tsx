import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto da lista de projetos (S22.2): cabeçalho, linha de contagem e seis linhas da tabela, na mesma grade da tela real. */
export default function ProjectsLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading projects">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-10 w-36 rounded-pill" />
      </header>
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <div className="rounded-md border bg-card">
          <div className="flex gap-6 border-b border-line px-4 py-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="ml-auto h-3 w-12" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-6 border-b border-line-faint px-4 py-3 last:border-0">
              <Skeleton className="h-4 w-56 max-w-[40%]" />
              <Skeleton className="ml-auto h-4 w-8" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="size-8 rounded-pill" />
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only">Loading the projects…</p>
    </div>
  );
}
