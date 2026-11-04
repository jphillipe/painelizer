import { describe, expect, it } from 'vitest';
import { ENGINE_ERROR_CODES, WARNING_CODES } from 'core';
import { EXTRACT_ERROR_CODES, EXTRACT_PROBLEM_CODES, EXTRACT_WARNING_CODES, LEGACY_EXTRACT_CODES, legacyNotice } from 'extract/notices';
import { ENGLISH_CODES, englishMessage, extractErrorMessage } from './messages.en';

/** Palavras que só aparecem no português do motor/da leitura. */
const PORTUGUESE = /\b(parede|paredes|abertura|aberturas|não|leitura|folha|painel|altura|cabe|tabela|exige|confira|informe|recebido|sem|com|até)\b|ção|ções|ã/i;

const CLI_CODES = ['PANEL_FILE_CLASH', 'ENGINE_INTERNAL', 'PROJECT_INVALID', 'PROJECT_JSON_INVALID'];
const ADAPTER_CODES = ['INSERT_NO_ROW', 'DB_ERROR', 'DOWNLOAD_NO_DATA', 'STORAGE_ERROR'];

describe('messages.en (S26)', () => {
  it('cobre todo código do core, do extract, do CLI e dos adaptadores do Supabase', () => {
    const all = [...WARNING_CODES, ...ENGINE_ERROR_CODES, ...EXTRACT_WARNING_CODES, ...EXTRACT_PROBLEM_CODES, ...EXTRACT_ERROR_CODES, ...CLI_CODES, ...ADAPTER_CODES];
    const missing = all.filter((c) => !ENGLISH_CODES.has(c));
    expect(missing).toEqual([]);
  });

  it('nenhuma frase em português, com ou sem parâmetros, nem "undefined"', () => {
    for (const code of ENGLISH_CODES) {
      for (const params of [{}, { tag: 'A', count: 2, why: 'span', span: 120, table: 'R602.7(1)', reason: 'table' }]) {
        const text = englishMessage({ code, wallId: 'W1', openingId: 'J1', params })!;
        expect(text, code).not.toMatch(PORTUGUESE);
        expect(text, code).not.toMatch(/\bundefined\b/);
      }
    }
    for (const code of EXTRACT_ERROR_CODES) expect(extractErrorMessage(code, {}), code).not.toMatch(PORTUGUESE);
  });

  it('aviso legado (texto antes da S26) de cada código antigo vira frase em inglês', () => {
    for (const old of Object.keys(LEGACY_EXTRACT_CODES)) {
      const n = legacyNotice(`extração ${old}: parede W1, abertura J1 (A): algo em português`);
      const text = englishMessage(n)!;
      expect(text, old).toBeDefined();
      expect(text, old).not.toMatch(PORTUGUESE);
    }
  });

  it('frases com parâmetros reais', () => {
    expect(englishMessage({ code: 'HEADER_OUT_OF_TABLE', wallId: 'W1', openingId: 'J1', params: { why: 'width', width: 400, snow: 70, table: 'R602.7(1)' } })).toBe(
      'Wall W1, opening J1: header outside the IRC table (building width 400" with 70 psf snow is outside table R602.7(1)) — an engineer has to size it; specify the opening\'s header.',
    );
    expect(englishMessage({ code: 'OPENING_NUDGED', wallId: 'I12', openingId: 'U3', params: { distance: 0.375, direction: 'left', from: 245.375, to: 245, touched: 'end' } })).toBe(
      'Wall I12, opening U3: moved 0.375" to the left (rough opening edge from 245.375 to 245) — it touched the end of the wall. Check the reading.',
    );
    expect(englishMessage({ code: 'SOMETHING_NEW' })).toBeUndefined();
  });
});
