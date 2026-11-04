/**
 * `GET /api/health?deep=1` (S32): além do que o processo enxerga (`lib/health.ts`), consulta de verdade o banco e
 * o Storage com a sessão de quem pede — cada tabela que o app usa, o bucket e o time da pessoa. Só com login (o
 * relatório raso continua aberto para o deploy conferir): diz que tabelas existem e quanto demoram, nada do
 * conteúdo. Uma tabela que falta (`PGRST205`) quer dizer migração não aplicada, e o relatório diz qual.
 */

import 'server-only';

import { errorMessage } from '@/lib/errors';
import { DRAWINGS_BUCKET } from '@/lib/drawings';
import { hasSupabase } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';
import { currentUser, type SessionUser } from './auth.service';
import { myTeam, type MyTeamResult } from './team.service';

export interface Check {
  ok: boolean;
  ms: number;
  error?: string;
  /** Migração que cria o que faltou, quando o erro é "tabela não existe". */
  migration?: string;
}

/** Uma consulta mínima por recurso; lança com o erro do Supabase. */
export type Probes = Record<string, () => Promise<void>>;

export interface DeepDeps {
  configured: () => boolean;
  user: () => Promise<SessionUser | undefined>;
  probes: () => Promise<Probes | undefined>;
  team: (user: SessionUser) => Promise<MyTeamResult>;
  now: () => number;
}

export type DeepHealth =
  | { kind: 'signed_out' }
  | { kind: 'report'; ok: boolean; supabase: 'unconfigured' }
  | { kind: 'report'; ok: boolean; supabase: 'ok' | 'error'; user: string; team: { name: string; role: string } | null; checks: Record<string, Check> };

/** Onde nasce cada recurso (supabase/migrations), para o relatório apontar a migração que falta. */
export const MIGRATION_OF: Record<string, string> = {
  projects: '20261022000000_projects.sql',
  drawings: '20261103000000_drawings.sql',
  extraction_jobs: '20261104000000_extraction_jobs.sql',
  teams: '20261104000200_teams.sql',
  team_members: '20261104000200_teams.sql',
  project_revisions: '20261104000300_projects_team.sql',
  projects_trash: '20261104000300_projects_team.sql',
};

class ProbeError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

function fail(error: { message: string; code?: string } | null): void {
  if (error !== null) throw new ProbeError(error.message, error.code);
}

async function supabaseProbes(): Promise<Probes | undefined> {
  const client = await supabaseServer();
  if (client === undefined) return undefined;
  return {
    projects: async () => fail((await client.from('projects').select('id').limit(1)).error),
    // A coluna da S32: sem a migração 20261104000300 o PostgREST responde que `deleted_at` não existe.
    projects_trash: async () => fail((await client.from('projects').select('deleted_at').limit(1)).error),
    project_revisions: async () => fail((await client.from('project_revisions').select('id').limit(1)).error),
    teams: async () => fail((await client.from('teams').select('id').limit(1)).error),
    team_members: async () => fail((await client.from('team_members').select('user_id').limit(1)).error),
    extraction_jobs: async () => fail((await client.from('extraction_jobs').select('id').limit(1)).error),
    drawings: async () => fail((await client.storage.from(DRAWINGS_BUCKET).list('', { limit: 1 })).error),
  };
}

export const defaultDeps: DeepDeps = {
  configured: hasSupabase,
  user: () => currentUser(),
  probes: supabaseProbes,
  team: (user) => myTeam(user),
  now: () => performance.now(),
};

/** Tabela/coluna/função que não existe: migração não aplicada. */
function looksMissing(e: unknown): boolean {
  const code = e instanceof ProbeError ? e.code : undefined;
  return code === 'PGRST205' || code === 'PGRST204' || code === 'PGRST202' || code === '42P01' || code === '42703' || /does not exist|could not find/i.test(errorMessage(e));
}

export async function deepHealth(deps: DeepDeps = defaultDeps): Promise<DeepHealth> {
  if (!deps.configured()) return { kind: 'report', ok: true, supabase: 'unconfigured' };
  const user = await deps.user();
  if (user === undefined) return { kind: 'signed_out' };
  const probes = await deps.probes();
  if (probes === undefined) return { kind: 'report', ok: true, supabase: 'unconfigured' };
  const entries = await Promise.all(
    Object.entries(probes).map(async ([name, probe]): Promise<[string, Check]> => {
      const start = deps.now();
      try {
        await probe();
        return [name, { ok: true, ms: Math.round(deps.now() - start) }];
      } catch (e) {
        const migration = MIGRATION_OF[name];
        return [name, { ok: false, ms: Math.round(deps.now() - start), error: errorMessage(e), ...(looksMissing(e) && migration !== undefined ? { migration } : {}) }];
      }
    }),
  );
  const checks = Object.fromEntries(entries);
  const mine = await deps.team(user);
  const team = mine.ok && mine.team !== undefined ? { name: mine.team.name, role: mine.team.role } : null;
  const ok = entries.every(([, c]) => c.ok);
  return { kind: 'report', ok, supabase: ok ? 'ok' : 'error', user: user.email, team, checks };
}
