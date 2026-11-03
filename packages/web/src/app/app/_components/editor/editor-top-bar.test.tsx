import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EditorTopBar } from './editor-top-bar';
import type { CheckState } from './use-project-check';

const base = { name: 'Ringgold St', walls: 30, openings: 27, pending: false, needsData: false, onGenerate: () => {}, steps: <span>steps</span>, menu: [] };

/** Smoke test sem navegador: nome, contagens, chip de status e o botão principal desligado quando não está pronto. */
describe('EditorTopBar (SSR)', () => {
  it('com problemas: chip "to fix", Generate desligado e a dica', () => {
    const check: CheckState = { status: 'done', result: { ok: false, problems: ['x'] }, revision: 1, stale: false };
    const html = renderToStaticMarkup(<EditorTopBar {...base} check={check} problems={3} warnings={0} ready={false} />);
    expect(html).toContain('<h1');
    expect(html).toContain('Ringgold St');
    expect(html).toContain('30 walls · 27 openings');
    expect(html).toContain('3 to fix');
    expect(html).toContain('Fix 3 problems first.');
    expect(html).toMatch(/<button[^>]* disabled=""[^>]*>Generate panels/);
  });

  it('pronto: "Ready · N panels", avisos à parte e Generate ligado; dados faltando mudam a dica', () => {
    const check: CheckState = { status: 'done', result: { ok: true, projectName: 'Ringgold St', panels: [{ id: '1-W01-P1', wallId: 'W01', pieces: 1 }] as never, warnings: ['w'] }, revision: 1, stale: false };
    const html = renderToStaticMarkup(<EditorTopBar {...base} check={check} problems={0} warnings={1} ready />);
    expect(html).toContain('Ready · 1 panels');
    expect(html).toContain('1 warning');
    expect(html).not.toMatch(/<button[^>]* disabled=""[^>]*>Generate panels/);
    const data = renderToStaticMarkup(<EditorTopBar {...base} needsData check={check} problems={30} warnings={0} ready={false} />);
    expect(data).toContain('Fill in the project data first.');
    const checking = renderToStaticMarkup(<EditorTopBar {...base} check={{ ...check, stale: true }} problems={0} warnings={0} ready={false} />);
    expect(checking).toContain('Checking…');
  });
});

describe('EditorTopBar — chip do auto-save (S22.1)', () => {
  const check: CheckState = { status: 'done', result: { ok: true, projectName: 'x', panels: [] as never, warnings: [] }, revision: 1, stale: false };
  const render = (save: Parameters<typeof EditorTopBar>[0]['save']) => renderToStaticMarkup(<EditorTopBar {...base} check={check} problems={0} warnings={0} ready save={save} onRetrySave={() => {}} />);

  it('salvo agora, salvando, erro com Retry e conflito com Reload', () => {
    expect(render({ kind: 'saved', at: Date.now() - 5_000 })).toContain('Saved · just now');
    expect(render({ kind: 'saving' })).toContain('Saving…');
    const error = render({ kind: 'error', message: 'rede caiu' });
    expect(error).toContain('Not saved');
    expect(error).toContain('>Retry<');
    expect(error).toContain('title="rede caiu"');
    const conflict = render({ kind: 'conflict', message: 'edited elsewhere', revision: 4 });
    expect(conflict).toContain('Edited elsewhere');
    expect(conflict).toContain('>Reload<');
    expect(render({ kind: 'deleted', message: 'gone' })).toContain('Deleted on the server');
  });

  it('sem projeto no servidor (local) ou sem a prop, nenhum chip', () => {
    expect(render({ kind: 'local' })).not.toContain('Saved');
    expect(render(undefined)).not.toContain('Saving');
  });
});
