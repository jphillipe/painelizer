import { cn } from "cn"

/** Carregando: bloco papel-3 pulsando (docs/10-design.md §3), nunca dourado. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-paper-3", className)}
      {...props}
    />
  )
}

export { Skeleton }
