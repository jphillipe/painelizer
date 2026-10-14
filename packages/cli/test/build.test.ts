import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BuildError, buildProject, svgFileName } from '../src/build';
import { parseProject, type Project } from '../src/project';

const EXAMPLE = new URL('../examples/casa-exemplo.json', import.meta.url);
const example = (): Project => parseProject(readFileSync(EXAMPLE, 'utf8'), 'casa-exemplo.json');

describe('buildProject', () => {
  const result = buildProject(example());

  it('um painel por parede, na ordem do projeto, com id {level}-{wallId}-P{n} (S16)', () => {
    expect(result.panels.map((p) => p.id)).toEqual(['1-W01-P1', '1-W02-P1', '1-W03-P1', '1-W04-P1', '1-W05-P1', '1-W06-P1', '1-W07-P1']);
    expect(result.panels.map((p) => p.level)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('gera cutlist.csv, bom.csv, panels.csv, plan.svg e um SVG por painel', () => {
    expect(result.files.map((f) => f.path)).toEqual([
      'cutlist.csv',
      'bom.csv',
      'panels.csv',
      'plan.svg',
      'panels/1-W01-P1.svg',
      'panels/1-W02-P1.svg',
      'panels/1-W03-P1.svg',
      'panels/1-W04-P1.svg',
      'panels/1-W05-P1.svg',
      'panels/1-W06-P1.svg',
      'panels/1-W07-P1.svg',
    ]);
    for (const f of result.files.filter((f) => f.path.endsWith('.svg'))) {
      expect(f.content.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    }
    expect(result.files[0]?.content.split('\n')[0]).toBe('panel,role,section,length_in,length,qty');
  });

  it('SVG usa o studSpacing do projeto nas marcas de layout', () => {
    const p = example();
    p.config.studSpacing = 24;
    const svg = buildProject(p).files.find((f) => f.path === 'panels/1-W01-P1.svg')!.content;
    expect(svg).toContain('>24&quot;</text>');
    expect(svg).not.toContain('>16&quot;</text>');
  });

  it("sem avisos no exemplo (paredes de 8' e 9' nos dois pré-cortes); aviso do core vem com o id do painel", () => {
    expect(result.warnings).toEqual([]);
    const p = example();
    p.config.studLength = [104.625];
    const { warnings } = buildProject(p);
    // só a W06 (9') tem stud de 104 5/8"
    expect(warnings.map((w) => w.panelId)).toEqual(['1-W01-P1', '1-W02-P1', '1-W03-P1', '1-W04-P1', '1-W05-P1', '1-W07-P1']);
    expect(warnings[0]).toMatchObject({ panelId: '1-W01-P1', warning: { code: 'STUD_LENGTH_MISMATCH' } });
  });

  it('W05: header pela tabela IRC (2-2x6, 2 jacks) a 82.5 — 22 peças, como o fixture wall-144-window-irc', () => {
    const w05 = result.panels.find((p) => p.id === '1-W05-P1')!;
    expect(w05.members).toHaveLength(22);
    const csv = result.files.find((f) => f.path === 'cutlist.csv')!.content;
    expect(csv).toContain('1-W05-P1,header,2x6,42,"42""",2');
    expect(csv).toContain('1-W05-P1,jackStud,2x6,81,"81""",4');
    expect(csv).toContain('1-W05-P1,sill,2x6,36,"36""",1');
    expect(csv).toContain('1-W05-P1,cripple,2x6,31.5,"31 1/2""",2');
    expect(csv).toContain('1-W05-P1,cripple,2x6,6.125,"6 1/8""",2');
    const svg = result.files.find((f) => f.path === 'panels/1-W05-P1.svg')!.content;
    expect(svg).toContain('<title>header 2x6 × 42&quot; (2 plies) [R602.7(1)] — ');
  });

  it("W06: headerHeight da abertura (7'-6\") sobrescreve o do config numa parede de 9'", () => {
    const w06 = result.panels.find((p) => p.id === '1-W06-P1')!;
    expect(w06.members.find((m) => m.role === 'header')).toMatchObject({ y: 90, section: '2x6' });
    expect(w06.members.filter((m) => m.role === 'jackStud').map((j) => j.length)).toEqual([88.5, 88.5, 88.5, 88.5]);
    expect(w06.members.filter((m) => m.role === 'stud').every((s) => s.length === 104.625)).toBe(true);
  });

  it('folha de fabricação (S17): nome, date e revision do projeto no cabeçalho; sem date/revision, sem carimbo', () => {
    const svg = result.files.find((f) => f.path === 'panels/1-W07-P1.svg')!.content;
    expect(svg).toContain('text-anchor="end">casa-exemplo</text>');
    expect(svg).toContain('>data 2026-10-14 · rev. A</text>');
    expect(svg).toContain('>parede W07 · pavimento 1 · 2x6 externa portante · ');
    expect(svg).toContain('>Peso estimado: ');
    expect(svg).toContain('>peitoril ');
    // W01 atravessa o canto em (0,0) indo para +x com a casa a +y: vista de fora.
    const w01 = result.files.find((f) => f.path === 'panels/1-W01-P1.svg')!.content;
    expect(w01).toContain('>Vista de fora — face externa voltada para o observador; ');
    const p = example();
    delete p.date;
    delete p.revision;
    const bare = buildProject(p).files.find((f) => f.path === 'panels/1-W07-P1.svg')!.content;
    expect(bare).not.toContain('class="stamp"');
    expect(bare).toContain('text-anchor="end">casa-exemplo</text>');
  });

  it('W07: janela e porta com king compartilhado — 24 peças, como o fixture wall-144-window-door', () => {
    const w07 = result.panels.find((p) => p.id === '1-W07-P1')!;
    expect(w07.members).toHaveLength(24);
    expect(w07.fieldCuts).toEqual([{ role: 'bottomPlate', openingId: 'P1', x: 64.5, length: 38 }]);
    const csv = result.files.find((f) => f.path === 'cutlist.csv')!.content;
    expect(csv).toContain('1-W07-P1,plates,2x6,144,"144""",3');
    expect(csv).toContain('1-W07-P1,kingStud,2x6,92.625,"92 5/8""",3');
    expect(csv).toContain('1-W07-P1,jackStud,2x6,81,"81""",4');
    expect(csv).toContain('1-W07-P1,header,2x10,41,"41""",2');
    const svg = result.files.find((f) => f.path === 'panels/1-W07-P1.svg')!.content;
    expect(svg).toContain('>cortar na obra 38&quot;</text>');
    expect(svg).toContain('<title>header 2x10 × 41&quot; (2 plies) [project] — ');
  });

  it('W04: porta em parede interna não portante leva 2x4 deitado (R602.7.4), sem cripples acima', () => {
    const w04 = result.panels.find((p) => p.id === '1-W04-P1')!;
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
    expect(csv).toContain('1-W04-P1,header,2x4,35,"35""",1');
    const svg = result.files.find((f) => f.path === 'panels/1-W04-P1.svg')!.content;
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
    expect(buildProject(p).panels.find((x) => x.id === '1-W03-P1')!.members.some((m) => m.role === 'header')).toBe(true);
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

  it('aberturas próximas demais (P16) viram problema, sem arquivos; parede de 20\' sai emendada, sem erro da BOM (S15)', () => {
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

    // Sem a abertura o projeto gera: a W99 (240") cabe num painel e as plates são emendadas sobre stud (P14),
    // então a BOM não vê peça acima do estoque de 16'.
    walls[0]!.openings = [];
    const result = buildProject(p);
    const w99 = result.panels.find((x) => x.id === '1-W99-P1')!;
    const plates = w99.members.filter((m) => m.role === 'bottomPlate' || m.role === 'topPlate' || m.role === 'doubleTopPlate');
    expect(plates.map((m) => m.length).sort((a, b) => a - b)).toEqual([48, 48, 96, 144, 192, 192]);
    const bom = result.files.find((f) => f.path === 'bom.csv')!.content;
    expect(bom).not.toContain('oversize');
    expect(bom).toContain('2x6,commercial,192,"16\'-0""",');
  });

  it("parede acima de 20' é dividida em painéis W-P1, W-P2…; panels.csv traz posição, peso e avisos (S15)", () => {
    const p = example();
    p.house!.walls.push({
      id: 'W40',
      start: { x: 0, y: 600 },
      end: { x: 480, y: 600 },
      height: 97.125,
      section: '2x6',
      exterior: true,
      bearing: true,
      floorsSupported: 0,
      openings: [{ id: 'P40', type: 'door', offset: 168, roughWidth: 38, roughHeight: 82.5, header: { section: '2x10', plies: 2 } }],
    });
    const result = buildProject(p);
    expect(result.panels.map((x) => x.id).slice(7)).toEqual(['1-W40-P1', '1-W40-P2']);
    expect(result.files.map((f) => f.path).slice(-2)).toEqual(['panels/1-W40-P1.svg', 'panels/1-W40-P2.svg']);
    const csv = result.files.find((f) => f.path === 'panels.csv')!.content;
    expect(csv.split('\n')[0]).toBe('panel,wall,level,offset_in,offset,length_in,length,height_in,height,section,pieces,weight_lb,warnings');
    expect(csv).toContain('1-W01-P1,W01,1,0,"0""",146.75,"12\'-2 3/4""",97.125,"8\'-1 1/8""",2x6,');
    expect(csv).toContain('1-W40-P1,W40,1,0,"0""",240,"20\'-0""",97.125,"8\'-1 1/8""",2x6,');
    expect(csv).toContain('1-W40-P2,W40,1,240,"20\'-0""",240,"20\'-0""",97.125,"8\'-1 1/8""",2x6,');
    const p1 = csv.split('\n').find((l) => l.startsWith('1-W40-P1,'))!.split(',');
    // peças (plies contam) e peso em lb
    expect(Number(p1[10])).toBe(result.panels[7]!.members.reduce((n, m) => n + (m.plies ?? 1), 0));
    expect(Number(p1[11])).toBe(result.panels[7]!.weightLb);
    expect(p1[12]).toBe('');
    // config.panel do projeto: máximo de 12' divide a W40 em quatro, com quebras em múltiplos de 48 (módulo).
    p.config.panel = { maxLength: 144, module: 48, lap: 48, minLap: 24 };
    const four = buildProject(p).panels.filter((x) => x.wallId === 'W40');
    expect(four).toHaveLength(4);
    expect(four.reduce((n, x) => n + x.length, 0)).toBe(480);
    for (const x of four) {
      expect(x.length).toBeLessThanOrEqual(144);
      expect(x.wallOffset! % 48).toBe(0);
    }
  });

  it('ids que colidem no nome de arquivo são erro, não sobrescrita', () => {
    const p = example();
    const w = p.house!.walls[0]!;
    p.house!.walls = [
      { ...w, id: 'W/1' },
      { ...w, id: 'W_1', start: { x: 0, y: 900 }, end: { x: 144, y: 900 }, ends: {} },
    ];
    expect(() => buildProject(p)).toThrow(/"1-W\/1-P1" e "1-W_1-P1" gerariam o mesmo arquivo panels\/1-W_1-P1\.svg/);
  });

  describe('casa em planta (S13)', () => {
    it('W01 atravessa por ends, W02 encosta, W03 em T; as soltas saem como antes', () => {
      const plates = Object.fromEntries(result.panels.map((p) => [p.wallId, [p.length, p.layoutOrigin]]));
      expect(plates).toEqual({
        W01: [146.75, 0],
        W02: [189.25, -5.5],
        W03: [117.25, 0],
        W04: [126, 0],
        W05: [144, 0],
        W06: [120, 0],
        W07: [144, 0],
      });
      expect(result.panels.reduce((n, p) => n + p.members.length, 0)).toBe(130);
      const csv = result.files.find((f) => f.path === 'cutlist.csv')!.content;
      // S14: double top de W01 recua 5.5 no canto (atravessa); a de W02 avança 5.5 no canto e é cortada na faixa
      // do T de W03 (3.5"); a de W03 avança 5.5 sobre W02. Bottom e top não mudam.
      expect(csv).toContain('1-W01-P1,plates,2x6,146.75,"146 3/4""",2');
      expect(csv).toContain('1-W01-P1,plates,2x6,141.25,"141 1/4""",1');
      expect(csv).toContain('1-W02-P1,plates,2x6,189.25,"189 1/4""",2');
      expect(csv).toContain('1-W02-P1,plates,2x6,97,"97""",1');
      expect(csv).toContain('1-W02-P1,plates,2x6,94.25,"94 1/4""",1');
      expect(csv).toContain('1-W02-P1,block,2x6,14.5,"14 1/2""",3');
      expect(csv).toContain('1-W03-P1,plates,2x4,122.75,"122 3/4""",1');
      expect(csv).toContain('1-W03-P1,plates,2x4,117.25,"117 1/4""",2');
      // Canto California: W01 atravessa e ganha o stud flat em x=1.5.
      const w01 = result.panels.find((p) => p.id === '1-W01-P1')!;
      expect(w01.members.filter((m) => m.role === 'stud' && m.flat === true).map((m) => m.x)).toEqual([1.5]);
      // W02: layout da quina — primeiro stud de marca em 9.75 (marca 10.5 = 16 − 5.5).
      const w02 = result.panels.find((p) => p.id === '1-W02-P1')!;
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
      expect(warnings).toEqual([{ panelId: '1-W02-P1', warning: expect.objectContaining({ code: 'OPENING_AT_TEE' }) }]);
    });

    it('formato por comprimento continua valendo: mesmas paredes soltas, mesmos painéis', () => {
      const loose: Project = {
        name: 'solta',
        config: example().config,
        walls: [{ id: 'W05', length: 144, height: 97.125, section: '2x6', exterior: true, bearing: true, floorsSupported: 0, openings: example().house!.walls[4]!.openings }],
      };
      const panel = buildProject(loose).panels[0]!;
      expect(panel.members).toEqual(result.panels.find((p) => p.id === '1-W05-P1')!.members);
      // Parede solta também numera com o pavimento, mas não gera plan.svg nem Panel.plan.
      expect(panel.id).toBe('1-W05-P1');
      expect(panel.plan).toBeUndefined();
      expect(buildProject(loose).files.map((f) => f.path)).toEqual(['cutlist.csv', 'bom.csv', 'panels.csv', 'panels/1-W05-P1.svg']);
    });

    it('plan.svg: planta de painéis com o nome do projeto, as 7 paredes e a seta do norte do projeto (S16)', () => {
      const plan = result.files.find((f) => f.path === 'plan.svg')!.content;
      expect(plan.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(plan).toContain('>casa-exemplo</text>');
      expect(plan).toContain('>7 paredes · 7 painéis · ');
      expect(plan.match(/<rect class="wall /g)).toHaveLength(7);
      expect(plan).toContain('>1-W01-P1</text>');
      expect(plan).toContain('<g class="north" transform="rotate(0 ');
      // Painéis em planta: a W01 (atravessa por ends) começa na face externa da W02.
      expect(result.panels[0]!.plan).toEqual({ start: { x: -2.75, y: 0 }, end: { x: 144, y: 0 } });
      // Sem northAngle no projeto, sem seta.
      const p = example();
      delete p.house!.northAngle;
      expect(buildProject(p).files.find((f) => f.path === 'plan.svg')!.content).not.toContain('class="north"');
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
