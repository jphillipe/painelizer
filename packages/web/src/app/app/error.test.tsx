import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AppErrorPage from './error';

/** S23 (A9): erro no editor tem boundary próprio, que manda recarregar (a sessão foi gravada ao desmontar). */
describe('app/app/error.tsx', () => {
  it('promete o trabalho salvo, mostra a mensagem e oferece Reload e a lista de projetos', () => {
    const html = renderToStaticMarkup(<AppErrorPage error={Object.assign(new Error('boom'), { digest: 'd1' })} reset={() => {}} />);
    expect(html).toContain('Reload — your work is saved');
    expect(html).toContain('boom');
    expect(html).toContain('d1');
    expect(html).toMatch(/<button[^>]*>.*Reload<\/button>/);
    expect(html).toContain('href="/app/projects"');
  });
});
