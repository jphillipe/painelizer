/**
 * Tabela de preços no editor (S40): `config.prices` como o schema a lê (`PriceEntry[]`: por peça de um comprimento de
 * estoque, ou por pé linear da seção). As funções devolvem a lista nova; quem grava é `updateConfig`. Repetição
 * (mesma seção e comprimento; dois "por pé" da mesma seção) o editor aponta na linha; o parser e o motor recusam.
 */

import type { NailingConfig, PriceEntry } from 'core';
import { priceSection, readField } from 'cli/schema';

/** Modo da linha: por peça do comprimento ou por pé linear. */
export type PriceMode = 'each' | 'perFoot';

export function priceMode(p: PriceEntry): PriceMode {
  return 'perFoot' in p ? 'perFoot' : 'each';
}

/** Valor da linha (preço por peça ou por pé). */
export function priceValue(p: PriceEntry): number {
  return 'perFoot' in p ? p.perFoot : p.price;
}

/** Linha nova: a primeira seção 2x sem preço "por peça" de 8', a 0 (o humano preenche). */
export function newPrice(list: readonly PriceEntry[] | undefined): PriceEntry {
  const sections = ['2x4', '2x6', '2x8', '2x10', '2x12'] as const;
  const free = sections.find((s) => !(list ?? []).some((p) => p.section === s && 'price' in p && Math.abs(p.length - 96) < 1 / 128));
  return { section: free ?? '2x4', length: 96, price: 0 };
}

/** A lista com a linha `i` trocada; `undefined` tira a linha; lista vazia vira `undefined` (sem orçamento). */
export function withPrice(list: readonly PriceEntry[] | undefined, i: number, value: PriceEntry | undefined): PriceEntry[] | undefined {
  const next = [...(list ?? [])];
  if (value === undefined) next.splice(i, 1);
  else if (i >= next.length) next.push(value);
  else next[i] = value;
  return next.length === 0 ? undefined : next;
}

/** A linha com um campo mudado; trocar o modo mantém o valor (preço vira preço por pé e vice-versa). */
export function patchPrice(
  p: PriceEntry,
  patch: { section?: PriceEntry['section']; mode?: PriceMode; length?: number; value?: number },
): PriceEntry {
  const section = patch.section ?? p.section;
  const mode = patch.mode ?? priceMode(p);
  const value = patch.value ?? priceValue(p);
  if (mode === 'perFoot') return { section, perFoot: value };
  return { section, length: patch.length ?? ('length' in p ? p.length : 96), price: value };
}

/** Seção como o schema de preço aceita (2x, 4x4/4x6/6x6, LVL/PSL); texto inválido = `undefined`. */
export function readPriceSection(text: string): PriceEntry['section'] | undefined {
  const r = readField(priceSection, text);
  return r.ok ? r.value : undefined;
}

/** Índices das linhas repetidas (a segunda em diante, como o parser aponta). */
export function duplicatePrices(list: readonly PriceEntry[] | undefined): Set<number> {
  const out = new Set<number>();
  (list ?? []).forEach((p, i) => {
    const before = (list ?? []).slice(0, i);
    const dup = before.some(
      (q) => q.section === p.section && ('perFoot' in q ? 'perFoot' in p : !('perFoot' in p) && Math.abs(q.length - p.length) < 1 / 128),
    );
    if (dup) out.add(i);
  });
  return out;
}

/**
 * `config.nailing` com a pregação das ligações mudada (S40; P48): só as chaves do patch mudam; vazio some (`undefined`
 * = o default do motor, 3× 3" nails or screws @ 12" OC).
 */
export function withJointNailing(
  current: NailingConfig | undefined,
  patch: { count?: number | undefined; spacing?: number | undefined; fastener?: string | undefined },
): NailingConfig | undefined {
  const joint: Record<string, unknown> = { ...(current?.wallJoint ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete joint[k];
    else joint[k] = v;
  }
  const rest = { ...(current ?? {}) };
  delete rest.wallJoint;
  const next: NailingConfig = Object.keys(joint).length === 0 ? rest : { ...rest, wallJoint: joint as NonNullable<NailingConfig['wallJoint']> };
  return Object.keys(next).length === 0 ? undefined : next;
}
