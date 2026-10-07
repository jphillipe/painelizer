import { describe, expect, it } from 'vitest';
import type { Config, Panel, Wall } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { esc, memberBox, panelSvg, px } from '../../src/output/svg';
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

/** Origem do desenho em px: margem 24 + 56 de espaço para a cota da altura; 24 + 44 do título. */
const X0 = 24 + 56;
const Y0 = 24 + 44;

function rects(svg: string): string[] {
  return svg.match(/<rect class="member [^"]+"[^>]*>/g) ?? [];
}

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(` ${name}="([^"]*)"`));
  if (!m) throw new Error(`atributo ${name} não encontrado em ${tag}`);
  return m[1] as string;
}

function layoutLabels(svg: string): string[] {
  return [...svg.matchAll(/font-size="9"[^>]*>([^<]*)<\/text>/g)].map((m) =>
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
