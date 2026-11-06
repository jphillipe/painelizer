/**
 * Token do convite por link (S41). O link leva um token aleatório de 32 bytes (base64url, 43 caracteres); o banco
 * guarda só o sha256 dele (`team_invites.token_hash`), então o link aparece uma vez — para o admin copiar e mandar —
 * e quem lê o banco não consegue montá-lo de novo.
 */

import { createHash, randomBytes } from 'node:crypto';

export const INVITE_PATH = '/invite';

/** Validade do convite: o default de `team_invites.expires_at` na migração 20261106000000. */
export const INVITE_TTL_DAYS = 7;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function newInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/** O token tem o formato do app (barra lixo antes de ir ao banco). */
export function isInviteToken(token: string): boolean {
  return TOKEN.test(token);
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** `<origem>/invite/<token>`. */
export function inviteUrl(origin: string, token: string): string {
  return `${origin}${INVITE_PATH}/${token}`;
}
