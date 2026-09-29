/**
 * Comparação de members ignorando ordem.
 * Chave = (role, section, length, x, y), conforme o `$comment` dos fixtures.
 */

import { expect } from 'vitest';
import type { Member } from '../../src/types';

export type MemberKeyFields = Pick<Member, 'role' | 'section' | 'length' | 'x' | 'y'>;

export function memberKey(m: MemberKeyFields): string {
  return `${m.role}|${m.section}|${m.length}|${m.x}|${m.y}`;
}

/** Chaves ordenadas, prontas para `toEqual`. */
export function memberKeys(members: readonly MemberKeyFields[]): string[] {
  return members.map(memberKey).sort();
}

/**
 * Falha se `actual` e `expected` não tiverem exatamente os mesmos members
 * (mesma multiplicidade), em qualquer ordem.
 */
export function expectSameMembers(
  actual: readonly MemberKeyFields[],
  expected: readonly MemberKeyFields[],
): void {
  expect(memberKeys(actual)).toEqual(memberKeys(expected));
}
