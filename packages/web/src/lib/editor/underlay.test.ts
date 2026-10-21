import { describe, expect, it } from 'vitest';
import { EXAMPLES } from 'cli/examples';
import { draftFromText, textFromDraft } from './draft';
import { imageToPlan, initialTransform, planToImage, rotated, scaleFromPoints, svgMatrix, UNDERLAY_KEY, underlayOf, withoutUnderlay, withPixelAt, withScale, type Underlay } from './underlay';

const base: Underlay = { version: 1, source: { name: 'A-100.pdf', page: 3 }, image: 'data:image/jpeg;base64,AAAA', width: 2000, height: 1000, scale: 0.25, origin: { x: 0, y: 0 }, rotation: 0, opacity: 0.35, visible: true };

describe('underlay (M6): transformação imagem ↔ planta', () => {
  it('ida e volta em todas as rotações', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const u = { ...base, rotation, origin: { x: 12, y: -7 } };
      for (const px of [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 1234.5, y: 678 }]) {
        const back = planToImage(u, imageToPlan(u, px));
        expect(back.x).toBeCloseTo(px.x, 9);
        expect(back.y).toBeCloseTo(px.y, 9);
      }
    }
  });

  it('sem rotação, v cresce para baixo na imagem e para baixo na planta (y diminui)', () => {
    expect(imageToPlan(base, { x: 100, y: 0 })).toEqual({ x: 25, y: 0 });
    expect(imageToPlan(base, { x: 0, y: 100 })).toEqual({ x: 0, y: -25 });
    // 90° anti-horário: +u vira +y.
    expect(imageToPlan({ ...base, rotation: 90 }, { x: 100, y: 0 })).toEqual({ x: 0, y: 25 });
  });

  it('initialTransform: cabe na caixa das paredes, centrada', () => {
    const t = initialTransform(2000, 1000, { x: 0, y: 0, w: 480, h: 336 });
    expect(t.scale).toBeCloseTo(Math.max(480 / 2000, 336 / 1000), 9);
    const center = imageToPlan({ ...t }, { x: 1000, y: 500 });
    expect(center.x).toBeCloseTo(240, 9);
    expect(center.y).toBeCloseTo(168, 9);
    expect(initialTransform(100, 100, undefined).scale).toBe(4.8);
  });

  it('escala por dois pontos, mantendo o primeiro ponto no lugar', () => {
    const a = { x: 100, y: 100 };
    const b = { x: 500, y: 400 };
    const scale = scaleFromPoints(a, b, 240);
    expect(scale).toBeCloseTo(240 / 500, 9);
    expect(scaleFromPoints(a, a, 10)).toBeUndefined();
    expect(scaleFromPoints(a, b, 0)).toBeUndefined();
    const before = imageToPlan(base, a);
    const u = withScale(base, scale!, a);
    const after = imageToPlan(u, a);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    const d = imageToPlan(u, b);
    expect(Math.hypot(d.x - after.x, d.y - after.y)).toBeCloseTo(240, 9);
  });

  it('origem: o pixel clicado passa a cair em (0,0); rotação gira em torno do centro', () => {
    const u = withPixelAt({ ...base, origin: { x: 50, y: 50 } }, { x: 400, y: 300 }, { x: 0, y: 0 });
    expect(imageToPlan(u, { x: 400, y: 300 })).toEqual({ x: 0, y: 0 });
    const center = { x: base.width / 2, y: base.height / 2 };
    const c0 = imageToPlan(base, center);
    const r = rotated(base, 90);
    expect(r.rotation).toBe(90);
    const c1 = imageToPlan(r, center);
    expect(c1.x).toBeCloseTo(c0.x, 9);
    expect(c1.y).toBeCloseTo(c0.y, 9);
    expect(rotated(rotated(base, -90), -90).rotation).toBe(180);
  });

  it('svgMatrix leva pixels a px de tela pelo viewport', () => {
    const v = { scale: 2, tx: 100, ty: 500 };
    expect(svgMatrix(base, v)).toBe('matrix(0.5 0 0 0.5 100 500)');
    // 90° anti-horário: +u sobe na tela (y negativo), +v vai para +x.
    expect(svgMatrix({ ...base, rotation: 90 }, v)).toBe('matrix(0 -0.5 0.5 0 100 500)');
  });
});

describe('underlay no draft', () => {
  it('fica em `$underlay`, sobrevive à serialização, é validado na leitura e `withoutUnderlay` o tira', () => {
    const r = draftFromText(EXAMPLES[1]!.text);
    if (!r.ok) throw new Error('fixture');
    const d = { ...r.draft, extra: { ...(r.draft.extra ?? {}), [UNDERLAY_KEY]: base } };
    const text = textFromDraft(d);
    expect(text).toContain('"$underlay"');
    const again = draftFromText(text);
    expect(again.ok && underlayOf(again.draft)?.source).toEqual({ name: 'A-100.pdf', page: 3 });
    expect(underlayOf({ extra: { [UNDERLAY_KEY]: { version: 2 } } })).toBeUndefined();
    expect(underlayOf({ extra: { [UNDERLAY_KEY]: { ...base, scale: 0 } } })).toBeUndefined();
    expect(underlayOf({ extra: { [UNDERLAY_KEY]: { ...base, rotation: 45, opacity: 7 } } })).toMatchObject({ rotation: 0, opacity: 1 });
    const stripped = withoutUnderlay(d);
    expect(stripped.extra?.[UNDERLAY_KEY]).toBeUndefined();
    expect(textFromDraft(stripped)).not.toContain('$underlay');
    expect(withoutUnderlay(r.draft)).toBe(r.draft);
  });
});
