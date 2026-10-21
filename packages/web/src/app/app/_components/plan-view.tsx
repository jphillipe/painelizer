'use client';

import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { cn } from '@/lib/utils';

export interface PlanViewProps {
  svg: string;
  /** Painel destacado na planta. */
  selected?: string | undefined;
  /** Clique num painel (pelo `data-panel-id` que o core escreve na planta, M3). */
  onPanel?: ((panelId: string) => void) | undefined;
  className?: string;
}

/**
 * Planta de painéis do core (`plan.svg`) inline e **clicável** (M3): o core escreve um retângulo transparente com
 * `data-panel-id` sobre cada painel; aqui o clique abre a folha e o painel selecionado fica destacado (estilos em
 * globals.css, `.plan`). O SVG não muda: é a mesma planta do zip.
 */
export function PlanView({ svg, selected, onPanel, className }: PlanViewProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Destaque do painel selecionado: atributo no próprio rect do SVG (o markup vem como string).
  useEffect(() => {
    const root = ref.current;
    if (root === null) return;
    for (const el of root.querySelectorAll('[data-selected]')) el.removeAttribute('data-selected');
    if (selected !== undefined) {
      for (const el of root.querySelectorAll(`rect.panel-hit[data-panel-id="${CSS.escape(selected)}"]`)) el.setAttribute('data-selected', '');
    }
  }, [selected, svg]);

  const onClick = (e: ReactMouseEvent<HTMLDivElement>): void => {
    if (onPanel === undefined) return;
    const el = e.target instanceof Element ? e.target.closest('[data-panel-id]') : null;
    const id = el?.getAttribute('data-panel-id');
    if (id !== null && id !== undefined) onPanel(id);
  };

  return (
    <div
      ref={ref}
      className={cn('plan overflow-hidden rounded-md border bg-paper-2 p-2', onPanel !== undefined && 'plan-clickable', className)}
      role="img"
      aria-label="Panel plan"
      title={onPanel === undefined ? undefined : 'Click a panel to open its sheet'}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
