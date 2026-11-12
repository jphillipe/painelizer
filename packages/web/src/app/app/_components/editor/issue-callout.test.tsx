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

  it('S50: aviso revisado leva a etiqueta "Reviewed" e "Undo review"; aviso por revisar oferece "Mark as reviewed"; problema, nada', () => {
    const reviewed = renderToStaticMarkup(
      <IssueCallout issues={[{ ...cripples, reviewed: true }]} onReview={() => {}} />,
    );
    expect(reviewed).toContain('>Reviewed</span>');
    expect(reviewed).toContain('Undo review');
    expect(reviewed).not.toContain('Mark as reviewed');
    const pending = renderToStaticMarkup(<IssueCallout issues={[cripples]} onReview={() => {}} />);
    expect(pending).toContain('Mark as reviewed');
    expect(pending).not.toContain('>Reviewed</span>');
    const problem = renderToStaticMarkup(
      <IssueCallout issues={[{ ...cripples, severity: 'problem', code: 'HEADER_OUT_OF_TABLE' }]} onReview={() => {}} />,
    );
    expect(problem).not.toContain('Mark as reviewed');
    expect(renderToStaticMarkup(<IssueCallout issues={[cripples]} />)).not.toContain('Mark as reviewed');
  });

  it('sem issues não renderiza nada', () => {
    expect(renderToStaticMarkup(<IssueCallout issues={[]} />)).toBe('');
  });
});
