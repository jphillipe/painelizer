import { describe, expect, it } from 'vitest';
import { recoveryLink } from './auth/routes';
import { hashInviteToken, inviteUrl, isInviteToken, newInviteToken } from './invite-token';

describe('token do convite por link (S41)', () => {
  it('token novo: 43 caracteres base64url, aleatório, no formato que a página aceita', () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(isInviteToken(a)).toBe(true);
    expect(isInviteToken('curto')).toBe(false);
    expect(isInviteToken(`${a}=`)).toBe(false);
    expect(isInviteToken('../'.repeat(15).slice(0, 43))).toBe(false);
  });

  it('o banco guarda o sha256 hex (o formato que a migração exige), nunca o token', () => {
    const t = 'A'.repeat(43);
    expect(hashInviteToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken(t)).toBe(hashInviteToken(t));
    expect(hashInviteToken(t)).not.toBe(hashInviteToken('B'.repeat(43)));
  });

  it('links: convite em /invite/<token>; nova senha direto no /auth/confirm com token_hash', () => {
    expect(inviteUrl('https://panelizer.run.app', 'TOK')).toBe('https://panelizer.run.app/invite/TOK');
    expect(recoveryLink('http://localhost:3000', 'abc')).toBe('http://localhost:3000/auth/confirm?token_hash=abc&type=recovery&next=%2Fapp%2Faccount%3Freset%3D1');
  });
});
