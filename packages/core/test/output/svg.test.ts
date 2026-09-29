import { describe, expect, it } from 'vitest';
import type { Config, Member, Panel, Wall } from '../../src/types';
import { panelizeWall } from '../../src/panelize/panelizeWall';
import { esc, memberBox, panelSvg, px } from '../../src/output/svg';
import plain from '../fixtures/wall-144-plain.json';
import window from '../fixtures/wall-144-window.json';

const plainPanel = panelizeWall(plain.wall as Wall, plain.config as Config);

/** Painel montado a partir dos members esperados do fixture da janela (S7 ainda não existe). */
const windowPanel: Panel = {
  id: window.wall.id,
  wallId: window.wall.id,
  length: window.wall.length,
  height: window.wall.height,
  section: window.wall.section as Panel['section'],
  members: window.expected.members as Member[],
  warnings: [],
};

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
      '<title>header 2x10 × 39&quot; (2 plies) — x=46 1/2&quot; y=84 7/8&quot;</title>',
    );
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

  it('snapshot do fixture da janela (members esperados) em test/__snapshots__/wall-144-window.svg', async () => {
    await expect(panelSvg(windowPanel)).toMatchFileSnapshot('../__snapshots__/wall-144-window.svg');
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
