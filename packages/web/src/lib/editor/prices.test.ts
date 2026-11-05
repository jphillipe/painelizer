import { describe, expect, it } from 'vitest';
import { duplicatePrices, newPrice, patchPrice, priceMode, priceValue, readPriceSection, withJointNailing, withPrice } from './prices';

describe('S40: tabela de preços no editor', () => {
  it('linha nova: a primeira seção 2x sem preço de 8\'', () => {
    expect(newPrice(undefined)).toEqual({ section: '2x4', length: 96, price: 0 });
    expect(newPrice([{ section: '2x4', length: 96, price: 4 }])).toEqual({ section: '2x6', length: 96, price: 0 });
  });

  it('acrescenta, troca e tira; lista vazia some', () => {
    const a = withPrice(undefined, 0, { section: '2x6', length: 96, price: 5 });
    expect(a).toEqual([{ section: '2x6', length: 96, price: 5 }]);
    const b = withPrice(a, 0, { section: '2x6', perFoot: 0.8 });
    expect(b).toEqual([{ section: '2x6', perFoot: 0.8 }]);
    expect(withPrice(b, 0, undefined)).toBeUndefined();
  });

  it('trocar o modo mantém o valor; por pé não tem comprimento', () => {
    const p = { section: '2x6' as const, length: 144, price: 9 };
    expect(priceMode(p)).toBe('each');
    expect(patchPrice(p, { mode: 'perFoot' })).toEqual({ section: '2x6', perFoot: 9 });
    expect(patchPrice({ section: '2x6', perFoot: 0.75 }, { mode: 'each' })).toEqual({ section: '2x6', length: 96, price: 0.75 });
    expect(patchPrice(p, { length: 120, value: 7.5 })).toEqual({ section: '2x6', length: 120, price: 7.5 });
    expect(priceValue({ section: '4x4', perFoot: 2 })).toBe(2);
  });

  it('seção pela regra do schema de preço: 2x, posts, LVL/PSL', () => {
    expect(readPriceSection('2x10')).toBe('2x10');
    expect(readPriceSection('6x6')).toBe('6x6');
    expect(readPriceSection('LVL 1.75x9.25')).toBe('LVL 1.75x9.25');
    expect(readPriceSection('2x9')).toBeUndefined();
  });

  it('repetidas: a segunda em diante (mesma seção e comprimento, ou dois por pé)', () => {
    expect([
      ...duplicatePrices([
        { section: '2x6', length: 96, price: 5 },
        { section: '2x6', length: 96.001, price: 6 },
        { section: '2x6', perFoot: 1 },
        { section: '2x6', perFoot: 2 },
        { section: '2x4', length: 96, price: 3 },
      ]),
    ]).toEqual([1, 3]);
  });

  it('pregação das ligações: só a chave do patch muda; vazio volta ao default (sem a chave)', () => {
    expect(withJointNailing(undefined, { count: 4 })).toEqual({ wallJoint: { count: 4 } });
    expect(withJointNailing({ wallJoint: { count: 4, spacing: 8 } }, { count: undefined })).toEqual({ wallJoint: { spacing: 8 } });
    expect(withJointNailing({ wallJoint: { count: 4 } }, { count: undefined })).toBeUndefined();
  });
});
