import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { parseProject } from 'cli/project';
import { draftFromText, textFromDraft } from './draft';
import { parseProjectFile, PROJECT_FILE_KEY, projectFileName, projectFileText, type Reading } from './project-file';

const draftOf = (text: string) => {
  const r = draftFromText(text);
  if (!r.ok) throw new Error('fixture não abre');
  return r.draft;
};

const reading: Reading = {
  ok: true,
  output: { walls: [{ id: 'W01' }] },
  given: { wallHeight: "8'-1 1/8\"", headerHeight: '', sillHeight: '', floors: '1', floorSpan: 'center', snow: '30', width: "28'", wind: '120', exposure: 'B' },
  projectName: 'Casa 28x40 (visão)',
  level: 1,
  origin: 'canto SO',
  projectText: '{"would be":"replaced"}',
  walls: [{ id: 'W01', geometry: '(0, 0) → (480, 0)', section: '2x6', wallType: null, exterior: true, bearing: true, openings: [], confidence: 0.95, evidence: 'A-100' }],
  openingTypes: [{ tag: 'A', kind: 'window', size: '36 × 48', confidence: 0.9 }],
  notes: ['nota'],
  problems: [],
  warnings: ['extração ALTURA_PADRAO: …'],
  report: '# relatório',
  model: 'claude-opus-5-5',
  usage: { inputTokens: 10, outputTokens: 20 },
  pagesSent: [{ name: 'A-100.pdf', pages: [3] }],
};

describe('project-file: arquivo único do app', () => {
  it('sem leitura é o JSON do CLI puro, que o parser do CLI aceita', () => {
    const draft = draftOf(EXAMPLES[1]!.text);
    const text = projectFileText(draft, undefined);
    expect(text).not.toContain(PROJECT_FILE_KEY);
    expect(parseProject(text).house?.walls).toHaveLength(5);
    const parsed = parseProjectFile(text);
    expect(parsed.reading).toBeUndefined();
    expect(parsed.projectText).toBe(text);
  });

  it('com leitura: o CLI ignora `$panelizer`; o app recupera a leitura e o projeto sem a chave', () => {
    const draft = draftOf(EXAMPLES[1]!.text);
    const text = projectFileText(draft, reading);
    expect(parseProject(text).house?.walls).toHaveLength(5);
    const parsed = parseProjectFile(text);
    expect(parsed.projectText).not.toContain(PROJECT_FILE_KEY);
    expect(parsed.projectText).toBe(textFromDraft(draft));
    expect(parsed.reading?.ok).toBe(true);
    expect(parsed.reading?.walls[0]?.id).toBe('W01');
    expect(parsed.reading?.output).toEqual({ walls: [{ id: 'W01' }] });
    expect(parsed.reading?.warnings).toEqual(['extração ALTURA_PADRAO: …']);
    // `projectText` não vai no arquivo: na volta é o próprio projeto.
    expect(text).not.toContain('would be');
    expect(parsed.reading?.projectText).toBe(parsed.projectText);
    // Ida e volta pelo editor: o draft reaberto serializa igual.
    const again = draftFromText(parsed.projectText);
    expect(again.ok && textFromDraft(again.draft)).toBe(textFromDraft(draft));
  });

  it('`$panelizer` desconhecido ou malformado é descartado em silêncio; texto que não é JSON volta como está', () => {
    const base = JSON.parse(EXAMPLES[1]!.text) as Record<string, unknown>;
    const v9 = parseProjectFile(JSON.stringify({ ...base, [PROJECT_FILE_KEY]: { version: 9, reading: {} } }));
    expect(v9.reading).toBeUndefined();
    expect(v9.projectText).not.toContain(PROJECT_FILE_KEY);
    expect(parseProjectFile(JSON.stringify({ ...base, [PROJECT_FILE_KEY]: 'x' })).reading).toBeUndefined();
    expect(parseProjectFile('{ not json').projectText).toBe('{ not json');
    expect(parseProjectFile('[1,2]').projectText).toBe('[1,2]');
  });

  it('nome do arquivo', () => {
    expect(projectFileName('casa-28x40-visao')).toBe('casa-28x40-visao.panelizer.json');
  });
});
