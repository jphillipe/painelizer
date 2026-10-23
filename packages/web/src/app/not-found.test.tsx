import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AppLoading from './app/loading';
import NotFound from './not-found';

describe('404 e esqueletos de carregamento (2026-10-23)', () => {
  it('a página não encontrada leva ao app e ao login', () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain('404');
    expect(html).toContain('href="/app"');
    expect(html).toContain('href="/login"');
  });

  it('o esqueleto do /app é anunciado como carregando e tem a grade do passo 01', () => {
    const html = renderToStaticMarkup(<AppLoading />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('lg:grid-cols-[5fr_7fr]');
    expect((html.match(/data-slot="skeleton"/g) ?? []).length).toBeGreaterThan(10);
  });
});
