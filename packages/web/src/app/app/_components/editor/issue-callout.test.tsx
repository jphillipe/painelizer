import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Issue } from '@/lib/editor/problems';
import { IssueCallout } from './issue-callout';

/** S46: o aviso que a fábrica resolve sozinha não acende a parede, mas continua no inspetor, com a etiqueta do nível. */
describe('IssueCallout (SSR)', () => {
  const overlap: Issue = {
    severity: 'warning',
    source: 'engine',
    code: 'STUDS_OVERLAP',
    text: 'x',
    wallId: 'W1',
    panelId: '1-W1-P1',
    params: { overlap: 0.375 },
  };
  const cripples: Issue = {
    severity: 'warning',
    source: 'engine',
    code: 'FLAT_HEADER_CRIPPLES',
    text: 'y',
    wallId: 'W1',
    openingId: 'D1',
    params: { top: 83, gap: 24.125, topPlate: 107.125, max: 24 },
  };

  it('aviso "fine to leave" leva a etiqueta; aviso que pede decisão não', () => {
    const fine = renderToStaticMarkup(<IssueCallout issues={[overlap]} />);
    expect(fine).toContain('Studs overlap');
    // a etiqueta do nível, além da frase da ajuda (que também começa com "Fine to leave")
    expect(fine).toContain('>Fine to leave</span>');
    const review = renderToStaticMarkup(<IssueCallout issues={[cripples]} />);
    expect(review).toContain('Flat header framed with cripples');
    expect(review).not.toContain('Fine to leave');
  });

  it('sem issues não renderiza nada', () => {
    expect(renderToStaticMarkup(<IssueCallout issues={[]} />)).toBe('');
  });
});
