import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { draftFromText, type ProjectDraft } from '@/lib/editor/draft';
import { planGeometry } from '@/lib/editor/geometry';
import type { Issue } from '@/lib/editor/problems';
import { PlanCanvas } from './plan-canvas';

const load = (text: string): ProjectDraft => {
  const r = draftFromText(text);
  if (!r.ok) throw new Error('should open');
  return r.draft;
};

/** Smoke test sem navegador: o SVG sai no servidor com uma peça clicável por parede e por abertura. */
describe('PlanCanvas (SSR)', () => {
  it('28x40: 5 paredes, 7 aberturas, a selecionada marcada, cota da selecionada, norte e origem', () => {
    const d = load(EXAMPLES[1]!.text);
    const html = renderToStaticMarkup(
      <PlanCanvas geometry={planGeometry(d)} selection={{ kind: 'wall', wallId: 'W02' }} issuesByWall={new Map()} northAngle={0} fitKey="t" onSelect={() => {}} initialSize={{ width: 800, height: 600 }} />,
    );
    expect(html.match(/data-wall-id="/g)).toHaveLength(5);
    expect(html.match(/data-opening-id="/g)).toHaveLength(7);
    expect(html).toContain('data-wall-id="W02" data-selected="true"');
    expect(html).not.toContain('data-handle'); // sem callbacks de arraste, sem alças
    expect(html).toContain('27&#x27;-6 1/2&quot;'); // plate de W02 (encosta em W01 e W03: 336 − 2 × 2.75), com as aspas escapadas pelo React
    expect(html).toContain('>N<');
    expect(html).toContain('0,0');
    expect(html).toContain('Plan, 5 walls');
  });

  it('com arraste ligado, a parede selecionada ganha alças nas duas pontas', () => {
    const d = load(EXAMPLES[1]!.text);
    const html = renderToStaticMarkup(
      <PlanCanvas geometry={planGeometry(d)} selection={{ kind: 'wall', wallId: 'W01' }} issuesByWall={new Map()} fitKey="t" onSelect={() => {}} onEndpointDrag={() => {}} onOpeningDrag={() => {}} onDragEnd={() => {}} initialSize={{ width: 800, height: 600 }} />,
    );
    expect(html).toContain('data-handle="start"');
    expect(html).toContain('data-handle="end"');
    expect(html.match(/data-handle="/g)).toHaveLength(2);
    expect(html).toContain('Shift = 1/8');
  });

  it('parede com problema fica vermelha; casa que não fecha mostra o badge e tracejado', () => {
    const d = load(EXAMPLES[1]!.text);
    d.walls.push({ id: 'X1', start: { x: 100, y: 168 }, end: { x: 400, y: 168 }, section: '2x4', exterior: false, bearing: false, height: 97.125, openings: [] });
    const g = planGeometry(d);
    const issues = new Map<string | undefined, Issue[]>([['W05', [{ severity: 'problem', source: 'geometry', text: 'x', wallId: 'W05' }]]]);
    const html = renderToStaticMarkup(<PlanCanvas geometry={g} selection={{ kind: 'none' }} issuesByWall={issues} fitKey="t" onSelect={() => {}} initialSize={{ width: 800, height: 600 }} />);
    expect(html).toContain('plan doesn’t close');
    expect(html).toContain('stroke-dasharray="5 3"');
    const w05 = html.slice(html.indexOf('data-wall-id="W05"'));
    expect(w05.slice(0, 600)).toContain('var(--color-destructive)');
  });

  it('sem tamanho inicial (SSR real) desenha o container e nada dentro; projeto solto avisa', () => {
    const d = load(EXAMPLES[1]!.text);
    const html = renderToStaticMarkup(<PlanCanvas geometry={planGeometry(d)} selection={{ kind: 'none' }} issuesByWall={new Map()} fitKey="t" onSelect={() => {}} />);
    expect(html).not.toContain('data-wall-id');
    const loose = renderToStaticMarkup(<PlanCanvas geometry={planGeometry(load(EXAMPLES[2]!.text))} selection={{ kind: 'none' }} issuesByWall={new Map()} fitKey="t" onSelect={() => {}} initialSize={{ width: 800, height: 600 }} />);
    expect(loose).toContain('Nothing to draw yet.');
  });
});
