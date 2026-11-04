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

  it('ringgold: os 2 avisos de jacks chegam com código, painel e parede (S26)', () => {
    const r = generate(exampleText('ringgold-checkpoint') as string);
    if (!r.ok) throw new Error(r.problems.map((p) => p.message).join('\n'));
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0]).toMatchObject({ source: 'engine', panelId: '1-S2-P1', code: 'HEADER_JACKS_BELOW_TABLE', wallId: 'S2' });
    expect(r.warnings[0]!.message).not.toMatch(/hipótese/);
    expect(r.files.some((f) => f.path === 'plan.svg')).toBe(false); // paredes soltas: sem planta
  });

  it('JSON inválido e projeto inválido viram problems, não exceção', () => {
    expect(generate('{')).toEqual({ ok: false, problems: [expect.objectContaining({ source: 'parser', code: 'PROJECT_JSON_INVALID' })] });
    const r = generate(JSON.stringify({ name: 'x', config: { studSpacing: 16, studLength: [92.625] }, walls: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems[0]).toMatchObject({ source: 'parser', code: 'PROJECT_INVALID', path: 'walls' });
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
    if (!r.ok) expect(r.problems[0]).toMatchObject({ source: 'engine', code: 'HEADER_OUT_OF_TABLE', wallId: 'W1', openingId: 'J', stage: 'wall', params: { why: 'span' } });
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
    if (!r.ok) expect(r.problems[0]).toMatchObject({ wallId: 'W1', openingId: 'D' });
  });
});

describe('listExamples', () => {
  it('a leitura real do Ringgold primeiro, depois os exemplos do CLI (sem o checkpoint do Ringgold), com rótulo e fatos do próprio arquivo', () => {
    const list = listExamples();
    expect(list.map((e) => e.id)).toEqual(['ringgold-reading', 'casa-exemplo', 'house-28x40']);
    expect(list.map((e) => e.kind)).toEqual(['reading', 'project', 'project']);
    expect(list.every((e) => e.label.length > 0)).toBe(true);
    expect(list[0]!.facts).toBe('28 walls · 30 openings · level 1 · from A-100 + A-800');
    expect(list[2]!.facts).toBe('5 walls · 12 panels');
    expect(JSON.parse(list[0]!.text)).toMatchObject({ projectName: 'Ringgold St MultiFamily' });
    expect(exampleText('nope')).toBeUndefined();
  });
});

describe('S26: nada em português na frase dos avisos dos exemplos', () => {
  it('28x40, casa-exemplo e Ringgold solto: todo aviso tem código com frase em inglês', async () => {
    const { englishMessage } = await import('@/lib/messages.en');
    for (const id of ['casa-exemplo', 'house-28x40', 'ringgold-checkpoint']) {
      const r = check(exampleText(id) as string);
      if (!r.ok) throw new Error(id);
      for (const w of r.warnings) {
        const text = englishMessage(w);
        expect(text, `${id} ${w.code}`).toBeDefined();
        expect(text, `${id} ${w.code}`).not.toMatch(/\b(parede|abertura|não|hipótese)\b|ção/);
      }
    }
  });
});
