import { describe, expect, it } from 'vitest';
import {
  ENGINE_ERROR_CODES,
  EngineError,
  engineErrorMessage,
  noticeOf,
  splitWall,
  WARNING_CODES,
  warningMessage,
  type Config,
  type Wall,
} from '../src';

/** Palavras e acentos do português que não podem sobrar numa frase do motor (P51). */
const PORTUGUESE = /[ãçéêíóôõúà]|\b(parede|painel|abertura|não|deve|inválid|esperado|recebido|sem|com|entre|tabela)\b/i;

describe('catálogo de mensagens (S26)', () => {
  it('15 avisos (S31: FIRE_BLOCKING_REQUIRED virou peça; S35: WALL_TYPE_MISMATCH; S36: BLOCKING_SKIPPED; S44: FLAT_HEADER_CRIPPLES); todo código de aviso e de erro tem frase em inglês', () => {
    expect(WARNING_CODES).toHaveLength(15);
    for (const c of WARNING_CODES) expect(warningMessage(c, {}, { wallId: 'W1', openingId: 'J1' })).not.toMatch(PORTUGUESE);
    for (const c of ENGINE_ERROR_CODES) {
      expect(engineErrorMessage(c, {}, { wallId: 'W1' }), c).not.toMatch(PORTUGUESE);
      expect(engineErrorMessage(c, {}, {}), c).not.toMatch(PORTUGUESE);
    }
    expect(new Set([...WARNING_CODES, ...ENGINE_ERROR_CODES]).size).toBe(WARNING_CODES.length + ENGINE_ERROR_CODES.length);
  });

  it('EngineError: código, ids e parâmetros; at() soma o contexto e refaz a frase', () => {
    const e = new EngineError('SNOW_LOAD_REQUIRED');
    expect(e).toBeInstanceOf(RangeError);
    expect(e.message).toBe('groundSnowLoad is required for an exterior bearing wall');
    const located = e.at({ wallId: 'W1', openingId: 'J1' });
    expect(located.message).toBe('Wall W1, opening J1: groundSnowLoad is required for an exterior bearing wall');
    expect(noticeOf(located)).toEqual({ code: 'SNOW_LOAD_REQUIRED', message: located.message, wallId: 'W1', openingId: 'J1', params: {} });
    // O contexto que o erro já tinha vence o de quem pegou.
    expect(located.at({ wallId: 'W9' }).wallId).toBe('W1');
  });

  it('motivo de "exige engenheiro" sai estruturado e a frase continua a mesma', () => {
    const e = new EngineError('HEADER_OUT_OF_TABLE', { wallId: 'W1', openingId: 'J1' }, { why: 'span', span: 200, table: 'R602.7(1)' });
    expect(e.message).toBe('Wall W1, opening J1: header outside the table (a 200" span is above every header in table R602.7(1)) — needs an engineer; specify the opening header');
  });

  it('a hipótese não vai para a frase do aviso (nem para a folha): fica em Warning.hypothesis', () => {
    const config: Config = { studSpacing: 16, studThickness: 1.5, plateThickness: 1.5, studLength: [92.625] };
    // Porta encostada no fim: a zona sai 3/8" da parede e o motor desloca (P40).
    const wall: Wall = {
      id: 'W1', length: 120, height: 97.125, section: '2x4', exterior: false, bearing: false,
      openings: [{ id: 'D1', type: 'door', offset: 120 - 32 - 3 + 0.375, roughWidth: 32, roughHeight: 82.5 }],
    };
    const [panel] = splitWall(wall, config);
    const nudged = panel!.warnings.find((w) => w.code === 'OPENING_NUDGED')!;
    expect(nudged).toMatchObject({ wallId: 'W1', openingId: 'D1', hypothesis: 'P40', params: { touched: 'end', direction: 'left' } });
    expect(nudged.message).not.toMatch(/hypothesis|P40/);
  });
});
