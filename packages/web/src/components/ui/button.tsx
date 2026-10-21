import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/*
 * docs/10-design.md §3. Foco vem do `:focus-visible` global (globals.css), não de anel próprio. Hover de
 * `outline`/`ghost` é papel-2 (dourado é só a ação principal). Todo tamanho é pill.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-pill text-[15px] font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-site disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-navy-700 hover:-translate-y-px active:translate-y-0",
        // Ação principal da tela: pill dourado com texto navy; no hover escurece e mantém o navy (5,1:1).
        accent: "bg-accent text-accent-foreground shadow-1 hover:bg-gold hover:-translate-y-px active:translate-y-0",
        destructive: "bg-destructive text-paper hover:bg-destructive/90",
        outline: "border bg-background shadow-xs hover:border-line-strong hover:bg-paper-2 hover:text-ink",
        secondary: "bg-secondary text-secondary-foreground hover:bg-paper-3",
        ghost: "hover:bg-paper-2 hover:text-ink",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2 has-[>svg]:px-4",
        xs: "h-6 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 text-sm has-[>svg]:px-3",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
