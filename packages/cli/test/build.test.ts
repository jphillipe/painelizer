import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BuildError, buildProject, svgFileName } from '../src/build';
import { parseProject, type Project } from '../src/project';

const EXAMPLE = new URL('../examples/casa-exemplo.json', import.meta.url);
const example = (): Project => parseProject(readFileSync(EXAMPLE, 'utf8'), 'casa-exemplo.json');

describe('buildProject', () => {
  const result = buildProject(example());

  it('um painel por parede, na ordem do projeto', () => {
    expect(result.panels.map((p) => p.id)).toEqual(['W01', 'W02', 'W03', 'W04']);
  });

  it('gera cutlist.csv, bom.csv e um SVG por painel', () => {
    expect(result.files.map((f) => f.path)).toEqual([
      'cutlist.csv',
      'bom.csv',
      'panels/W01.svg',
      'panels/W02.svg',
      'panels/W03.svg',
      'panels/W04.svg',
    ]);
    for (const f of result.files.filter((f) => f.path.endsWith('.svg'))) {
      expect(f.content.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    }
    expect(result.files[0]?.content.split('\n')[0]).toBe('panel,role,section,length_in,length,qty');
  });

  it('SVG usa o studSpacing do projeto nas marcas de layout', () => {
    const p = example();
    p.config.studSpacing = 24;
    const svg = buildProject(p).files.find((f) => f.path === 'panels/W01.svg')!.content;
    expect(svg).toContain('>24&quot;</text>');
    expect(svg).not.toContain('>16&quot;</text>');
  });

  it('sem avisos no exemplo; aviso do core aparece com o id do painel', () => {
    expect(result.warnings).toEqual([]);
    const p = example();
    p.config.studLength = 104.625;
    const { warnings } = buildProject(p);
    expect(warnings).toHaveLength(4);
    expect(warnings[0]).toMatchObject({ panelId: 'W01', warning: { code: 'STUD_LENGTH_MISMATCH' } });
  });

  it('janela gera kings, jacks, header, sill e cripples no painel e na lista de corte', () => {
    const p = example();
    p.config.defaultHeaderSection = '2x10';
    p.config.defaultHeaderPlies = 2;
    p.walls[0]!.openings.push({ id: 'J1', type: 'window', offset: 48, roughWidth: 36, roughHeight: 48 });
    const r = buildProject(p);
    expect(r.panels[0]!.members).toHaveLength(18);
    const csv = r.files.find((f) => f.path === 'cutlist.csv')!.content;
    expect(csv).toContain('W01,header,2x10,39,"39""",2');
    expect(csv).toContain('W01,sill,2x6,36,"36""",1');
    expect(csv).toContain('W01,cripple,2x6,33.875,"33 7/8""",2');
  });

  it('porta (S8 pendente) e plate sem comprimento comercial viram problemas, sem arquivos', () => {
    const p = example();
    p.walls[0]!.openings.push({ id: 'P1', type: 'door', offset: 48, roughWidth: 36, roughHeight: 82 });
    p.walls.push({ id: 'W99', length: 240, height: 97.125, section: '2x6', exterior: true, bearing: true, openings: [] });

    let error: BuildError | undefined;
    try {
      buildProject(p);
    } catch (e) {
      error = e as BuildError;
    }
    expect(error).toBeInstanceOf(BuildError);
    expect(error!.problems).toHaveLength(1);
    expect(error!.problems[0]).toMatch(/^parede W01: .*porta chega na S8/);

    // Sem a abertura, o erro da BOM (plate de 240") aparece.
    p.walls[0]!.openings = [];
    expect(() => buildProject(p)).toThrow(/lista de material: .*240/);
  });

  it('ids que colidem no nome de arquivo são erro, não sobrescrita', () => {
    const p = example();
    p.walls = [
      { ...p.walls[0]!, id: 'W/1' },
      { ...p.walls[0]!, id: 'W_1' },
    ];
    expect(() => buildProject(p)).toThrow(/"W\/1" e "W_1" gerariam o mesmo arquivo panels\/W_1\.svg/);
  });
});

describe('svgFileName', () => {
  it('mantém letras, dígitos, ponto, hífen e sublinhado; o resto vira _', () => {
    expect(svgFileName('W01-P1')).toBe('W01-P1.svg');
    expect(svgFileName('W 01/P1')).toBe('W_01_P1.svg');
    expect(svgFileName('..')).toBe('_.svg');
    expect(svgFileName('')).toBe('panel.svg');
  });
});
