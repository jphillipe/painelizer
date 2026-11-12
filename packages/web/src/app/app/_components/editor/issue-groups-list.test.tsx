import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { groupIssues, type OpeningInfo } from '@/lib/editor/issue-groups';
import { issueFromNotice, type IdIndex, type Issue } from '@/lib/editor/problems';
import type { Notice } from '@/types/panels';
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

  it('aviso da extração: título e frase em inglês; o texto cru só nos detalhes; vazio diz "No problems"', () => {
    const w = issueFromNotice({ source: 'extraction', code: 'OPENING_UNPLACED', message: 'parede W1, abertura W1-1 (W2): a leitura não achou a cota do eixo', wallId: 'W1', openingId: 'W1-1', params: { tag: 'W2' } }, 'warning', ids);
    const html = renderToStaticMarkup(<IssueGroupsList groups={groupIssues([w], ids)} stale={false} checking={false} selection={{ kind: 'wall', wallId: 'W1' }} onSelect={() => {}} onAction={() => {}} />);
    expect(html).toContain('Opening position not found in the drawing');
    expect(html).toContain('Wall W1, opening W1-1: the AI found this W2 opening but no dimension to its axis');
    // O original aparece, mas dentro de <details> ("Details").
    const details = html.slice(html.indexOf('<details'));
    expect(details).toContain('a leitura não achou');
    expect(html.slice(0, html.indexOf('<details'))).not.toContain('a leitura não achou');
    expect(html).not.toContain('Fill in project data');
    const empty = renderToStaticMarkup(<IssueGroupsList groups={[]} stale={false} checking={false} selection={{ kind: 'none' }} onSelect={() => {}} onAction={() => {}} />);
    expect(empty).toContain('No problems');
  });
});

/**
 * S46: uma linha por causa, em três seções. A Matilda em miniatura: 10 paredes com header fora da tabela, 18 portas
 * com a peça deitada longe da top plate e com a altura de RO diferente do header, 4 painéis com studs sobrepostos.
 */
describe('IssueGroupsList — por causa (S46)', () => {
  const doorTags = ['A', 'B', 'C'];
  const doors = Array.from({ length: 18 }, (_, i) => ({ wallId: 'I' + (i + 1), openingId: 'I' + (i + 1) + '-D', tag: doorTags[i % 3]! }));
  const outer = Array.from({ length: 10 }, (_, i) => ({ wallId: 'X' + (i + 1), openingId: 'X' + (i + 1) + '-W' }));
  const house: IdIndex = {
    walls: [...outer.map((o) => o.wallId), ...doors.map((d) => d.wallId)],
    openings: new Map([...outer, ...doors].map((o) => [o.wallId, [o.openingId]])),
  };
  const info = new Map<string, OpeningInfo>([...doors.map((d): [string, OpeningInfo] => [d.openingId, { tag: d.tag, kind: 'door' }]), ...outer.map((o): [string, OpeningInfo] => [o.openingId, { tag: 'E2', kind: 'window' }])]);
  const engine = (code: string, at: { wallId: string; openingId: string }, params: Record<string, unknown>): Notice => ({ source: 'engine', code, message: 'x', wallId: at.wallId, openingId: at.openingId, params });
  const cripples = (n: number): Issue[] => doors.slice(0, n).map((d) => issueFromNotice(engine('FLAT_HEADER_CRIPPLES', d, { top: 83, gap: 24.125, topPlate: 107.125, max: 24 }), 'warning', house));
  const mismatch = doors.map((d) => issueFromNotice(engine('DOOR_RO_HEIGHT_MISMATCH', d, { roughHeight: 82.5, headerBase: 81.5 }), 'warning', house));
  const headers = outer.map((o) => issueFromNotice(engine('HEADER_OUT_OF_TABLE', o, { why: 'width', width: 600, snow: 30, table: 'R602.7(1)' }), 'problem', house));
  const overlaps = ['1-I1-P1', '1-I2-P1', '1-I3-P1', '1-I4-P1'].map((panelId) => issueFromNotice({ source: 'engine', code: 'STUDS_OVERLAP', message: 'x', panelId, params: { overlap: 0.375 } }, 'warning', house));
  const render = (issues: Issue[], partial = false): string =>
    renderToStaticMarkup(<IssueGroupsList groups={groupIssues(issues, house, { openings: info })} stale={false} checking={false} selection={{ kind: 'none' }} onSelect={() => {}} onAction={() => {}} partial={partial} />)
      .replaceAll('&quot;', '"')
      .replaceAll('&#x27;', "'");
  /** O trecho de um <details> a partir do texto do seu <summary>. */
  const detailsOf = (html: string, summary: string): string => {
    const at = html.indexOf(summary);
    if (at < 0) return '';
    const start = html.lastIndexOf('<details', at);
    return html.slice(start, html.indexOf('</details>', at));
  };

  it('50 ocorrências viram 4 linhas: contagem por nível, seções, frase-resumo e chips recolhidos', () => {
    const html = render([...overlaps, ...mismatch, ...cripples(18), ...headers]);
    expect(html).toContain('1 to fix · 2 to review · 1 fine to leave');
    expect(html.indexOf('Must fix')).toBeGreaterThan(-1);
    expect(html.indexOf('To review')).toBeGreaterThan(html.indexOf('Must fix'));
    expect(html.indexOf('Fine to leave (1)')).toBeGreaterThan(html.indexOf('To review'));
    // a seção "Fine to leave" nasce fechada e guarda o grupo dos studs
    const fine = detailsOf(html, 'Fine to leave (1)');
    expect(fine.startsWith('<details')).toBe(true);
    expect(fine.slice(0, fine.indexOf('>'))).not.toContain('open');
    expect(html.slice(html.indexOf('Fine to leave (1)'))).toContain('Studs overlap');
    expect(html.slice(0, html.indexOf('Fine to leave (1)'))).not.toContain('Studs overlap');
    // frases com os valores em comum
    expect(html).toContain("The building is 50'-0\" wide with 30 psf ground snow, outside IRC table R602.7(1).");
    expect(html).toContain('18 doors (types A, B, C): flat header 24 1/8" below the top plate, over the 24" limit.');
    expect(html).toContain("18 doors (types A, B, C): RO height 6'-10 1/2\", header at 6'-9 1/2\".");
    // 18 chips de abertura (não 15 de parede), recolhidos
    const chips = detailsOf(html, 'Show openings (18)');
    expect(chips.match(/<button[^>]*>I\d+-D<\/button>/g)).toHaveLength(18);
    expect(detailsOf(html, 'Show openings (10)').match(/<button[^>]*>X\d+-W<\/button>/g)).toHaveLength(10);
  });

  it('até 6 chips ficam à vista; a partir de 7 vão para "Show openings (N)"', () => {
    const six = render(cripples(6));
    expect(six).not.toContain('Show openings');
    expect(six.match(/<button[^>]*>I\d+-D<\/button>/g)).toHaveLength(6);
    const seven = render(cripples(7));
    expect(detailsOf(seven, 'Show openings (7)').match(/<button[^>]*>I\d+-D<\/button>/g)).toHaveLength(7);
  });

  it('só avisos que a fábrica resolve: uma seção recolhida e mais nada', () => {
    const html = render(overlaps);
    expect(html).toContain('1 fine to leave');
    expect(html).not.toContain('to fix');
    expect(html).not.toContain('to review');
    expect(html).not.toContain('Must fix');
    expect(html).not.toContain('To review');
    expect(html).toContain('Fine to leave (1)');
  });

  it('lista parcial: com problema e parede já montada, diz que podem surgir mais avisos', () => {
    const sentence = 'Walls with a problem are not framed yet — they may add warnings once fixed.';
    expect(render([...headers, ...cripples(2)], true)).toContain(sentence);
    expect(render([...headers, ...cripples(2)])).not.toContain(sentence);
  });
});

/** S46 (revisão): a abertura que a leitura não posicionou não existe no draft — botão "Add", sem chip quebrado, em "To review". */
describe('IssueGroupsList — abertura citada que não está no projeto (S46)', () => {
  const walls: IdIndex = { walls: ['W1', 'W2'], openings: new Map([['W1', []], ['W2', []]]) };
  const unplaced = (wallId: string, openingId: string): Issue =>
    issueFromNotice({ source: 'extraction', code: 'OPENING_UNPLACED', message: 'x', wallId, openingId, params: { tag: 'U2' } }, 'warning', walls);

  it('duas aberturas sem posição: um botão "Add" por abertura, chips das paredes (não de aberturas que não existem)', () => {
    const html = renderToStaticMarkup(
      <IssueGroupsList groups={groupIssues([unplaced('W1', 'W1-U2-1'), unplaced('W2', 'W2-U2-1')], walls)} stale={false} checking={false} selection={{ kind: 'none' }} onSelect={() => {}} onAction={() => {}} onQuickFix={() => {}} />,
    );
    expect(html).toContain('1 to review');
    expect(html).toContain('To review');
    expect(html).not.toContain('Must fix');
    expect(html.match(/<button[^>]*title="Add W\d-U2-1 at the center of W\d[^"]*"/g)).toHaveLength(2);
    expect(html.match(/<button[^>]*>W\d<\/button>/g)).toHaveLength(2);
    expect(html.match(/<button[^>]*>W\d-U2-1<\/button>/g)).toBeNull();
  });
});
