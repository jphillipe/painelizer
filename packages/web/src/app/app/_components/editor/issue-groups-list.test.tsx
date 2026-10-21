import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { groupIssues } from '@/lib/editor/issue-groups';
import { parseWarning, type IdIndex, type Issue } from '@/lib/editor/problems';
import { IssueGroupsList } from './issue-groups-list';

const ids: IdIndex = { walls: Array.from({ length: 30 }, (_, i) => `W${i + 1}`), openings: new Map([['W1', ['W1-1']]]) };

/** Smoke test sem navegador: 30 issues iguais viram uma linha com chips; grupo de um item vira link direto. */
describe('IssueGroupsList (SSR)', () => {
  it('agrupa, mostra a ação e guarda os textos originais em Details', () => {
    const issues: Issue[] = ids.walls.map((w) => ({ severity: 'problem', source: 'draft', kind: 'wall.height', text: `wall ${w}: height is missing`, wallId: w }));
    const html = renderToStaticMarkup(<IssueGroupsList groups={groupIssues(issues, ids)} stale={false} checking={false} selection={{ kind: 'none' }} onSelect={() => {}} onAction={() => {}} />);
    expect(html.match(/Wall height is missing/g)).toHaveLength(1);
    expect(html).toContain('× 30');
    expect(html).toContain('Fill in project data');
    expect(html.match(/<button[^>]*>W\d+<\/button>/g)).toHaveLength(30);
    expect(html).toContain('<details');
    expect(html).toContain('wall W17: height is missing');
  });

  it('aviso da extração: título em inglês clicável e o texto cru nos detalhes; vazio diz "No problems"', () => {
    const w = parseWarning('extração ABERTURA_SEM_POSICAO: parede W1, abertura W1-1 (W2): a leitura não achou a cota do eixo', ids);
    const html = renderToStaticMarkup(<IssueGroupsList groups={groupIssues([w], ids)} stale={false} checking={false} selection={{ kind: 'wall', wallId: 'W1' }} onSelect={() => {}} onAction={() => {}} />);
    expect(html).toContain('Opening position not found in the drawing');
    expect(html).toContain('a leitura não achou');
    expect(html).not.toContain('Fill in project data');
    const empty = renderToStaticMarkup(<IssueGroupsList groups={[]} stale={false} checking={false} selection={{ kind: 'none' }} onSelect={() => {}} onAction={() => {}} />);
    expect(empty).toContain('No problems');
  });
});
