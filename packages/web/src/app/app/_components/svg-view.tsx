import { cn } from '@/lib/utils';

/** SVG gerado pelo core, inline (é código nosso). `.sheet svg` escala pela largura (globals.css). */
export function SvgView({ svg, label, className }: { svg: string; label: string; className?: string }) {
  return (
    <div
      className={cn('sheet overflow-hidden rounded-md border bg-paper-2 p-2', className)}
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
