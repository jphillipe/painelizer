import { describe, expect, it, vi } from 'vitest';

// `server-only` lança fora do React Server; nos testes vira módulo vazio.
vi.mock('server-only', () => ({}));

const { check, exampleText, generate, listExamples } = await import('./panels.service');

describe('panels.service.generate', () => {
  it('casa-exemplo: 7 painéis, arquivos de lista e folhas, sem avisos', () => {
    const r = generate(exampleText('casa-exemplo') as string);
    if (!r.ok) throw new Error(r.problems.join('\n'));
    expect(r.projectName).toBe('casa-exemplo');
    expect(r.panels).toHaveLength(7);
    expect(r.files.map((f) => f.path).slice(0, 4)).toEqual(['cutlist.csv', 'bom.csv', 'panels.csv', 'plan.svg']);
    expect(r.files.filter((f) => f.path.startsWith('panels/'))).toHaveLength(7);
    expect(r.panels[0]).toMatchObject({ id: '1-W01-P1', wallId: 'W01', length: 146.75 });
  });

  it('house-28x40: 12 painéis, 234 peças a cortar, com planta', () => {
    const r = generate(exampleText('house-28x40') as string);
    if (!r.ok) throw new Error(r.problems.join('\n'));
    expect(r.panels).toHaveLength(12);
    expect(r.panels.reduce((n, p) => n + p.pieces, 0)).toBe(234);
    // M3: BOM e listas de corte tipadas, as mesmas dos CSVs.
    expect(r.cutLists).toHaveLength(12);
    expect(r.cutLists.reduce((n, c) => n + c.lines.reduce((m, l) => m + l.qty, 0), 0)).toBe(234);
    expect(r.bom.length).toBeGreaterThan(0);
    expect(r.bom.every((l) => ['commercial', 'precut', 'engineered', 'oversize'].includes(l.kind))).toBe(true);
    expect(r.bom.some((l) => l.kind === 'precut' && l.stockLength === 92.625)).toBe(true);
    expect(r.files.some((f) => f.path === 'plan.svg')).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('ringgold: os 2 avisos de jacks chegam como texto com o id do painel', () => {
    const r = generate(exampleText('ringgold-checkpoint') as string);
    if (!r.ok) throw new Error(r.problems.join('\n'));
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0]).toMatch(/^1-S2-P1 HEADER_JACKS_BELOW_TABLE: /);
    expect(r.files.some((f) => f.path === 'plan.svg')).toBe(false); // paredes soltas: sem planta
  });

  it('JSON inválido e projeto inválido viram problems, não exceção', () => {
    expect(generate('{')).toEqual({ ok: false, problems: [expect.stringContaining('JSON inválido')] });
    const r = generate(JSON.stringify({ name: 'x', config: { studSpacing: 16, studLength: [92.625] }, walls: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]).toMatch(/nenhuma parede/);
  });

  it('erro do motor (header fora da tabela) vira problems do motor', () => {
    const text = JSON.stringify({
      name: 'x',
      config: { studSpacing: 16, studLength: [92.625], headerHeight: 82.5, building: { groundSnowLoad: 50, buildingWidth: 336 } },
      walls: [
        {
          id: 'W1', length: 240, height: 97.125, section: '2x6', exterior: true, bearing: true, floorsSupported: 2,
          openings: [{ id: 'J', type: 'window', offset: 48, roughWidth: 144, roughHeight: 48 }],
        },
      ],
    });
    const r = generate(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]).toMatch(/header fora da tabela/);
  });
});

describe('panels.service.check', () => {
  it('mesmos painéis e avisos do generate, sem arquivos', () => {
    for (const id of ['casa-exemplo', 'house-28x40', 'ringgold-checkpoint']) {
      const c = check(exampleText(id) as string);
      const g = generate(exampleText(id) as string);
      if (!c.ok || !g.ok) throw new Error('should build');
      expect(c).toEqual({ ok: true, projectName: g.projectName, panels: g.panels, warnings: g.warnings });
      expect('files' in c).toBe(false);
    }
  });

  it('problemas iguais aos do generate', () => {
    expect(check('{')).toEqual(generate('{'));
    const bad = JSON.stringify({ name: 'x', config: { studSpacing: 16, studLength: [92.625] }, walls: [{ id: 'W1', length: 96, height: 97, section: '2x4', exterior: false, bearing: false, openings: [{ id: 'D', type: 'door', offset: 90, roughWidth: 38, roughHeight: 82.5 }] }] });
    const r = check(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]).toMatch(/parede W1/);
  });
});

describe('listExamples', () => {
  it('os três exemplos do CLI, com rótulo', () => {
    expect(listExamples().map((e) => e.id)).toEqual(['casa-exemplo', 'house-28x40', 'ringgold-checkpoint']);
    expect(listExamples().every((e) => e.label.length > 0)).toBe(true);
    expect(exampleText('nope')).toBeUndefined();
  });
});
