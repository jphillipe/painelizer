import { describe, expect, it } from 'vitest';
import { ISSUE_HELP as ALL_HELP } from './issue-help';
import { ISSUE_TITLES } from './issue-groups';
import { WARNING_CODES } from 'core';
import { draftFromJson } from './draft';
import { helpFor, quickFixFor, readingWarningResolved } from './issue-help';
import { legacyNotice } from 'extract/notices';
import type { Notice } from '@/types/panels';
import { issueFromNotice, type IdIndex, type Issue } from './problems';

/**
 * Os avisos destes testes estão no texto gravado antes da S26: passam pelo leitor de legado (`legacyNotice`), o
 * mesmo caminho de um `.panelizer.json` antigo, e saem com o código novo.
 */
const parseWarning = (text: string, index: IdIndex): Issue => issueFromNotice(legacyNotice(text) as Notice, 'warning', index);
const engineProblem = (n: Notice, index: IdIndex): Issue => issueFromNotice(n, 'problem', index);

const ids: IdIndex = { walls: ['S1', 'I9'], openings: new Map([['S1', ['S1-A2-1']], ['I9', []]]) };

describe('issue-help', () => {
  it('ajuda por código e por família; desconhecido fica sem ajuda', () => {
    expect(helpFor(parseWarning('1-S1-P1 WIND_SPEED_MISSING: parede S1, abertura S1-A2-1: parede externa sem config.building.windSpeed', ids))?.fix).toMatch(/wind speed/);
    expect(helpFor({ severity: 'problem', source: 'draft', kind: 'wall.height', text: 'x' })?.what).toMatch(/wall height/);
    expect(helpFor(engineProblem({ code: 'HEADER_OUT_OF_TABLE', message: 'x', wallId: 'S1', openingId: 'S1-A2-1', params: { why: 'span', span: 58.5, table: 'R602.7(1)' } }, ids))?.fix).toMatch(/engineer/);
    // S47: toda família conhecida tem ajuda (até o erro interno do motor); só um código que o app ainda não conhece fica sem.
    expect(helpFor(engineProblem({ code: 'ENGINE_INTERNAL', message: 'parede S1: algo inédito', wallId: 'S1' }, ids))?.fix).toMatch(/Details/);
    expect(helpFor(engineProblem({ code: 'SOME_NEW_CODE', message: 'parede S1: algo inédito', wallId: 'S1' }, ids))).toBeUndefined();
  });

  it('conserto rápido: vento, altura de header e a abertura que a leitura não posicionou (id e tag do aviso)', () => {
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

describe('leitura 2026-10-30: posição estimada e cômodo sem porta', () => {
  const ids2: IdIndex = { walls: ['I9'], openings: new Map([['I9', ['I9-U2-1']]]) };
  const base = { config: { studSpacing: 16, openingTypes: { U2: { kind: 'door', width: 36, height: 80 } } }, walls: [{ id: 'I9', length: 120, height: 97, section: '2x4', exterior: false, bearing: false, openings: [{ id: 'I9-U2-1', tag: 'U2', center: 60 }] }] };
  const load = (raw: unknown) => {
    const r = draftFromJson(raw);
    if (!r.ok) throw new Error('should load');
    return r.draft;
  };
  const estimated = parseWarning('extração ABERTURA_ESTIMADA: parede I9, abertura I9-U2-1 (U2): posição medida no desenho pela escala, sem cota (confiança 0.45) — confira a posição na planta e ajuste', ids2);

  it('tem ajuda e aponta parede e abertura; sem conserto rápido (a abertura já existe)', () => {
    expect(estimated).toMatchObject({ source: 'extraction', code: 'OPENING_ESTIMATED', wallId: 'I9', openingId: 'I9-U2-1' });
    expect(helpFor(estimated)?.what).toMatch(/measured .* by scale/);
    expect(quickFixFor(estimated)).toBeUndefined();
  });

  it('some quando a parede foi marcada como revisada, ou quando a abertura foi removida', () => {
    expect(readingWarningResolved(estimated, load(base))).toBe(false);
    expect(readingWarningResolved(estimated, load({ ...base, walls: [{ ...base.walls[0], $reviewed: true }] }))).toBe(true);
    expect(readingWarningResolved(estimated, load({ ...base, walls: [{ ...base.walls[0], openings: [] }] }))).toBe(true);
  });

  it('cômodo sem porta é um aviso geral da leitura, com ajuda', () => {
    const room = parseWarning('extração COMODO_SEM_PORTA: Bathroom (pavimento 1): nenhuma porta encontrada — símbolo não visível; confira na planta e adicione a abertura na parede certa', ids2);
    expect(room).toMatchObject({ source: 'extraction', code: 'ROOM_WITHOUT_DOOR' });
    expect(room.wallId).toBeUndefined();
    expect(helpFor(room)?.fix).toMatch(/add the opening/);
    expect(readingWarningResolved(room, load(base))).toBe(false);
  });
});

describe('avisos novos (S26): o conserto rápido e o "resolvido" leem os parâmetros, não o texto', () => {
  const index: IdIndex = { walls: ['I9'], openings: new Map([['I9', []]]) };
  it('abertura fora do projeto: id em cited, tag em params', () => {
    const w = issueFromNotice({ source: 'extraction', code: 'OPENING_UNPLACED', message: 'qualquer coisa', wallId: 'I9', openingId: 'I9-U2-1', params: { tag: 'U2' } }, 'warning', index);
    expect(quickFixFor(w)).toEqual({ kind: 'addOpening', wallId: 'I9', openingId: 'I9-U2-1', tag: 'U2' });
  });
  it('altura padrão: compara com params.height', () => {
    const d = draftFromJson({ config: { studSpacing: 16, headerHeight: 82.5 }, walls: [{ id: 'I9', length: 120, height: 97, section: '2x4', exterior: false, bearing: false, openings: [] }] });
    if (!d.ok) throw new Error('should load');
    const w = issueFromNotice({ source: 'extraction', code: 'DEFAULT_HEADER_HEIGHT', message: 'x', params: { count: 3, height: `6' - 10 1/2"`, openingIds: ['A'] } }, 'warning', index);
    expect(readingWarningResolved(w, d.draft)).toBe(false);
  });
});

describe('ajuda pelo motivo (S26)', () => {
  it('HEADER_JACKS_BELOW_TABLE: vizinhança (P30) e pedido abaixo da tabela têm ajudas diferentes', () => {
    const index: IdIndex = { walls: ['S2'], openings: new Map([['S2', ['S2-A']]]) };
    const neighbor = issueFromNotice({ code: 'HEADER_JACKS_BELOW_TABLE', message: 'x', wallId: 'S2', openingId: 'S2-A', params: { reason: 'neighbor' } }, 'warning', index);
    const table = issueFromNotice({ code: 'HEADER_JACKS_BELOW_TABLE', message: 'x', wallId: 'S2', openingId: 'S2-A', params: { reason: 'table' } }, 'warning', index);
    expect(helpFor(neighbor)?.what).toMatch(/so close/);
    expect(helpFor(table)?.what).toMatch(/asks for fewer jack studs/);
  });
});

/** S47: toda família que a lista pode mostrar diz o que é e como resolver. */
describe('ajuda para toda família (S47)', () => {
  it('toda chave de ISSUE_TITLES e todo aviso do motor tem "what" e "fix"', () => {
    const keys = [...new Set([...Object.keys(ISSUE_TITLES), ...WARNING_CODES])];
    const missing = keys.filter((k) => {
      const h = ALL_HELP[k];
      return h === undefined || h.what.trim() === '' || h.fix.trim() === '';
    });
    expect(missing).toEqual([]);
  });

  it('as frases terminam com ponto e não repetem o título', () => {
    for (const [key, h] of Object.entries(ALL_HELP)) {
      expect(h.what, key).toMatch(/[.!?]$/);
      expect(h.fix, key).toMatch(/[.!?]$/);
      expect(h.what, key).not.toBe(ISSUE_TITLES[key]);
    }
  });
});
