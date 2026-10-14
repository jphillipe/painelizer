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

  it('W05: header pela tabela IRC (2-2x6, 2 jacks) a 82.5 — 22 peças, como o fixture wall-144-window-irc', () => {
    const w05 = result.panels.find((p) => p.id === 'W05')!;
    expect(w05.members).toHaveLength(22);
    const csv = result.files.find((f) => f.path === 'cutlist.csv')!.content;
    expect(csv).toContain('W05,header,2x6,42,"42""",2');
    expect(csv).toContain('W05,jackStud,2x6,81,"81""",4');
    expect(csv).toContain('W05,sill,2x6,36,"36""",1');
    expect(csv).toContain('W05,cripple,2x6,31.5,"31 1/2""",2');
    expect(csv).toContain('W05,cripple,2x6,6.125,"6 1/8""",2');
    const svg = result.files.find((f) => f.path === 'panels/W05.svg')!.content;
    expect(svg).toContain('<title>header 2x6 × 42&quot; (2 plies) [R602.7(1)] — ');
  });

  it("W06: headerHeight da abertura (7'-6\") sobrescreve o do config numa parede de 9'", () => {
    const w06 = result.panels.find((p) => p.id === 'W06')!;
    expect(w06.members.find((m) => m.role === 'header')).toMatchObject({ y: 90, section: '2x6' });
    expect(w06.members.filter((m) => m.role === 'jackStud').map((j) => j.length)).toEqual([88.5, 88.5, 88.5, 88.5]);
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
    expect(svg).toContain('<title>header 2x10 × 41&quot; (2 plies) [project] — ');
  });

  it('W04: porta em parede interna não portante leva 2x4 deitado (R602.7.4), sem cripples acima', () => {
    const w04 = result.panels.find((p) => p.id === 'W04')!;
    expect(w04.members.find((m) => m.role === 'header')).toMatchObject({
      section: '2x4',
      plies: 1,
      flat: true,
      headerSource: 'R602.7.4',
      length: 35,
      x: 38.5,
      y: 82.5,
    });
    expect(w04.members.filter((m) => m.role === 'cripple')).toEqual([]);
    expect(w04.fieldCuts).toEqual([{ role: 'bottomPlate', openingId: 'P2', x: 40, length: 32 }]);
    const csv = result.files.find((f) => f.path === 'cutlist.csv')!.content;
    expect(csv).toContain('W04,header,2x4,35,"35""",1');
    const svg = result.files.find((f) => f.path === 'panels/W04.svg')!.content;
    expect(svg).toContain('<title>header 2x4 × 35&quot; [R602.7.4] — ');
  });

  it('header sem como escolher vira problema com parede, abertura e motivo, sem repetir o id da parede', () => {
    const p = example();
    delete p.config.building;
    delete p.house!.walls.find((w) => w.id === 'W06')!.floorsSupported;
    let error: BuildError | undefined;
    try {
      buildProject(p);
    } catch (e) {
      error = e as BuildError;
    }
    expect(error).toBeInstanceOf(BuildError);
    expect(error!.problems).toHaveLength(2);
    expect(error!.problems[0]).toMatch(/^parede W05, abertura J1: .*config\.building/);
    expect(error!.problems[1]).toMatch(/^parede W06, abertura J2: /);
  });

  it('parede interna portante sem pavimento acima não está na R602.7(2): pede engenheiro ou header do projeto', () => {
    const p = example();
    const w03 = p.house!.walls.find((w) => w.id === 'W03')!;
    w03.floorsSupported = 0;
    w03.openings.push({ id: 'P9', type: 'door', offset: 40, roughWidth: 38, roughHeight: 82.5 });
    expect(() => buildProject(p)).toThrow(/parede W03, abertura P9: header fora da tabela \(0 pavimento/);
    w03.openings[0]!.header = { section: '2x6', plies: 2 };
    expect(buildProject(p).panels.find((x) => x.id === 'W03')!.members.some((m) => m.role === 'header')).toBe(true);
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
    const walls = p.house!.walls;
    walls[0]!.openings.push(
      { id: 'J8', type: 'window', offset: 20, roughWidth: 24, roughHeight: 48 },
      { id: 'J9', type: 'window', offset: 48, roughWidth: 24, roughHeight: 48 },
    );
    walls.push({ id: 'W99', start: { x: 0, y: 600 }, end: { x: 240, y: 600 }, height: 97.125, section: '2x6', exterior: true, bearing: true, openings: [] });

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
    walls[0]!.openings = [];
    expect(() => buildProject(p)).toThrow(/lista de material: .*240/);
  });

  it('ids que colidem no nome de arquivo são erro, não sobrescrita', () => {
    const p = example();
    const w = p.house!.walls[0]!;
    p.house!.walls = [
      { ...w, id: 'W/1' },
      { ...w, id: 'W_1', start: { x: 0, y: 900 }, end: { x: 144, y: 900 }, ends: {} },
    ];
    expect(() => buildProject(p)).toThrow(/"W\/1" e "W_1" gerariam o mesmo arquivo panels\/W_1\.svg/);
  });

  describe('casa em planta (S13)', () => {
    it('W01 atravessa por ends, W02 encosta, W03 em T; as soltas saem como antes', () => {
      const plates = Object.fromEntries(result.panels.map((p) => [p.id, [p.length, p.layoutOrigin]]));
      expect(plates).toEqual({
        W01: [146.75, 0],
        W02: [189.25, -5.5],
        W03: [117.25, 0],
        W04: [126, 0],
        W05: [144, 0],
        W06: [120, 0],
        W07: [144, 0],
      });
      expect(result.panels.reduce((n, p) => n + p.members.length, 0)).toBe(125);
      const csv = result.files.find((f) => f.path === 'cutlist.csv')!.content;
      expect(csv).toContain('W01,plates,2x6,146.75,"146 3/4""",3');
      expect(csv).toContain('W02,plates,2x6,189.25,"189 1/4""",3');
      expect(csv).toContain('W03,plates,2x4,117.25,"117 1/4""",3');
      // W02: layout da quina — primeiro stud de marca em 9.75 (marca 10.5 = 16 − 5.5).
      const w02 = result.panels.find((p) => p.id === 'W02')!;
      expect(w02.members.filter((m) => m.role === 'stud').map((m) => m.x).slice(0, 3)).toEqual([0, 9.75, 25.75]);
    });

    it('erro de planta (paredes que se cruzam) é um problema só, prefixado com "planta:"', () => {
      const p = example();
      p.house!.walls.push({ id: 'X', start: { x: -50, y: 50 }, end: { x: 50, y: 50 }, height: 97.125, section: '2x4', exterior: false, bearing: false, openings: [] });
      let error: BuildError | undefined;
      try {
        buildProject(p);
      } catch (e) {
        error = e as BuildError;
      }
      expect(error!.problems).toEqual([expect.stringMatching(/^planta: paredes W02 e X se cruzam em \(0, 50\)/)]);
    });

    it('T dentro do RO é problema da parede atravessada; na zona é aviso OPENING_AT_TEE', () => {
      const p = example();
      const w02 = p.house!.walls.find((w) => w.id === 'W02')!;
      w02.openings.push({ id: 'J9', type: 'window', offset: 80, roughWidth: 36, roughHeight: 48, header: { section: '2x10', plies: 2 } });
      expect(() => buildProject(p)).toThrow(/^parede W02, abertura J9: a parede W03 encosta em T em x=93.25/);
      w02.openings[0]!.offset = 100; // zona [97, 139] no eixo → [94.25, 136.25] no painel; faixa do T 91.5–95
      const { warnings } = buildProject(p);
      expect(warnings).toEqual([{ panelId: 'W02', warning: expect.objectContaining({ code: 'OPENING_AT_TEE' }) }]);
    });

    it('formato por comprimento continua valendo: mesmas paredes soltas, mesmos painéis', () => {
      const loose: Project = {
        name: 'solta',
        config: example().config,
        walls: [{ id: 'W05', length: 144, height: 97.125, section: '2x6', exterior: true, bearing: true, floorsSupported: 0, openings: example().house!.walls[4]!.openings }],
      };
      const panel = buildProject(loose).panels[0]!;
      expect(panel.members).toEqual(result.panels.find((p) => p.id === 'W05')!.members);
    });
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
