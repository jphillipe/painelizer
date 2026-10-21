'use client';

import { useEffect, useState } from 'react';

/**
 * `matchMedia` como estado. Começa em `initial` (no servidor e no primeiro render) e acompanha a janela depois:
 * o workspace do editor (S21.4) escolhe entre três painéis e planta + abas por aqui, não por CSS, para não
 * renderizar o inspetor duas vezes (ids de campo repetidos).
 */
export function useMediaQuery(query: string, initial = true): boolean {
  const [matches, setMatches] = useState(initial);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = (): void => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Breakpoint `lg` do Tailwind: três painéis lado a lado a partir daqui. */
export const WIDE_QUERY = '(min-width: 1024px)';
