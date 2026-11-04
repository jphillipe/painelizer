import { describe, expect, it } from 'vitest';
import { ilikePattern } from './projects-table';
import { teamError } from './team-table';

describe('adaptadores do Supabase — partes puras (S32)', () => {
  it('a busca procura o texto: % _ e \\ viram literais', () => {
    expect(ilikePattern('casa')).toBe('%casa%');
    expect(ilikePattern('50%_a\\b')).toBe('%50\\%\\_a\\\\b%');
  });

  it('erro do banco → código: último admin, tabela/função que falta, o resto', () => {
    expect(teamError({ code: 'P0001', message: 'LAST_ADMIN: a team needs at least one admin' }).code).toBe('LAST_ADMIN');
    expect(teamError({ code: 'PGRST205', message: 'Could not find the table public.teams' }).code).toBe('MISSING');
    expect(teamError({ code: 'PGRST202', message: 'Could not find the function public.add_team_member' }).code).toBe('MISSING');
    expect(teamError({ code: '42501', message: 'permission denied' }).code).toBe('DB_ERROR');
  });
});
