import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/*
 * docs/10-design.md §3. Status em **chip claro** (fundo a 10 %, texto na cor cheia, borda do tom): legível
 * (≥ 4,5:1) e sem gritar ao lado do papel. Texto 12px/600; códigos em mono ficam por conta de quem usa.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap transition-[color,background-color,border-color] duration-200 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        success: "border-ok/30 bg-ok/10 text-ok-700",
        warning: "border-gold-700/30 bg-gold-100 text-gold-700",
        destructive: "border-err/30 bg-err/10 text-err",
        outline: "border-border text-foreground",
        ghost: "",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
