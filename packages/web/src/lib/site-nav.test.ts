import { describe, expect, it } from 'vitest';
import { initialsOf, isActivePath, isBareRoute } from './site-nav';

describe('SiteHeader helpers (S22 header)', () => {
  it('iniciais do e-mail: duas partes → uma letra de cada; uma parte → duas letras', () => {
    expect(initialsOf('joao.phillipe1998@gmail.com')).toBe('JP');
    expect(initialsOf('nick_qualitywr@gmail.com')).toBe('NQ');
    expect(initialsOf('alice@example.com')).toBe('AL');
    expect(initialsOf('a@example.com')).toBe('A');
    expect(initialsOf('')).toBe('');
  });

  it('rota ativa: exata ou pai, conforme o item', () => {
    expect(isActivePath('/app', { href: '/app', exact: true })).toBe(true);
    expect(isActivePath('/app/projects', { href: '/app', exact: true })).toBe(false);
    expect(isActivePath('/app/projects/1', { href: '/app/projects' })).toBe(true);
    expect(isActivePath('/application', { href: '/app' })).toBe(false);
  });

  it('só /login fica sem navegação e sem usuário', () => {
    expect(isBareRoute('/login')).toBe(true);
    expect(isBareRoute('/app')).toBe(false);
  });
});
