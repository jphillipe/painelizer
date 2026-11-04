import { describe, expect, it } from 'vitest';
import {
  ENGINE_ERROR_CODES,
  EngineError,
  engineErrorMessagePt,
  noticeOf,
  splitWall,
  WARNING_CODES,
  warningMessagePt,
  type Config,
  type Wall,
} from '../src';

describe('catálogo de mensagens (S26)', () => {
  it('12 avisos (S31: FIRE_BLOCKING_REQUIRED virou peça); todo código de aviso e de erro tem frase em português', () => {
    expect(WARNING_CODES).toHaveLength(12);
    for (const c of WARNING_CODES) expect(typeof warningMessagePt(c, {}, { wallId: 'W1', openingId: 'J1' })).toBe('string');
    for (const c of ENGINE_ERROR_CODES) expect(typeof engineErrorMessagePt(c, {}, { wallId: 'W1' })).toBe('string');
    expect(new Set([...WARNING_CODES, ...ENGINE_ERROR_CODES]).size).toBe(WARNING_CODES.length + ENGINE_ERROR_CODES.length);
  });

  it('EngineError: código, ids e parâmetros; at() soma o contexto e refaz a frase', () => {
    const e = new EngineError('SNOW_LOAD_REQUIRED');
    expect(e).toBeInstanceOf(RangeError);
    expect(e.message).toBe('groundSnowLoad é obrigatório em parede externa portante');
    const located = e.at({ wallId: 'W1', openingId: 'J1' });
    expect(located.message).toBe('parede W1, abertura J1: groundSnowLoad é obrigatório em parede externa portante');
    expect(noticeOf(located)).toEqual({ code: 'SNOW_LOAD_REQUIRED', message: located.message, wallId: 'W1', openingId: 'J1', params: {} });
    // O contexto que o erro já tinha vence o de quem pegou.
    expect(located.at({ wallId: 'W9' }).wallId).toBe('W1');
  });

  it('motivo de "exige engenheiro" sai estruturado e a frase continua a mesma', () => {
    const e = new EngineError('HEADER_OUT_OF_TABLE', { wallId: 'W1', openingId: 'J1' }, { why: 'span', span: 200, table: 'R602.7(1)' });
    expect(e.message).toBe('parede W1, abertura J1: header fora da tabela (vão 200" acima de todos os headers da tabela R602.7(1)) — exige engenheiro; informe o header da abertura');
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
    expect(nudged.message).not.toMatch(/hipótese/);
  });
});
