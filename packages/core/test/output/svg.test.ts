import { describe, expect, it } from 'vitest';
import type { Config, Member, Panel, Wall } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { esc, memberBox, panelSvg, px, verticalCenters, viewNote } from '../../src/output/svg';
import { panelizeHouse } from '../../src/house/panelizeHouse';
import type { House } from '../../src/house/types';
import cornerL from '../fixtures/house-corner-L.json';
import plain from '../fixtures/wall-144-plain.json';
import window from '../fixtures/wall-144-window.json';
import door from '../fixtures/wall-120-door.json';
import windowDoor from '../fixtures/wall-144-window-door.json';
import irc from '../fixtures/wall-144-window-irc.json';
import nonBearingDoor from '../fixtures/wall-120-door-nonbearing.json';

const plainPanel = panelizeWall(plain.wall as Wall, plain.config as Config);
const nonBearingDoorPanel = panelizeWall(nonBearingDoor.wall as Wall, nonBearingDoor.config as Config);

const windowPanel = panelizeWall(window.wall as Wall, window.config as Config);
const lowHeaderPanel = panelizeWall(window.wall as Wall, {
  ...(window.config as Config),
  headerHeight: 82.5,
});

/** Origem do desenho em px: margem 24 + 56 de espaço para a cota da altura; 24 + 60 do cabeçalho (S17). */
const X0 = 24 + 56;
const Y0 = 24 + 60;

function rects(svg: string): string[] {
  return svg.match(/<rect class="member [^"]+"[^>]*>/g) ?? [];
}

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(` ${name}="([^"]*)"`));
  if (!m) throw new Error(`atributo ${name} não encontrado em ${tag}`);
  return m[1] as string;
}

function layoutLabels(svg: string): string[] {
  return [...svg.matchAll(/font-size="9" fill="#666" text-anchor="middle">([^<]*)<\/text>/g)].map((m) =>
    (m[1] as string).replace(/&quot;/g, '"'),
  );
}

describe('memberBox', () => {
  it('vertical: 1.5 de largura × comprimento de altura', () => {
    const stud = plainPanel.members.find((m) => m.role === 'stud')!;
    expect(memberBox(stud)).toEqual({ x: stud.x, y: 1.5, width: 1.5, height: 92.625 });
  });

  it('plate e sill deitados: comprimento × 1.5', () => {
    const plate = plainPanel.members.find((m) => m.role === 'bottomPlate')!;
    expect(memberBox(plate)).toEqual({ x: 0, y: 0, width: 144, height: 1.5 });
    const sill = windowPanel.members.find((m) => m.role === 'sill')!;
    expect(memberBox(sill)).toEqual({ x: 48, y: 35.375, width: 36, height: 1.5 });
  });

  it('header em pé: comprimento × profundidade da seção, topo encostado na top plate', () => {
    const header = windowPanel.members.find((m) => m.role === 'header')!;
    const box = memberBox(header);
    expect(box).toEqual({ x: 46.5, y: 84.875, width: 39, height: 9.25 });
    expect(box.y + box.height).toBe(94.125);
  });

  it('header deitado (parede não portante): comprimento × 1.5, como o sill', () => {
    const header = nonBearingDoorPanel.members.find((m) => m.role === 'header')!;
    expect(memberBox(header)).toEqual({ x: 38.5, y: 82.5, width: 41, height: 1.5 });
  });
});

describe('panelSvg', () => {
  const svg = panelSvg(plainPanel);

  it('é um documento SVG autocontido', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).not.toMatch(/NaN|undefined/);
  });

  it('um retângulo por member (13 no fixture plain, 18 na janela)', () => {
    expect(rects(svg)).toHaveLength(13);
    expect(rects(panelSvg(windowPanel))).toHaveLength(18);
  });

  it('ID do painel no topo e cotas de comprimento e altura em pés-pol-fração', () => {
    expect(svg).toContain('>W-plain</text>');
    expect(svg).toContain(`>12'-0&quot;</text>`);
    expect(svg).toContain(`>8'-1 1/8&quot;</text>`);
  });

  it('escala 4 px/pol: último stud em x = 142.5 → 570 px da origem, 6 px de largura', () => {
    const last = rects(svg).find((r) => r.includes(`x="${X0 + 142.5 * 4}"`));
    expect(last).toBeDefined();
    expect(attr(last!, 'width')).toBe('6');
    expect(attr(last!, 'height')).toBe(String(92.625 * 4));
    // topo do stud em y = 1.5 + 92.625 = 94.125 → (97.125 − 94.125) × 4 = 12 px abaixo da origem
    expect(attr(last!, 'y')).toBe(String(Y0 + 12));
  });

  it('eixo y invertido: bottom plate no rodapé do desenho, double top plate no topo', () => {
    const bottom = rects(svg).find((r) => r.includes('class="member bottomPlate"'))!;
    const dtp = rects(svg).find((r) => r.includes('class="member doubleTopPlate"'))!;
    expect(attr(bottom, 'y')).toBe(String(Y0 + (97.125 - 1.5) * 4));
    expect(attr(bottom, 'width')).toBe(String(144 * 4));
    expect(attr(dtp, 'y')).toBe(String(Y0));
  });

  it('marcas de layout no rodapé: múltiplos de 16 e o fechamento 142.5', () => {
    expect(layoutLabels(svg)).toEqual([
      '0"',
      '16"',
      '32"',
      '48"',
      '64"',
      '80"',
      '96"',
      '112"',
      '128"',
      '142 1/2"',
    ]);
  });

  it('studSpacing 24 muda as marcas', () => {
    expect(layoutLabels(panelSvg(plainPanel, { studSpacing: 24 }))).toEqual([
      '0"',
      '24"',
      '48"',
      '72"',
      '96"',
      '120"',
      '142 1/2"',
    ]);
  });

  it('header recebe rótulo com seção, comprimento e plies', () => {
    const w = panelSvg(windowPanel);
    expect(w).toContain('2x10 × 39&quot; (2 plies)</text>');
    expect(w).toContain(
      '<title>header 2x10 × 39&quot; (2 plies) [project] — x=46 1/2&quot; y=84 7/8&quot;</title>',
    );
  });

  it('header escolhido pela tabela: seção, plies e a tabela de origem no <title>', async () => {
    const out = panelSvg(panelizeWall(irc.wall as Wall, irc.config as Config));
    expect(out).toContain(
      '<title>header 2x6 × 42&quot; (2 plies) [R602.7(1)] — x=45&quot; y=82 1/2&quot;</title>',
    );
    expect(rects(out)).toHaveLength(22);
    await expect(out).toMatchFileSnapshot('../__snapshots__/wall-144-window-irc.svg');
  });

  it('avisos do painel aparecem no rodapé, com texto escapado', () => {
    const withWarning: Panel = {
      ...plainPanel,
      warnings: [{ code: 'STUD_LENGTH_MISMATCH', message: 'stud <92 5/8"> & etc' }],
    };
    const w = panelSvg(withWarning);
    expect(w).toContain('! STUD_LENGTH_MISMATCH: stud &lt;92 5/8&quot;&gt; &amp; etc</text>');
  });

  it('escala configurável muda o tamanho do desenho', () => {
    const w = panelSvg(plainPanel, { scale: 2 });
    const bottom = rects(w).find((r) => r.includes('class="member bottomPlate"'))!;
    expect(attr(bottom, 'width')).toBe(String(144 * 2));
  });

  it('determinístico: mesma entrada, mesma string', () => {
    expect(panelSvg(plainPanel)).toBe(svg);
  });

  it('opções ou painel inválidos lançam RangeError', () => {
    expect(() => panelSvg(plainPanel, { scale: 0 })).toThrow(RangeError);
    expect(() => panelSvg(plainPanel, { studSpacing: -16 })).toThrow(RangeError);
    expect(() => panelSvg({ ...plainPanel, length: 0 })).toThrow(RangeError);
  });

  it('snapshot do fixture plain em test/__snapshots__/wall-144-plain.svg', async () => {
    await expect(svg).toMatchFileSnapshot('../__snapshots__/wall-144-plain.svg');
  });

  it('snapshot do fixture da janela em test/__snapshots__/wall-144-window.svg', async () => {
    await expect(panelSvg(windowPanel)).toMatchFileSnapshot('../__snapshots__/wall-144-window.svg');
  });

  it('snapshot da janela com headerHeight 82.5 em test/__snapshots__/wall-144-window-header-82.5.svg', async () => {
    expect(rects(panelSvg(lowHeaderPanel))).toHaveLength(20);
    await expect(panelSvg(lowHeaderPanel)).toMatchFileSnapshot(
      '../__snapshots__/wall-144-window-header-82.5.svg',
    );
  });
});

describe('panelSvg — corte na obra', () => {
  const doorPanel = panelizeWall(door.wall as Wall, door.config as Config);
  const doorSvg = panelSvg(doorPanel);

  it('trecho da bottom plate no vão da porta hachurado: x=40, 38" → 240 px, 152 px de largura', () => {
    const cuts = doorSvg.match(/<rect class="field-cut"[^>]*>/g) ?? [];
    expect(cuts).toHaveLength(1);
    const cut = cuts[0]!;
    expect(attr(cut, 'x')).toBe(px(X0 + 40 * 4));
    expect(attr(cut, 'width')).toBe('152');
    // topo da bottom plate (y=1.5) e 1.5" de altura
    expect(attr(cut, 'y')).toBe(px(Y0 + (97.125 - 1.5) * 4));
    expect(attr(cut, 'height')).toBe('6');
    expect(attr(cut, 'fill')).toBe('url(#field-cut-hatch)');
    expect(doorSvg).toContain('<pattern id="field-cut-hatch"');
    expect(doorSvg).toContain('>cortar na obra 38&quot;</text>');
  });

  it('a bottom plate continua uma peça só, de ponta a ponta', () => {
    const plates = rects(doorSvg).filter((r) => r.includes('bottomPlate'));
    expect(plates).toHaveLength(1);
    expect(attr(plates[0]!, 'width')).toBe('480');
  });

  it('painel sem corte não ganha <defs> nem hachura', () => {
    expect(panelSvg(windowPanel)).not.toContain('field-cut');
  });

  it('corte fora de qualquer peça do papel → RangeError', () => {
    const broken: Panel = {
      ...doorPanel,
      fieldCuts: [{ role: 'bottomPlate', openingId: 'x', x: 100, length: 38 }],
    };
    expect(() => panelSvg(broken)).toThrow(/abertura x .* bottomPlate/);
  });

  it('snapshot da porta em test/__snapshots__/wall-120-door.svg', async () => {
    expect(rects(doorSvg)).toHaveLength(16);
    await expect(doorSvg).toMatchFileSnapshot('../__snapshots__/wall-120-door.svg');
  });

  it('porta não portante: peça deitada com 6 px de altura, sem rótulo interno, origem R602.7.4 no <title>', async () => {
    const out = panelSvg(nonBearingDoorPanel);
    const header = rects(out).find((r) => r.includes('class="member header"'))!;
    expect(attr(header, 'height')).toBe('6');
    expect(attr(header, 'y')).toBe(px(Y0 + (97.125 - 84) * 4));
    expect(out).toContain('<title>header 2x4 × 41&quot; [R602.7.4] — x=38 1/2&quot; y=82 1/2&quot;</title>');
    expect(out).not.toContain('plies');
    expect(rects(out)).toHaveLength(14);
    await expect(out).toMatchFileSnapshot('../__snapshots__/wall-120-door-nonbearing.svg');
  });

  it('snapshot da janela + porta em test/__snapshots__/wall-144-window-door.svg', async () => {
    const panel = panelizeWall(windowDoor.wall as Wall, windowDoor.config as Config);
    const out = panelSvg(panel);
    expect(rects(out)).toHaveLength(24);
    await expect(out).toMatchFileSnapshot('../__snapshots__/wall-144-window-door.svg');
  });
});

describe('helpers', () => {
  it('px arredonda a 3 decimais e não emite -0', () => {
    expect(px(1 / 3)).toBe('0.333');
    expect(px(-0)).toBe('0');
    expect(px(370.5)).toBe('370.5');
  });

  it('esc escapa &, <, > e aspas', () => {
    expect(esc('a<b>&"c"')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
  });
});

describe('panelSvg — studs extras (S12)', () => {
  it('label do projeto entre aspas no <title> do stud extra; stud comum sem aspas', () => {
    const panel = panelizeWall(
      { ...(plain.wall as Wall), extraStuds: [{ x: 40, label: 'HDU2 "post"' }] },
      plain.config as Config,
    );
    const out = panelSvg(panel);
    expect(out).toContain(
      '<title>stud 2x6 × 92 5/8&quot; &quot;HDU2 &quot;post&quot;&quot; — x=40&quot; y=1 1/2&quot;</title>',
    );
    expect(out).toContain('<title>stud 2x6 × 92 5/8&quot; — x=0&quot; y=1 1/2&quot;</title>');
    expect(rects(out)).toHaveLength(14);
  });
});

describe('panelSvg — canto, T e laps da double top plate (S14)', () => {
  const config: Config = { ...(plain.config as Config), building: { groundSnowLoad: 50, buildingWidth: 336, windSpeed: 120 } };
  const base: Omit<Wall, 'id' | 'length'> = { height: 97.125, section: '2x6', exterior: true, bearing: true, floorsSupported: 0, openings: [] };

  it('memberBox do stud flat: profundidade da seção de largura', () => {
    const flat: Member = { role: 'stud', section: '2x6', length: 92.625, x: 1.5, y: 1.5, orientation: 'vertical', flat: true };
    expect(memberBox(flat)).toEqual({ x: 1.5, y: 1.5, width: 5.5, height: 92.625 });
    expect(memberBox({ ...flat, section: '2x4' }).width).toBe(3.5);
  });

  it('bloco do ladder: deitado, comprimento × 1.5, cor própria', () => {
    const block: Member = { role: 'block', section: '2x6', length: 14.5, x: 64.75, y: 23.25, orientation: 'horizontal' };
    expect(memberBox(block)).toEqual({ x: 64.75, y: 23.25, width: 14.5, height: 1.5 });
    const panel = panelizeWall({ ...base, id: 'T', length: 192, joints: { tees: [{ x: 72, width: 3.5 }] } }, config);
    const svg = panelSvg(panel);
    expect(rects(svg).filter((r) => r.includes('class="member block"'))).toHaveLength(3);
  });

  it('stud flat desenhado com 22 px (5.5" × 4) e "(flat)" no <title>', () => {
    const panel = panelizeWall({ ...base, id: 'C', length: 146.75, joints: { start: { kind: 'corner', through: true, otherThickness: 5.5 } } }, config);
    const svg = panelSvg(panel);
    const flat = rects(svg).find((r) => attr(r, 'x') === px(X0 + 1.5 * 4))!;
    expect(attr(flat, 'width')).toBe('22');
    expect(svg).toContain('<title>stud (flat) 2x6 × 92 5/8&quot; — x=1 1/2&quot; y=1 1/2&quot;</title>');
  });

  it('double top com avanço: o desenho abre espaço à esquerda, a peça começa fora do contorno e o avanço é cotado', () => {
    const panel = panelizeWall({ ...base, id: 'B', length: 117.25, joints: { start: { kind: 'corner', through: false, otherThickness: 5.5 } } }, config);
    const svg = panelSvg(panel);
    const over = 5.5 * 4;
    // Contorno deslocado em 22 px à direita e 22 px para baixo (espaço da cota do avanço); a double top
    // começa 22 px antes dele.
    expect(svg).toContain(`<rect x="${px(X0 + over)}" y="${px(Y0 + 22)}" width="469" height="388.5" fill="none"`);
    const dt = rects(svg).find((r) => r.includes('doubleTopPlate'))!;
    expect(attr(dt, 'x')).toBe(px(X0));
    expect(attr(dt, 'width')).toBe(px(122.75 * 4));
    expect(svg).toContain('>avanço 5 1/2&quot;</text>');
    // Largura total cresce exatamente o avanço.
    const plainSvg = panelSvg(panelizeWall({ ...base, id: 'B', length: 117.25 }, config));
    expect(Number(attr(svg, 'width')) - Number(attr(plainSvg, 'width'))).toBe(over);
  });

  it('avanço no fim: canvas cresce à direita e cota o avanço', () => {
    const panel = panelizeWall({ ...base, id: 'E', length: 100, joints: { end: { kind: 'tee', otherThickness: 3.5 } } }, config);
    const svg = panelSvg(panel);
    expect(svg).toContain('>avanço 3 1/2&quot;</text>');
    const plainSvg = panelSvg(panelizeWall({ ...base, id: 'E', length: 100 }, config));
    expect(Number(attr(svg, 'width')) - Number(attr(plainSvg, 'width'))).toBe(14);
  });

  it('sem joints o desenho não muda (snapshots wall-* intactos)', () => {
    expect(panelSvg(plainPanel)).not.toContain('avanço');
  });
});

describe('panelSvg — folha de fabricação (S17)', () => {
  const windowDoorPanel = panelizeWall(windowDoor.wall as Wall, windowDoor.config as Config);
  const sheet = panelSvg(windowDoorPanel, { project: 'Casa X', date: '2026-10-14', revision: 'A' });

  it('cabeçalho: projeto, data e revisão vêm de opts; parede, pavimento, seção, externa/portante, dimensões, peças e peso', () => {
    expect(sheet).toContain('text-anchor="end">Casa X</text>');
    expect(sheet).toContain('>data 2026-10-14 · rev. A</text>');
    expect(sheet).toContain(
      `>parede W-window-door · pavimento 1 · 2x6 externa portante · 12'-0&quot; × 8'-1 1/8&quot; · 24 peças · 312.5 lb</text>`,
    );
    // Sem opts: sem projeto nem carimbo; a folha nunca lê o relógio.
    const bare = panelSvg(windowDoorPanel);
    expect(bare).not.toContain('class="project"');
    expect(bare).not.toContain('class="stamp"');
    expect(panelSvg(windowDoorPanel)).toBe(bare);
  });

  it('linha da vista (P24): externa solta = vista de fora; facing interior = vista de dentro; interna só indica o início', () => {
    expect(viewNote({ exterior: true })).toMatch(/^Vista de fora — face externa voltada para o observador/);
    expect(viewNote({ exterior: true, facing: 'exterior' })).toMatch(/^Vista de fora/);
    expect(viewNote({ exterior: true, facing: 'interior' })).toMatch(/^Vista de dentro — face externa no verso/);
    expect(viewNote({ exterior: false })).toBe('Parede interna — início da parede (x=0) à esquerda');
    expect(viewNote({})).toBe('Início da parede (x=0) à esquerda');
    expect(sheet).toContain('class="view"');
    expect(sheet).toContain('>face externa (vista de fora)</text>');
    expect(panelSvg({ ...windowDoorPanel, facing: 'interior' })).toContain('>face externa no verso (vista de dentro)</text>');
    expect(panelSvg(nonBearingDoorPanel)).toContain('>parede interna</text>');
  });

  it('cotas de RO: largura; peitoril, altura do RO e base do header ao subfloor na janela; uma linha só na porta', () => {
    expect(sheet).toContain('>RO 36&quot;</text>');
    expect(sheet).toContain('>peitoril 34 1/2&quot;</text>');
    expect(sheet).toContain('>RO 48&quot;</text>');
    expect(sheet).toContain('>header 82 1/2&quot;</text>');
    expect(sheet).toContain('>RO 38&quot;</text>');
    expect(sheet).toContain('>RO 82 1/2&quot; = header 82 1/2&quot;</text>');
    expect(sheet).toContain('>win1 · janela</text>');
    expect(sheet).toContain('>door1 · porta</text>');
    // Linha da largura 9" abaixo do topo do RO (82.5 → 73.5): y = Y0 + (97.125 − 73.5) × 4.
    expect(sheet).toContain(`<line x1="${px(X0 + 24 * 4)}" y1="${px(Y0 + (97.125 - 73.5) * 4)}" x2="${px(X0 + 60 * 4)}"`);
    // Painel montado à mão (sem openings) não tem cotas de RO.
    const { openings, ...handMade } = windowDoorPanel;
    expect(panelSvg(handMade)).not.toContain('peitoril');
    expect(() => panelSvg({ ...windowDoorPanel, openings: [{ id: 'x', type: 'window', x: 0, width: 0, top: 80, height: 10 }] })).toThrow(RangeError);
  });

  it('rótulos curtos: K, J, C nas peças verticais altas o bastante; H no header; S na sill; B no bloco', () => {
    const labels = (svg: string, role: string) => svg.match(new RegExp(`<text class="label ${role}"[^>]*>[^<]*</text>`, 'g')) ?? [];
    expect(labels(sheet, 'kingStud')).toHaveLength(3);
    expect(labels(sheet, 'jackStud')).toHaveLength(4);
    // 4 cripples: os dois de 2 3/8" sobre o header (9.5 px) ficam sem letra.
    expect(labels(sheet, 'cripple')).toHaveLength(2);
    expect(labels(sheet, 'sill')).toHaveLength(1);
    // Header em pé: a letra vai no rótulo interno; header deitado ganha o "H" abaixo.
    expect(sheet).toContain('>H · 2x10 × 39&quot; (2 plies)</text>');
    expect(labels(sheet, 'header')).toHaveLength(0);
    expect(labels(panelSvg(nonBearingDoorPanel), 'header')).toHaveLength(1);
    const cfg: Config = { ...(plain.config as Config), building: { groundSnowLoad: 50, buildingWidth: 336, windSpeed: 120 } };
    const tee = panelizeWall({ ...(plain.wall as Wall), length: 192, joints: { tees: [{ x: 72, width: 3.5 }] } }, cfg);
    expect(labels(panelSvg(tee), 'block')).toHaveLength(3);
    // Kings vizinhos (2 por lado) na mesma altura: o segundo desce 11 px.
    const twoKings = panelizeWall({ ...(window.wall as Wall), openings: [{ ...(window.wall as Wall).openings[0]!, kingStuds: 2 }] }, window.config as Config);
    const ks = labels(panelSvg(twoKings), 'kingStud').map((t) => Number(attr(t, 'y')));
    expect(ks).toHaveLength(4);
    expect(new Set(ks).size).toBe(2);
  });

  it('stud extra: o label do projeto girado ao longo da peça, um rótulo por conjunto de studs colados', () => {
    const one = panelSvg(panelizeWall({ ...(plain.wall as Wall), extraStuds: [{ x: 40, label: 'HDU2 post' }] }, plain.config as Config));
    expect(one.match(/class="label extra"/g)).toHaveLength(1);
    expect(one).toContain('transform="rotate(-90 ');
    expect(one).toContain('>HDU2 post</text>');
    const two = panelSvg(panelizeWall({ ...(plain.wall as Wall), extraStuds: [{ x: 40, count: 2, label: 'HDU2 post' }] }, plain.config as Config));
    expect(two.match(/class="label extra"/g)).toHaveLength(1);
    // Centrado no conjunto 40–43: x = X0 + 41.5 × 4 + 3.
    expect(two).toContain(`<text class="label extra" x="${px(X0 + 41.5 * 4 + 3)}"`);
  });

  it('cadeia de cotas: 0 e o centro de cada peça vertical a partir de x=0, sem repetição; segunda fileira quando apertam', () => {
    const chain = (s: string) => [...s.matchAll(/<text class="chain-label (row-\d)"[^>]*>([^<]*)<\/text>/g)].map((m) => [m[2]!.replace(/&quot;/g, '"'), m[1]!]);
    expect(verticalCenters(plainPanel)).toEqual([0.75, 16, 32, 48, 64, 80, 96, 112, 128, 143.25]);
    const plainSheet = panelSvg(plainPanel);
    expect(chain(plainSheet).map((c) => c[0])).toEqual(['3/4"', '16"', '32"', '48"', '64"', '80"', '96"', '112"', '128"', '143 1/4"']);
    expect(chain(plainSheet).every((c) => c[1] === 'row-0')).toBe(true);
    // Janela + porta: king 21–22.5 (centro 21.75) e jack 22.5–24 (23.25) a 6 px → o jack desce de fileira.
    const wd = chain(sheet);
    expect(wd).toContainEqual(['21 3/4"', 'row-0']);
    expect(wd).toContainEqual(['23 1/4"', 'row-1']);
    expect(wd).toContainEqual(['62 1/4"', 'row-1']);
    expect(wd).toContainEqual(['63 3/4"', 'row-0']);
    // Cripple e stud na mesma marca contam uma vez.
    expect(verticalCenters(windowDoorPanel).filter((c) => c === 32)).toHaveLength(1);
  });

  it('lista de peças à direita: da cutList, com pés-pol e polegadas, total, peso e cortes na obra', () => {
    const row = (role: string) => sheet.match(new RegExp(`<g class="piece ${role}">.*?</g>`))![0]!;
    expect(row('plates')).toContain('>3</text>');
    expect(row('plates')).toContain('>plate</text>');
    expect(row('plates')).toContain(`>12'-0&quot;</text>`);
    expect(row('plates')).toContain('>144&quot;</text>');
    expect(row('kingStud')).toContain('>king (K)</text>');
    expect(row('kingStud')).toContain(`>7'-8 5/8&quot;</text>`);
    expect(sheet.match(/<g class="piece cripple">/g)).toHaveLength(2);
    expect(sheet).toContain('>2 3/8&quot;</text>');
    expect(sheet).toContain('>26</text>');
    expect(sheet).toContain('>peças a cortar</text>');
    expect(sheet).toContain('>Peso estimado: 312.5 lb</text>');
    expect(sheet).toContain('>bottom plate 38&quot; de x=64 1/2&quot; a 102 1/2&quot; (door1)</text>');
    // Peso de `weightLb` quando o painel já vem pesado (splitWall).
    expect(panelSvg({ ...windowDoorPanel, weightLb: 300 })).toContain('>Peso estimado: 300 lb</text>');
    // Lista à direita do desenho: a largura total cresce com a coluna fixa.
    expect(Number(attr(sheet, 'width'))).toBe(X0 + 144 * 4 + 28 + 282 + 24);
  });

  it('legenda no rodapé', () => {
    expect(sheet).toContain('class="legend"');
    expect(sheet).toContain('K king · J jack · C cripple · H header · S sill · B bloco');
  });

  it('painel de canto (house-corner-L): facing exterior na W1, interior na W2; snapshots', async () => {
    const { panels } = panelizeHouse(cornerL.house as House, cornerL.config as Config);
    const [w1, w2] = panels;
    expect(w1!.facing).toBe('exterior');
    expect(w2!.facing).toBe('interior');
    const s1 = panelSvg(w1!, { project: 'house-corner-L' });
    const s2 = panelSvg(w2!, { project: 'house-corner-L' });
    expect(s1).toContain('>face externa (vista de fora)</text>');
    expect(s2).toContain('>face externa no verso (vista de dentro)</text>');
    // Flat de canto (1.5–7, centro 4.25) entra na cadeia; fechamento colado à marca 144 desce uma linha.
    expect(s1).toContain('>4 1/4&quot;</text>');
    expect(s1).toContain(`y="${px(Y0 + 97.125 * 4 + 28 + 34 + 22)}" font-size="9" fill="#666" text-anchor="middle">145 1/4&quot;</text>`);
    await expect(s1).toMatchFileSnapshot('../__snapshots__/house-corner-L-W1.svg');
    await expect(s2).toMatchFileSnapshot('../__snapshots__/house-corner-L-W2.svg');
  });
});
