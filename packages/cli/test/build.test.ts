import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BuildError, buildProject, svgFileName } from '../src/build';
import { parseProject, type Project } from '../src/project';

const EXAMPLE = new URL('../examples/casa-exemplo.json', import.meta.url);
const example = (): Project => parseProject(readFileSync(EXAMPLE, 'utf8'), 'casa-exemplo.json');

describe('buildProject', () => {
  const result = buildProject(example());

  it('um painel por parede, na ordem do projeto', () => {
    expect(result.panels.map((p) => p.id)).toEqual(['W01', 'W02', 'W03', 'W04', 'W05', 'W06', 'W07']);
  });

  it('gera cutlist.csv, bom.csv e um SVG por painel', () => {
    expect(result.files.map((f) => f.path)).toEqual([
      'cutlist.csv',
      'bom.csv',
      'panels/W01.svg',
      'panels/W02.svg',
      'panels/W03.svg',
      'panels/W04.svg',
      'panels/W05.svg',
      'panels/W06.svg',
      'panels/W07.svg',
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

  it("sem avisos no exemplo (paredes de 8' e 9' nos dois pré-cortes); aviso do core vem com o id do painel", () => {
    expect(result.warnings).toEqual([]);
    const p = example();
    p.config.studLength = [104.625];
    const { warnings } = buildProject(p);
    // só a W06 (9') tem stud de 104 5/8"
    expect(warnings.map((w) => w.panelId)).toEqual(['W01', 'W02', 'W03', 'W04', 'W05', 'W07']);
    expect(warnings[0]).toMatchObject({ panelId: 'W01', warning: { code: 'STUD_LENGTH_MISMATCH' } });
  });

  it('W05: janela com header a 82.5 do config — 20 peças, como o fixture wall-144-window-82.5', () => {
    const w05 = result.panels.find((p) => p.id === 'W05')!;
    expect(w05.members).toHaveLength(20);
    const csv = result.files.find((f) => f.path === 'cutlist.csv')!.content;
    expect(csv).toContain('W05,header,2x10,39,"39""",2');
    expect(csv).toContain('W05,jackStud,2x6,81,"81""",2');
    expect(csv).toContain('W05,sill,2x6,36,"36""",1');
    expect(csv).toContain('W05,cripple,2x6,31.5,"31 1/2""",2');
    expect(csv).toContain('W05,cripple,2x6,2.375,"2 3/8""",2');
  });

  it("W06: headerHeight da abertura (7'-6\") sobrescreve o do config numa parede de 9'", () => {
    const w06 = result.panels.find((p) => p.id === 'W06')!;
    expect(w06.members.find((m) => m.role === 'header')).toMatchObject({ y: 90 });
    expect(w06.members.filter((m) => m.role === 'jackStud').map((j) => j.length)).toEqual([88.5, 88.5]);
    expect(w06.members.filter((m) => m.role === 'stud').every((s) => s.length === 104.625)).toBe(true);
  });

  it('W07: janela e porta com king compartilhado — 24 peças, como o fixture wall-144-window-door', () => {
    const w07 = result.panels.find((p) => p.id === 'W07')!;
    expect(w07.members).toHaveLength(24);
    expect(w07.fieldCuts).toEqual([{ role: 'bottomPlate', openingId: 'P1', x: 64.5, length: 38 }]);
    const csv = result.files.find((f) => f.path === 'cutlist.csv')!.content;
    expect(csv).toContain('W07,plates,2x6,144,"144""",3');
    expect(csv).toContain('W07,kingStud,2x6,92.625,"92 5/8""",3');
    expect(csv).toContain('W07,jackStud,2x6,81,"81""",4');
    expect(csv).toContain('W07,header,2x10,41,"41""",2');
    const svg = result.files.find((f) => f.path === 'panels/W07.svg')!.content;
    expect(svg).toContain('>cortar na obra 38&quot;</text>');
  });

  it('bom.csv usa os pré-cortes do projeto: 92 5/8" e 104 5/8" como estoque', () => {
    const csv = result.files.find((f) => f.path === 'bom.csv')!.content;
    expect(csv.split('\n')[0]).toBe(
      'section,stock_type,stock_length_in,stock_length,qty,cut_total_in,waste_in,waste_percent',
    );
    expect(csv).toContain('2x6,precut,92.625,"92 5/8""",');
    expect(csv).toContain('2x6,precut,104.625,"104 5/8""",');
    expect(csv).toContain('2x4,precut,92.625,"92 5/8""",');
  });

  it('aberturas próximas demais (P16) e plate sem comprimento comercial viram problemas, sem arquivos', () => {
    const p = example();
    p.walls[0]!.openings.push(
      { id: 'J8', type: 'window', offset: 20, roughWidth: 24, roughHeight: 48 },
      { id: 'J9', type: 'window', offset: 48, roughWidth: 24, roughHeight: 48 },
    );
    p.walls.push({ id: 'W99', length: 240, height: 97.125, section: '2x6', exterior: true, bearing: true, openings: [] });

    let error: BuildError | undefined;
    try {
      buildProject(p);
    } catch (e) {
      error = e as BuildError;
    }
    expect(error).toBeInstanceOf(BuildError);
    expect(error!.problems).toHaveLength(1);
    expect(error!.problems[0]).toMatch(/^parede W01: aberturas J8 e J9: 4" entre os RO/);

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
