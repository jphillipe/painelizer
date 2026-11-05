/**
 * Pregação das ligações entre paredes (S39, hipótese P48): só texto da folha, nunca geometria nem lista de peças.
 * A prancha da fábrica (2026-10-28, quadros 1–3 e 12) diz "3× 3" nails or screws @ 12" OC" na amarração de canto, T e
 * +; é o default, impresso com "engineer to verify". O projeto troca por `config.nailing.wallJoint`, campo a campo.
 * A pregação da chapa é da S38 (`config.sheathing.nailing`, `rules/sheathing.ts`).
 */

import type { JointNailing, NailingConfig } from '../config';

/** Os valores da prancha (P48). */
export const DEFAULT_NAILING: Readonly<{ wallJoint: Readonly<JointNailing> }> = {
  wallJoint: { count: 3, fastener: '3" nails or screws', spacing: 12 },
};

/** A pregação em vigor: o que o projeto disser por cima do default. */
export function resolveNailing(nailing: NailingConfig | undefined): { wallJoint: JointNailing } {
  return { wallJoint: { ...DEFAULT_NAILING.wallJoint, ...(nailing?.wallJoint ?? {}) } };
}
