/**
 * Supabase LOCAL para os testes de integração e o e2e (S33): lê as chaves de `TEST_SUPABASE_*`, recusa qualquer URL
 * que não seja da máquina (os testes criam contas, gravam e apagam) e cria as contas de teste pela API de admin.
 *
 * As variáveis vêm de `supabase status -o env` passado por `testing/supabase-env.mjs` (CI e README). Sem elas, quem
 * chama pula os testes que dependem do banco — nunca cai no `.env.local`, que aponta para o projeto real.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, TeamRole } from '../src/types/database';

export interface LocalSupabaseEnv {
  url: string;
  /** Chave publicável (ou `anon`, nas versões da CLI que ainda a chamam assim). */
  key: string;
  /** Chave secret (ou `service_role`): só para criar contas e arrumar o estado entre testes. */
  secretKey: string;
}

export const TEST_URL_VAR = 'TEST_SUPABASE_URL';
export const TEST_KEY_VAR = 'TEST_SUPABASE_PUBLISHABLE_KEY';
export const TEST_SECRET_VAR = 'TEST_SUPABASE_SECRET_KEY';

/** Por que os testes do banco não rodam aqui (vai na mensagem de "pulado"). */
export const SKIP_REASON = `sem ${TEST_URL_VAR}/${TEST_KEY_VAR}/${TEST_SECRET_VAR}: precisa de \`supabase start\` (Docker) — roda no CI (job e2e). Ver supabase/README.md, "Testes contra o Supabase local".`;

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1', 'host.docker.internal']);

/** Só endereço da máquina: um `TEST_SUPABASE_URL` copiado do `.env.local` apagaria dados do projeto real. */
export function assertLocalUrl(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${TEST_URL_VAR} não é uma URL: ${url}`);
  }
  if (!LOCAL_HOSTS.has(host))
    throw new Error(
      `${TEST_URL_VAR} precisa ser o Supabase local (127.0.0.1/localhost), não ${host}. Os testes criam e apagam dados.`,
    );
}

/** As chaves do Supabase local, ou `undefined` se faltar alguma. Lança se a URL não for local. */
export function localSupabaseEnv(env: Record<string, string | undefined> = process.env): LocalSupabaseEnv | undefined {
  const url = (env[TEST_URL_VAR] ?? '').trim();
  const key = (env[TEST_KEY_VAR] ?? '').trim();
  const secretKey = (env[TEST_SECRET_VAR] ?? '').trim();
  if (url === '' || key === '' || secretKey === '') return undefined;
  assertLocalUrl(url);
  return { url, key, secretKey };
}

/** Senha das contas de teste — só existem no Supabase local (`seedAccounts`). */
export const TEST_PASSWORD = 'panelizer-local-only';

export type AccountId = 'admin' | 'editor' | 'outsider' | 'rival';

/** O time que a migração da S32 cria e o que `supabase/seed.sql` acrescenta. */
export const MAIN_TEAM_NAME = 'National Lumber';
export const RIVAL_TEAM_ID = '5eed0000-0000-4000-8000-000000000001';

export const ACCOUNTS: Record<
  AccountId,
  { email: string; team: 'main' | 'rival' | undefined; role: TeamRole | undefined }
> = {
  admin: { email: 'admin@panelizer.test', team: 'main', role: 'admin' },
  editor: { email: 'editor@panelizer.test', team: 'main', role: 'editor' },
  /** Conta sem time: entra no app, mas a RLS não deixa ver nem gravar nada. */
  outsider: { email: 'outsider@panelizer.test', team: undefined, role: undefined },
  rival: { email: 'rival@panelizer.test', team: 'rival', role: 'admin' },
};

export interface SeededAccounts {
  ids: Record<AccountId, string>;
  mainTeamId: string;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** Cliente com a chave secret (ignora a RLS). Só para preparar e limpar. */
export function serviceClient(env: LocalSupabaseEnv): SupabaseClient<Database> {
  return createClient<Database>(env.url, env.secretKey, noSession);
}

/** Cliente da chave publicável com a sessão de uma conta de teste — o mesmo caminho do app (RLS valendo). */
export async function signedInClient(env: LocalSupabaseEnv, account: AccountId): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(env.url, env.key, noSession);
  const { error } = await client.auth.signInWithPassword({ email: ACCOUNTS[account].email, password: TEST_PASSWORD });
  if (error !== null) throw new Error(`login de ${account} falhou: ${error.message}`);
  return client;
}

async function findUserId(admin: SupabaseClient<Database>, email: string): Promise<string | undefined> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error !== null) throw new Error(`listUsers: ${error.message}`);
    const found = data.users.find((u) => u.email === email);
    if (found !== undefined) return found.id;
    if (data.users.length < 200) return undefined;
  }
  return undefined;
}

/**
 * Cria (ou reaproveita) as quatro contas, confirmadas e com `TEST_PASSWORD`, e deixa cada uma no time e papel de
 * `ACCOUNTS` — inclusive desfazendo o que um teste anterior interrompido tenha deixado (ex.: `outsider` num time).
 */
export async function seedAccounts(env: LocalSupabaseEnv): Promise<SeededAccounts> {
  const admin = serviceClient(env);
  const { data: team, error: teamError } = await admin
    .from('teams')
    .select('id')
    .eq('name', MAIN_TEAM_NAME)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (teamError !== null) throw new Error(`time ${MAIN_TEAM_NAME}: ${teamError.message} (migrações aplicadas?)`);
  if (team === null)
    throw new Error(`time ${MAIN_TEAM_NAME} não existe: a migração 20261104000200_teams.sql não rodou`);
  const { error: rivalError } = await admin
    .from('teams')
    .upsert({ id: RIVAL_TEAM_ID, name: 'Rival Framing' }, { onConflict: 'id' });
  if (rivalError !== null) throw new Error(`time rival: ${rivalError.message}`);

  const ids = {} as Record<AccountId, string>;
  for (const [account, spec] of Object.entries(ACCOUNTS) as [AccountId, (typeof ACCOUNTS)[AccountId]][]) {
    const created = await admin.auth.admin.createUser({
      email: spec.email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    let id = created.data.user?.id;
    if (id === undefined) {
      id = await findUserId(admin, spec.email);
      if (id === undefined) throw new Error(`conta ${spec.email}: ${created.error?.message ?? 'sem id'}`);
      // Reaproveitada: a senha pode ter mudado num teste de troca de senha, e a conta pode ter ficado banida (S41).
      const { error } = await admin.auth.admin.updateUserById(id, { password: TEST_PASSWORD, email_confirm: true, ban_duration: 'none' });
      if (error !== null) throw new Error(`conta ${spec.email}: ${error.message}`);
    }
    ids[account] = id;
  }

  // Primeiro põe/promove, depois tira: o trigger do último admin recusa ficar um time sem admin no meio do caminho.
  for (const [account, spec] of Object.entries(ACCOUNTS) as [AccountId, (typeof ACCOUNTS)[AccountId]][]) {
    if (spec.team === undefined || spec.role === undefined) continue;
    const teamId = spec.team === 'main' ? team.id : RIVAL_TEAM_ID;
    const { error } = await admin
      .from('team_members')
      .upsert(
        { team_id: teamId, user_id: ids[account], email: spec.email, role: spec.role, name: null, disabled_at: null },
        { onConflict: 'team_id,user_id' },
      );
    if (error !== null) throw new Error(`membro ${spec.email}: ${error.message}`);
  }
  for (const [account, spec] of Object.entries(ACCOUNTS) as [AccountId, (typeof ACCOUNTS)[AccountId]][]) {
    const keep = spec.team === undefined ? [] : [spec.team === 'main' ? team.id : RIVAL_TEAM_ID];
    let query = admin.from('team_members').delete().eq('user_id', ids[account]);
    if (keep.length > 0) query = query.not('team_id', 'in', `(${keep.join(',')})`);
    const { error } = await query;
    if (error !== null) throw new Error(`limpeza de ${spec.email}: ${error.message}`);
  }
  return { ids, mainTeamId: team.id };
}
