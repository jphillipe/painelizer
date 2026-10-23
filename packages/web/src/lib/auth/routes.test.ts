import { describe, expect, it } from 'vitest';
import { isProtected, routeFor, safeNext } from './routes';

const on = { configured: true, production: false };

describe('routeFor (S22.0)', () => {
  it('sob /app sem usuário vai ao login, lembrando aonde ia', () => {
    expect(routeFor('/app', '', { ...on, signedIn: false })).toEqual({ kind: 'redirect', to: '/login' });
    expect(routeFor('/app/projects/abc', '?tab=sheets', { ...on, signedIn: false })).toEqual({ kind: 'redirect', to: '/login?next=%2Fapp%2Fprojects%2Fabc%3Ftab%3Dsheets' });
  });

  it('com usuário passa; /login com usuário volta ao app ou ao `next`', () => {
    expect(routeFor('/app', '', { ...on, signedIn: true })).toEqual({ kind: 'pass' });
    expect(routeFor('/login', '', { ...on, signedIn: true })).toEqual({ kind: 'redirect', to: '/app' });
    expect(routeFor('/login', '?next=%2Fapp%2Fprojects', { ...on, signedIn: true })).toEqual({ kind: 'redirect', to: '/app/projects' });
    expect(routeFor('/login', '', { ...on, signedIn: false })).toEqual({ kind: 'pass' });
  });

  it('fora de /app e /login ninguém é barrado', () => {
    expect(routeFor('/', '', { ...on, signedIn: false })).toEqual({ kind: 'pass' });
    expect(routeFor('/application', '', { ...on, signedIn: false })).toEqual({ kind: 'pass' });
    expect(isProtected('/app')).toBe(true);
    expect(isProtected('/apple')).toBe(false);
  });

  it('sem Supabase: aberto em desenvolvimento, /app bloqueado em produção', () => {
    expect(routeFor('/app', '', { signedIn: false, configured: false, production: false })).toEqual({ kind: 'pass' });
    expect(routeFor('/app', '', { signedIn: false, configured: false, production: true })).toEqual({ kind: 'redirect', to: '/login' });
    expect(routeFor('/login', '', { signedIn: false, configured: false, production: true })).toEqual({ kind: 'pass' });
  });

  it('`next` só leva a caminhos do app', () => {
    expect(safeNext(undefined)).toBe('/app');
    expect(safeNext('/app/projects/1')).toBe('/app/projects/1');
    expect(safeNext('//evil.example')).toBe('/app');
    expect(safeNext('https://evil.example/app')).toBe('/app');
    expect(safeNext('/login')).toBe('/app');
    expect(safeNext('/login?next=/app')).toBe('/app');
  });
});
