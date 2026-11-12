/**
 * Revelar o campo que resolve uma issue (S47): o clique na lista de issues seleciona a parede / abertura e pede um
 * campo pelo `id` de DOM. Aqui só se mexe na tela — abrir a seção recolhida, rolar, focar e destacar; nada é editado.
 */

/** Quanto tempo o destaque (`data-field-focus`, estilo em `globals.css`) fica no campo. */
export const FIELD_FOCUS_MS = 1800;

/** Abre os `<details>` em volta do campo, rola até ele, põe o cursor nele e destaca a caixa por um instante. */
export function revealField(el: HTMLElement): void {
  for (
    let section = el.closest('details');
    section !== null;
    section = section.parentElement?.closest('details') ?? null
  )
    section.open = true;
  // jsdom não tem `scrollIntoView`; no navegador, o campo vai para o meio do painel.
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
  el.focus({ preventScroll: true });
  const box = el.closest<HTMLElement>('[data-field]') ?? el;
  box.setAttribute('data-field-focus', '');
  window.setTimeout(() => box.removeAttribute('data-field-focus'), FIELD_FOCUS_MS);
}

/**
 * Revela o primeiro dos `fieldIds` que estiver na tela. O inspetor e o diálogo de configurações renderizam depois da
 * seleção, então tenta de novo por um instante (`tries` × `delayMs`) antes de desistir em silêncio. Devolve o
 * cancelamento (para o `useEffect`).
 */
export function revealFirst(fieldIds: readonly string[], tries = 12, delayMs = 60): () => void {
  let left = tries;
  let timer: number | undefined;
  const attempt = (): void => {
    timer = undefined;
    for (const id of fieldIds) {
      const el = document.getElementById(id);
      if (el !== null) {
        revealField(el);
        return;
      }
    }
    left -= 1;
    if (left > 0) timer = window.setTimeout(attempt, delayMs);
  };
  timer = window.setTimeout(attempt, 0);
  return () => {
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
