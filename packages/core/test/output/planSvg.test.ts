import { describe, expect, it } from 'vitest';
import type { Config, Panel } from '../../src/types';
import type { House } from '../../src/house/types';
import { panelizeHouse } from '../../src/house/panelizeHouse';
import { housePlanSvg } from '../../src/output/planSvg';
import { px } from '../../src/output/svg';
import house28x40 from '../fixtures/house-28x40.json';
import cornerL from '../fixtures/house-corner-L.json';

const house = house28x40.house as House;
const config = house28x40.config as Config;
const { panels } = panelizeHouse(house, config);
const svg = housePlanSvg(house, panels);

/** Origem do desenho em px: margem 24 + 52 da cota da altura + 30 de folga; 24 + 44 do título + 30. */
const X0 = 24 + 52 + 30;
const Y0 = 24 + 44 + 30;
/** Faces externas da casa: x de −2.75 a 482.75, y de −2.75 a 338.75 (plates 2x6 das paredes que atravessam). */
const MIN_X = -2.75;
const MAX_Y = 338.75;
const toPx = (x: number): number => X0 + (x - MIN_X) * 2;
const toPy = (y: number): number => Y0 + (MAX_Y - y) * 2;

function tags(s: string, re: RegExp): string[] {
  return s.match(re) ?? [];
}

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(` ${name}="([^"]*)"`));
  if (!m) throw new Error(`atributo ${name} não encontrado em ${tag}`);
  return m[1] as string;
}

describe('housePlanSvg — casa 28x40', () => {
  it('é um documento SVG autocontido, com título e resumo', () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).not.toMatch(/NaN|undefined/);
    expect(svg).toContain('>Planta de painéis</text>');
    expect(svg).toContain(`>5 paredes · 12 painéis · 40'-5 1/2&quot; × 28'-5 1/2&quot; (faces externas)</text>`);
  });

  it('uma plate por parede, com a espessura real e as pontas como ficam (quem atravessa vai à face externa)', () => {
    const walls = tags(svg, /<rect class="wall [^"]+"[^>]*>/g);
    expect(walls).toHaveLength(5);
    expect(walls.filter((w) => w.includes('class="wall exterior"'))).toHaveLength(4);
    // W01 atravessa os dois cantos: de −2.75 a 482.75 (485.5" × 5.5"), eixo em y=0.
    const w01 = walls[0]!;
    expect(attr(w01, 'x')).toBe(px(toPx(-2.75)));
    expect(attr(w01, 'y')).toBe(px(toPy(2.75)));
    expect(attr(w01, 'width')).toBe(px(485.5 * 2));
    expect(attr(w01, 'height')).toBe('11');
    // W02 encosta: de y=2.75 a 333.25, eixo em x=480.
    const w02 = walls[1]!;
    expect(attr(w02, 'x')).toBe(px(toPx(480 - 2.75)));
    expect(attr(w02, 'y')).toBe(px(toPy(333.25)));
    expect(attr(w02, 'width')).toBe('11');
    expect(attr(w02, 'height')).toBe(px(330.5 * 2));
    // W05 interna 2x4: 3.5" de espessura, das faces de W01 e W03.
    const w05 = walls[4]!;
    expect(w05).toContain('class="wall interior"');
    expect(attr(w05, 'x')).toBe(px(toPx(264 - 1.75)));
    expect(attr(w05, 'width')).toBe('7');
    expect(attr(w05, 'height')).toBe(px(330.5 * 2));
    expect(svg).toContain(`<title>W01 2x6 · plate 40'-5 1/2&quot; · 3 painéis</title>`);
    expect(svg).toContain(`<title>W05 2x4 · plate 27'-6 1/2&quot; · 2 painéis</title>`);
  });

  it('aberturas como vão: porta sem traço no eixo, janela com; id dentro do vão', () => {
    expect(tags(svg, /<g class="opening door"/g)).toHaveLength(3);
    expect(tags(svg, /<g class="opening window"/g)).toHaveLength(4);
    // P1 na W01: RO de 168 a 206 do start (0,0) — vão de 76 px × 11 px sobre a plate.
    const p1 = svg.slice(svg.indexOf('<g class="opening door"'), svg.indexOf('</g>', svg.indexOf('<g class="opening door"')));
    const gap = tags(p1, /<rect[^>]*>/g)[0]!;
    expect(attr(gap, 'x')).toBe(px(toPx(168)));
    expect(attr(gap, 'y')).toBe(px(toPy(2.75)));
    expect(attr(gap, 'width')).toBe('76');
    expect(attr(gap, 'height')).toBe('11');
    expect(tags(p1, /<line/g)).toHaveLength(2);
    expect(svg).toContain('<title>P1 porta · RO 38&quot; · parede W01</title>');
    expect(svg).toContain(`<text class="opening-id" x="${px(toPx(187))}" y="${px(toPy(0))}" font-size="7"`);
    // J2 na W02 (vertical, start (480,0), offset 72): vão de 11 × 72 px e o traço no eixo x=480.
    const j2 = svg.slice(svg.indexOf('<title>J2 janela'), svg.indexOf('</g>', svg.indexOf('<title>J2 janela')));
    expect(tags(j2, /<line/g)).toHaveLength(3);
    expect(j2).toContain(`<line x1="${px(toPx(480))}" y1="${px(toPy(72))}" x2="${px(toPx(480))}" y2="${px(toPy(108))}" stroke-width="0.75"/>`);
    expect(svg).toContain(`<text class="opening-id" x="${px(toPx(480))}" y="${px(toPy(90))}" font-size="7" fill="#333" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${px(toPx(480))} ${px(toPy(90))})">J2</text>`);
  });

  it('juntas: um tique por quebra, atravessando a parede e passando 6 px de cada face', () => {
    const joints = tags(svg, /<line class="joint"[^>]*>/g);
    expect(joints).toHaveLength(7);
    // Primeira quebra da W01 em x=141.25.
    const j = joints[0]!;
    expect(attr(j, 'x1')).toBe(px(toPx(141.25)));
    expect(attr(j, 'x2')).toBe(px(toPx(141.25)));
    expect(attr(j, 'y1')).toBe(px(toPy(-2.75) + 6));
    expect(attr(j, 'y2')).toBe(px(toPy(2.75) - 6));
    expect(svg).toContain('<title>junta 1-W01-P1 | 1-W01-P2</title>');
  });

  it('ids dos painéis do lado de fora, na ordem; ids de parede do lado de dentro; paredes em y com texto girado', () => {
    const ids = tags(svg, /<text class="panel-id"[^>]*>[^<]*<\/text>/g);
    expect(ids.map((t) => t.replace(/.*>([^<]*)<\/text>/, '$1'))).toEqual(house28x40.expected.panelIds);
    // 1-W01-P1: centro em x=69.25; W01 está abaixo do centro da planta → rótulo abaixo da face (y = −2.75 − 4.5).
    expect(ids[0]).toContain(`x="${px(toPx(69.25))}" y="${px(toPy(-2.75 - 4.5))}"`);
    expect(ids[0]).toContain('font-weight="bold"');
    expect(ids[0]).not.toContain('rotate');
    // 1-W02-P1: W02 à direita do centro → rótulo à direita da face, girado.
    expect(ids[3]).toContain(`x="${px(toPx(480 + 2.75 + 4.5))}" y="${px(toPy((2.75 + 189.25) / 2))}"`);
    expect(ids[3]).toContain(`transform="rotate(-90 ${px(toPx(487.25))} ${px(toPy(96))})"`);
    const wallIds = tags(svg, /<text class="wall-id"[^>]*>[^<]*<\/text>/g);
    expect(wallIds.map((t) => t.replace(/.*>([^<]*)<\/text>/, '$1'))).toEqual(['W01', 'W02', 'W03', 'W04', 'W05']);
    expect(wallIds[0]).toContain(`x="${px(toPx(240))}" y="${px(toPy(2.75 + 4.5))}"`);
  });

  it('cotas externas totais embaixo e à esquerda', () => {
    expect(svg).toContain(`>40'-5 1/2&quot;</text>`);
    expect(svg).toContain(`>28'-5 1/2&quot;</text>`);
    expect(tags(svg, /<g class="dim dim-length"/g)).toHaveLength(1);
    expect(tags(svg, /<g class="dim dim-height"/g)).toHaveLength(1);
  });

  it('seta do norte só com northAngle; o ângulo vira rotate() no sentido horário', () => {
    expect(svg).toContain('<g class="north" transform="rotate(0 ');
    expect(svg).toContain('<title>norte: 0° do +y da planta, sentido horário</title>');
    const { northAngle, ...rest } = house;
    expect(northAngle).toBe(0);
    expect(housePlanSvg(rest, panels)).not.toContain('class="north"');
    expect(housePlanSvg({ ...house, northAngle: 37.5 }, panels)).toContain('<g class="north" transform="rotate(37.5 ');
  });

  it('opções: scale muda o tamanho, title muda o cabeçalho', () => {
    const big = housePlanSvg(house, panels, { scale: 4, title: 'Casa 28x40' });
    expect(Number(attr(big, 'width')) - Number(attr(svg, 'width'))).toBe(485.5 * 2);
    expect(big).toContain('>Casa 28x40</text>');
  });

  it('área de clique por painel (M3): um rect transparente por painel com data-panel-id, por cima de tudo', () => {
    const hits = tags(svg, /<rect class="panel-hit"[^>]*>/g);
    expect(hits).toHaveLength(12);
    expect(hits.map((h) => attr(h, 'data-panel-id'))).toEqual(panels.map((p) => p.id));
    // 1-W01-P1: do start (−2.75, 0) ao fim do primeiro painel, 5.5" de espessura.
    const first = hits[0]!;
    const p1 = panels[0]!;
    expect(attr(first, 'x')).toBe(px(toPx(Math.min(p1.plan!.start.x, p1.plan!.end.x))));
    expect(attr(first, 'y')).toBe(px(toPy(2.75)));
    expect(attr(first, 'width')).toBe(px(Math.abs(p1.plan!.end.x - p1.plan!.start.x) * 2));
    expect(attr(first, 'height')).toBe('11');
    expect(svg.indexOf('<g class="panel-hits"')).toBeGreaterThan(svg.lastIndexOf('class="panel-id"'));
    expect(tags(svg, /<text class="panel-id" data-panel-id="[^"]+"/g)).toHaveLength(12);
  });

  it('determinístico e igual ao snapshot test/__snapshots__/house-28x40-plan.svg', async () => {
    expect(housePlanSvg(house, panels)).toBe(svg);
    await expect(svg).toMatchFileSnapshot('../__snapshots__/house-28x40-plan.svg');
  });

  it('entradas inválidas lançam RangeError', () => {
    expect(() => housePlanSvg(house, panels, { scale: 0 })).toThrow(RangeError);
    expect(() => housePlanSvg(house, panels, { margin: -1 })).toThrow(RangeError);
    expect(() => housePlanSvg({ ...house, northAngle: Number.NaN }, panels)).toThrow(/northAngle/);
    const noPlan: Panel[] = panels.map(({ plan, ...p }) => p);
    expect(() => housePlanSvg(house, noPlan)).toThrow(/painel 1-W01-P1 sem plan/);
    expect(() => housePlanSvg(house, [{ ...panels[0]!, wallId: 'X' }])).toThrow(/parede X, que não está na casa/);
    expect(() => housePlanSvg(house, panels.filter((p) => p.wallId !== 'W05'))).toThrow(/parede W05 sem painéis/);
  });
});

describe('housePlanSvg — canto em L', () => {
  it('W1 atravessa (plate de −2.75 a 144) e W2 encosta (de 2.75 a 120); sem juntas', () => {
    const h = cornerL.house as House;
    const out = housePlanSvg(h, panelizeHouse(h, cornerL.config as Config).panels);
    const walls = tags(out, /<rect class="wall [^"]+"[^>]*>/g);
    expect(walls).toHaveLength(2);
    expect(attr(walls[0]!, 'width')).toBe(px(146.75 * 2));
    expect(attr(walls[1]!, 'height')).toBe(px(117.25 * 2));
    expect(out).not.toContain('class="joint"');
    expect(out).toContain('>1-W1-P1</text>');
    expect(out).toContain('>1-W2-P1</text>');
    expect(out).toContain(`>2 paredes · 2 painéis · 12'-2 3/4&quot; × 10'-2 3/4&quot; (faces externas)</text>`);
  });
});
