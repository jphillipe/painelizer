import { describe, expect, it } from 'vitest';
import type { Opening } from '../../src/types';
import type { EndRule, HouseWall } from '../../src/house/types';
import { DEFAULT_TOLERANCE, findConnections } from '../../src/house/connections';

const base = { height: 97.125, section: '2x6' as const, exterior: true, bearing: true, openings: [] as Opening[] };

function wall(
  id: string,
  start: [number, number],
  end: [number, number],
  extra: Partial<Pick<HouseWall, 'section' | 'ends' | 'exterior'>> = {},
): HouseWall {
  return { ...base, id, start: { x: start[0], y: start[1] }, end: { x: end[0], y: end[1] }, ...extra };
}

describe('findConnections — canto', () => {
  it('L: a mais longa atravessa; a outra encosta; pontas livres do outro lado (P21)', () => {
    const [w1, w2] = findConnections([wall('W1', [0, 0], [144, 0]), wall('W2', [0, 0], [0, 120])]);
    expect(w1).toEqual({
      wallId: 'W1',
      start: { kind: 'corner', wallId: 'W2', through: true, at: { x: 0, y: 0 } },
      end: { kind: 'free' },
      tees: [],
    });
    expect(w2).toEqual({
      wallId: 'W2',
      start: { kind: 'corner', wallId: 'W1', through: false, at: { x: 0, y: 0 } },
      end: { kind: 'free' },
      tees: [],
    });
  });

  it('empate de comprimento: a primeira do arquivo atravessa', () => {
    const [a, b] = findConnections([wall('A', [0, 0], [0, 100]), wall('B', [0, 0], [100, 0])]);
    expect(a!.start).toMatchObject({ kind: 'corner', through: true });
    expect(b!.start).toMatchObject({ kind: 'corner', through: false });
  });

  it('ends declarado manda sobre o comprimento, em qualquer das duas paredes', () => {
    const short = (ends: NonNullable<HouseWall['ends']>) => wall('S', [0, 0], [0, 60], { ends });
    const long = (ends: NonNullable<HouseWall['ends']>) => wall('L', [0, 0], [200, 0], { ends });

    const [s1] = findConnections([short({ start: 'through' }), long({})]);
    expect(s1!.start).toMatchObject({ through: true });

    const [s2] = findConnections([short({}), long({ start: 'butt' })]);
    expect(s2!.start).toMatchObject({ through: true });

    const [s3] = findConnections([short({ start: 'butt' }), long({ start: 'through' })]);
    expect(s3!.start).toMatchObject({ through: false });
  });

  it('as duas declarando o mesmo papel no mesmo canto é erro', () => {
    expect(() =>
      findConnections([wall('A', [0, 0], [0, 60], { ends: { start: 'through' } }), wall('B', [0, 0], [200, 0], { ends: { start: 'through' } })]),
    ).toThrow(/A \(start\) and B \(start\) both declare ends "through"/);
  });

  it('ends de uma ponta livre não interfere', () => {
    const r = findConnections([wall('A', [0, 0], [0, 60], { ends: { end: 'butt' as EndRule } }), wall('B', [0, 0], [200, 0])]);
    expect(r[0]!.end).toEqual({ kind: 'free' });
  });

  it('canto em end × end e em end × start', () => {
    const r = findConnections([wall('A', [0, 0], [100, 0]), wall('B', [100, 50], [100, 0])]);
    expect(r[0]!.end).toMatchObject({ kind: 'corner', wallId: 'B', through: true, at: { x: 100, y: 0 } });
    expect(r[1]!.end).toMatchObject({ kind: 'corner', wallId: 'A', through: false });
  });

  it('ponta cotada na face da outra parede (a t/2 do cruzamento) ainda é canto, e `at` é o cruzamento', () => {
    // W2 começa na face interna de W1 (y = 2.75) em vez de no eixo.
    const r = findConnections([wall('W1', [0, 0], [144, 0]), wall('W2', [0, 2.75], [0, 120])]);
    expect(r[1]!.start).toEqual({ kind: 'corner', wallId: 'W1', through: false, at: { x: 0, y: 0 } });
    // E na face externa (y = −2.75), ou 0.5 além dela, também.
    expect(findConnections([wall('W1', [0, 0], [144, 0]), wall('W2', [0, -3.25], [0, 120])])[1]!.start.kind).toBe('corner');
  });

  it('fora da tolerância a ponta fica livre (vão entre as paredes)', () => {
    const r = findConnections([wall('W1', [0, 0], [144, 0]), wall('W2', [0, 3.3], [0, 120])]);
    expect(r[1]!.start).toEqual({ kind: 'free' });
    expect(r[0]!.start).toEqual({ kind: 'free' });
    // Com tolerância maior, volta a ser canto.
    expect(findConnections([wall('W1', [0, 0], [144, 0]), wall('W2', [0, 3.3], [0, 120])], 1)[1]!.start.kind).toBe('corner');
  });

  it('retângulo: as duas paredes longas atravessam os quatro cantos', () => {
    const r = findConnections([
      wall('S', [0, 0], [480, 0]),
      wall('E', [480, 0], [480, 336]),
      wall('N', [480, 336], [0, 336]),
      wall('W', [0, 336], [0, 0]),
    ]);
    const roles = r.map((c) => [c.wallId, (c.start as { through: boolean }).through, (c.end as { through: boolean }).through]);
    expect(roles).toEqual([
      ['S', true, true],
      ['E', false, false],
      ['N', true, true],
      ['W', false, false],
    ]);
    expect(r[2]!.end).toMatchObject({ wallId: 'W', at: { x: 0, y: 336 } });
  });
});

describe('findConnections — T e livre', () => {
  it('ponta no interior de outra parede é tee; a outra registra a parede que encosta', () => {
    const r = findConnections([wall('W1', [0, 0], [192, 0]), wall('W2', [96, 0], [96, 120], { section: '2x4' })]);
    expect(r[0]).toEqual({ wallId: 'W1', start: { kind: 'free' }, end: { kind: 'free' }, tees: [{ wallId: 'W2', at: { x: 96, y: 0 } }] });
    expect(r[1]).toEqual({ wallId: 'W2', start: { kind: 'tee', wallId: 'W1', at: { x: 96, y: 0 } }, end: { kind: 'free' }, tees: [] });
  });

  it('ponta do T cotada na face da parede atravessada (a t/2 do eixo) ainda é tee', () => {
    const r = findConnections([wall('W1', [0, 0], [192, 0]), wall('W2', [96, 2.75], [96, 120], { section: '2x4' })]);
    expect(r[1]!.start).toEqual({ kind: 'tee', wallId: 'W1', at: { x: 96, y: 0 } });
  });

  it('cruzamento em + (S31, P46): dois T de lados opostos viram um T de dois lados; as pontas ganham cross', () => {
    const r = findConnections([
      wall('W1', [0, 0], [192, 0]),
      wall('N', [96, 0], [96, 120], { section: '2x4' }),
      wall('S', [96, 0], [96, -120], { section: '2x4' }),
    ]);
    expect(r[0]!.tees).toEqual([{ wallId: 'N', at: { x: 96, y: 0 }, sides: 2, otherWallId: 'S', width: 3.5 }]);
    expect(r[1]!.start).toEqual({ kind: 'tee', wallId: 'W1', at: { x: 96, y: 0 }, cross: true });
    expect(r[2]!.start).toEqual({ kind: 'tee', wallId: 'W1', at: { x: 96, y: 0 }, cross: true });
  });

  it('+ com faixas deslocadas ou de larguras diferentes: a faixa é a união', () => {
    const r = findConnections([
      wall('W1', [0, 0], [192, 0]),
      wall('N', [96, 0], [96, 120], { section: '2x4' }),
      wall('S', [98, 0], [98, -120], { section: '2x6' }),
    ]);
    // N: 94.25–97.75; S: 95.25–100.75 → 94.25–100.75, centro 97.5.
    expect(r[0]!.tees).toEqual([{ wallId: 'N', at: { x: 97.5, y: 0 }, sides: 2, otherWallId: 'S', width: 6.5 }]);
  });

  it('T de lados opostos que não se sobrepõem continuam dois T, sem cross', () => {
    const r = findConnections([
      wall('W1', [0, 0], [192, 0]),
      wall('N', [60, 0], [60, 120], { section: '2x4' }),
      wall('S', [96, 0], [96, -120], { section: '2x4' }),
    ]);
    expect(r[0]!.tees).toEqual([
      { wallId: 'N', at: { x: 60, y: 0 } },
      { wallId: 'S', at: { x: 96, y: 0 } },
    ]);
    expect(r[1]!.start).toEqual({ kind: 'tee', wallId: 'W1', at: { x: 60, y: 0 } });
  });

  it('parede solta ou eixos que se cruzam fora das paredes: tudo livre', () => {
    const r = findConnections([wall('A', [0, 0], [100, 0]), wall('B', [200, 10], [200, 100])]);
    for (const c of r) expect([c.start, c.end, c.tees]).toEqual([{ kind: 'free' }, { kind: 'free' }, []]);
  });

  it('tolerance inválida lança', () => {
    expect(() => findConnections([wall('A', [0, 0], [100, 0])], -1)).toThrow(RangeError);
    expect(DEFAULT_TOLERANCE).toBe(0.5);
  });
});

describe('findConnections — erros', () => {
  it('paredes que se cruzam', () => {
    expect(() => findConnections([wall('A', [0, 0], [200, 0]), wall('B', [100, -50], [100, 50])])).toThrow(
      /Walls A and B cross at \(100, 0\)/,
    );
  });

  it('paredes colineares ou lado a lado que se sobrepõem', () => {
    expect(() => findConnections([wall('A', [0, 0], [200, 0]), wall('B', [150, 0], [300, 0])])).toThrow(/A and B overlap by 50"/);
    // Colineares ponta a ponta: duas paredes livres em sequência, não é erro.
    expect(() => findConnections([wall('A', [0, 0], [200, 0]), wall('B', [200, 0], [300, 0])])).not.toThrow();
    // Paralelas lado a lado, corpos sobrepostos (eixos a 2" com 5.5" de espessura) também.
    expect(() => findConnections([wall('A', [0, 0], [200, 0]), wall('B', [0, 2], [200, 2])])).toThrow(/overlap by/);
  });

  it('paralelas afastadas ou colineares com vão não são erro', () => {
    expect(() => findConnections([wall('A', [0, 0], [200, 0]), wall('B', [0, 120], [200, 120])])).not.toThrow();
    expect(() => findConnections([wall('A', [0, 0], [200, 0]), wall('B', [210, 0], [300, 0])])).not.toThrow();
  });

  it('quatro pontas no mesmo ponto (duas linhas emendadas no mesmo lugar) continua erro', () => {
    expect(() =>
      findConnections([
        wall('A', [0, 0], [100, 0]),
        wall('B', [0, 0], [0, 100]),
        wall('C', [0, 0], [-100, 0]),
        wall('D', [0, 0], [0, -100]),
      ]),
    ).toThrow(/meets two walls/);
  });

  it('canto e T no mesmo lugar', () => {
    expect(() =>
      findConnections([wall('A', [-100, 0], [100, 0]), wall('B', [0, 0], [0, 100]), wall('C', [0, 0], [0, -100])]),
    ).not.toThrow(); // cruz: dois tees em A
    expect(() =>
      findConnections([wall('A', [0, 0], [100, 0]), wall('B', [0, 0], [0, 100]), wall('C', [-50, 0], [50, 0])]),
    ).toThrow(/overlap by/);
  });

  it('id duplicado, parede diagonal e comprimento zero', () => {
    expect(() => findConnections([wall('A', [0, 0], [100, 0]), wall('A', [0, 50], [100, 50])])).toThrow(/Wall A: duplicate wall id/);
    expect(() => findConnections([wall('A', [0, 0], [100, 100])])).toThrow(/not parallel to the plan axes/);
    expect(() => findConnections([wall('A', [0, 0], [0, 0])])).toThrow(/start and end are the same point/);
  });
});

describe('findConnections — emenda em T (S42, hipótese P54)', () => {
  const byId = (cs: ReturnType<typeof findConnections>) => Object.fromEntries(cs.map((c) => [c.wallId, c]));

  it('uma ponta chega onde duas paredes da mesma linha se emendam: canto com a da linha que atravessa, a outra continua', () => {
    // B sobe de P; A e C são a linha horizontal emendada em P. Mesma seção, externas e mesmo comprimento: a primeira do
    // arquivo (A) atravessa.
    const c = byId(
      findConnections([wall('A', [0, 0], [100, 0]), wall('B', [0, 0], [0, 100]), wall('C', [0, 0], [-100, 0])]),
    );
    expect(c.B!.start).toEqual({ kind: 'corner', wallId: 'A', through: false, at: { x: 0, y: 0 } });
    expect(c.A!.start).toEqual({ kind: 'corner', wallId: 'B', through: true, at: { x: 0, y: 0 } });
    expect(c.C!.start).toEqual({ kind: 'continues', wallId: 'A', cornerWallId: 'B', at: { x: 0, y: 0 } });
    expect([c.A!.tees, c.B!.tees, c.C!.tees]).toEqual([[], [], []]);
  });

  it('a linha atravessa mesmo sendo a mais curta; a externa ganha da interna (Matilda: N2, W3 e I11)', () => {
    const c = byId(
      findConnections([
        wall('N2', [198, 561.5], [396, 561.5]),
        wall('W3', [396, 561.5], [396, 581]),
        wall('I11', [396, 411.125], [396, 561.5], { exterior: false, section: '2x6' }),
      ]),
    );
    expect(c.N2!.end).toEqual({ kind: 'corner', wallId: 'W3', through: false, at: { x: 396, y: 561.5 } });
    expect(c.W3!.start).toEqual({ kind: 'corner', wallId: 'N2', through: true, at: { x: 396, y: 561.5 } });
    expect(c.I11!.end).toEqual({ kind: 'continues', wallId: 'W3', cornerWallId: 'N2', at: { x: 396, y: 561.5 } });
  });

  it('sem externa na linha, a mais grossa atravessa (Matilda: I19 entre I16 2x4 e I29 2x6)', () => {
    const int = { exterior: false } as const;
    const c = byId(
      findConnections([
        wall('I16', [426.75, 361.5], [513.25, 361.5], { ...int, section: '2x4' }),
        wall('I19', [513.25, 332.75], [513.25, 361.5], { ...int, section: '2x6' }),
        wall('I29', [513.25, 361.5], [579.5, 361.5], { ...int, section: '2x6' }),
      ]),
    );
    expect(c.I19!.end).toMatchObject({ kind: 'corner', wallId: 'I29', through: false });
    expect(c.I29!.start).toMatchObject({ kind: 'corner', wallId: 'I19', through: true });
    expect(c.I16!.end).toEqual({ kind: 'continues', wallId: 'I29', cornerWallId: 'I19', at: { x: 513.25, y: 361.5 } });
  });

  it('linha com os eixos desencontrados de até a espessura (face alinhada) ainda é a mesma linha', () => {
    // C (2x4) tem o eixo 1" abaixo do de A (2x6): faces de baixo alinhadas.
    const c = byId(
      findConnections([
        wall('A', [0, 0], [100, 0]),
        wall('B', [0, 0], [0, 100], { exterior: false, section: '2x4' }),
        wall('C', [0, -1], [-100, -1], { section: '2x4' }),
      ]),
    );
    expect(c.A!.start).toMatchObject({ kind: 'corner', wallId: 'B', through: true });
    expect(c.C!.start).toEqual({ kind: 'continues', wallId: 'A', cornerWallId: 'B', at: { x: 0, y: -1 } });
  });

  it('ends: a da linha marcada butt cede a vez; marcada through é escolhida; a que chega não pode atravessar', () => {
    const line = (aEnds?: EndRule, cEnds?: EndRule, bEnds?: EndRule) =>
      byId(
        findConnections([
          wall('A', [0, 0], [100, 0], aEnds === undefined ? {} : { ends: { start: aEnds } }),
          wall('B', [0, 0], [0, 100], bEnds === undefined ? {} : { ends: { start: bEnds } }),
          wall('C', [0, 0], [-100, 0], cEnds === undefined ? {} : { ends: { start: cEnds } }),
        ]),
      );
    expect(line('butt').C!.start).toMatchObject({ kind: 'corner', wallId: 'B', through: true });
    expect(line(undefined, 'through').C!.start).toMatchObject({ kind: 'corner', wallId: 'B', through: true });
    expect(line(undefined, undefined, 'butt').A!.start).toMatchObject({ kind: 'corner', through: true });
    expect(() => line('butt', 'butt')).toThrow(/Wall B: .*A and C.*one of them must cross/);
    expect(() => line(undefined, undefined, 'through')).toThrow(/Wall B: .*A and C.*cannot cross/);
  });
});
