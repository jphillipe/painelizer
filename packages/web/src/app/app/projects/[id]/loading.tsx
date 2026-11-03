import { Skeleton } from '@/components/ui/skeleton';

/** Esqueleto do workspace enquanto o projeto vem do banco (S22.1): top bar e três colunas. */
export default function ProjectLoading() {
  return (
    <div className="flex min-h-[70vh] flex-1 flex-col" aria-busy aria-label="Loading project">
      <div className="flex items-center gap-3 border-b border-line bg-card px-[var(--gutter)] py-3">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-6 w-56" />
        <Skeleton className="ml-auto h-8 w-32" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 md:grid-cols-[260px_minmax(0,1fr)_320px]">
        <Skeleton className="hidden h-full min-h-64 md:block" />
        <Skeleton className="h-full min-h-64" />
        <Skeleton className="hidden h-full min-h-64 md:block" />
      </div>
    </div>
  );
}
