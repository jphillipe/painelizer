import { describe, expect, it } from 'vitest';
import { draftFromJson } from './draft';
import { helpFor, quickFixFor, readingWarningResolved } from './issue-help';
import { parseProblem, parseWarning, type IdIndex } from './problems';

const ids: IdIndex = { walls: ['S1', 'I9'], openings: new Map([['S1', ['S1-A2-1']], ['I9', []]]) };

describe('issue-help', () => {
  it('ajuda por código, por família e por texto; desconhecido fica sem ajuda', () => {
    expect(helpFor(parseWarning('1-S1-P1 WIND_SPEED_MISSING: parede S1, abertura S1-A2-1: parede externa sem config.building.windSpeed', ids))?.fix).toMatch(/wind speed/);
    expect(helpFor({ severity: 'problem', source: 'draft', kind: 'wall.height', text: 'x' })?.what).toMatch(/wall height/);
    expect(helpFor(parseProblem('parede S1, abertura S1-A2-1: header fora da tabela (vão 58.5") — exige engenheiro', ids))?.fix).toMatch(/engineer/);
    expect(helpFor(parseProblem('parede S1: algo inédito', ids))).toBeUndefined();
  });

  it('conserto rápido: vento, altura de header e a abertura que a leitura não posicionou (id e tag do texto)', () => {
    expect(quickFixFor(parseWarning('1-S1-P1 WIND_SPEED_MISSING: parede S1, abertura S1-A2-1: …', ids))).toEqual({ kind: 'wind' });
    expect(quickFixFor(parseWarning('extração ALTURA_PADRAO: 11 abertura(s) sem altura…', ids))).toEqual({ kind: 'headerHeight' });
    const w = parseWarning('extração ABERTURA_SEM_POSICAO: parede I9, abertura I9-U2-1 (U2): a leitura não achou a cota do eixo — os painéis saem SEM esta abertura', ids);
    expect(quickFixFor(w)).toEqual({ kind: 'addOpening', wallId: 'I9', openingId: 'I9-U2-1', tag: 'U2' });
    expect(quickFixFor(parseWarning('1-S1-P1 OPENING_NUDGED: parede S1, abertura S1-A2-1: deslocada', ids))).toBeUndefined();
  });

  it('aviso da leitura some quando o draft já o resolveu', () => {
    const base = { config: { studSpacing: 16, openingTypes: { U2: { kind: 'door', width: 36, height: 80 } } }, walls: [{ id: 'I9', length: 120, height: 97, section: '2x4', exterior: false, bearing: false, openings: [] as unknown[] }] };
    const load = (raw: unknown) => {
      const r = draftFromJson(raw);
      if (!r.ok) throw new Error('should load');
      return r.draft;
    };
    const missing = parseWarning('extração ABERTURA_SEM_POSICAO: parede I9, abertura I9-U2-1 (U2): a leitura não achou a cota do eixo', ids);
    expect(readingWarningResolved(missing, load(base))).toBe(false);
    expect(readingWarningResolved(missing, load({ ...base, walls: [{ ...base.walls[0], openings: [{ id: 'I9-U2-1', tag: 'U2', center: 60 }] }] }))).toBe(true);
    const header = parseWarning(`extração ALTURA_PADRAO: 3 abertura(s) sem altura no projeto ficam com o topo do RO a 6' - 10 1/2" do subfloor (padrão da fábrica, P2): E1-1-1 — confira`, ids);
    expect(readingWarningResolved(header, load(base))).toBe(false);
    // a conversão grava o próprio padrão no projeto: ainda é o aviso
    expect(readingWarningResolved(header, load({ ...base, config: { ...base.config, headerHeight: 82.5 } }))).toBe(false);
    expect(readingWarningResolved(header, load({ ...base, config: { ...base.config, headerHeight: 84 } }))).toBe(true);
    expect(readingWarningResolved(parseWarning('1-S1-P1 WIND_SPEED_MISSING: parede S1: x', ids), load(base))).toBe(false);
  });
});
