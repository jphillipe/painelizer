/**
 * Tipos da base do Supabase (S22.0), escritos à mão a partir de `supabase/migrations/*.sql`. Mudou o SQL, muda
 * aqui. A forma é a que `SupabaseClient<Database>` espera (`supabase gen types` gera o mesmo esqueleto). Linhas como
 * `type`, não `interface`: o postgrest-js exige `Record<string, unknown>`, que só tipos literais satisfazem — com
 * `interface` a tabela inteira colapsava para `never` (S22.1).
 */

import type { Json } from './json';

export type ProjectRow = {
  id: string;
  owner_id: string | null;
  owner_email: string | null;
  name: string;
  /** O `.panelizer.json` inteiro (lib/editor/project-file.ts). */
  data: Json;
  revision: number;
  created_at: string;
  updated_at: string;
  /** S32: o time dono do projeto (RLS por time). */
  team_id: string;
  /** S32: quem gravou por último (trigger, da sessão). */
  updated_by: string | null;
  updated_by_email: string | null;
  /** S32: lixeira — com data, o projeto está na lixeira (fora da lista e do editor). */
  deleted_at: string | null;
  deleted_by: string | null;
};

export type ProjectInsert = {
  id?: string;
  owner_id?: string | null;
  owner_email?: string | null;
  name: string;
  data: Json;
  revision?: number;
  created_at?: string;
  updated_at?: string;
  /** Default `private.default_team_id()`: o time de quem grava. */
  team_id?: string;
  updated_by?: string | null;
  updated_by_email?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export type ProjectUpdate = Partial<ProjectInsert>;

/** S32: times (supabase/migrations/20261104000200_teams.sql). */
export type TeamRow = {
  id: string;
  name: string;
  created_at: string;
};

export type TeamInsert = {
  id?: string;
  name: string;
  created_at?: string;
};

export type TeamRole = 'admin' | 'editor';

export type TeamMemberRow = {
  team_id: string;
  user_id: string;
  email: string;
  role: TeamRole;
  invited_by: string | null;
  created_at: string;
};

export type TeamMemberInsert = {
  team_id: string;
  user_id: string;
  email: string;
  role?: TeamRole;
  invited_by?: string | null;
  created_at?: string;
};

/** S32: retrato de um projeto a cada 20 gravações (20261104000300), sem `$panelizer` nem `$underlay`. Só leitura. */
export type ProjectRevisionRow = {
  id: number;
  project_id: string;
  team_id: string;
  revision: number;
  name: string;
  data: Json;
  saved_by: string | null;
  saved_by_email: string | null;
  created_at: string;
};

export type AddTeamMemberResult = 'added' | 'already_member' | 'no_account' | 'forbidden';

/** S24: uma leitura da IA (supabase/migrations/20261104000000_extraction_jobs.sql). RLS por dono. */
export type ExtractionJobRow = {
  id: string;
  owner_id: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  phase: 'preparing' | 'waiting' | 'reading';
  input_tokens: number | null;
  output_tokens: number;
  message: string | null;
  /** O `ExtractOutcome` (types/extract.ts) do fim da leitura. */
  result: Json | null;
  cancel_requested: boolean;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
};

export type ExtractionJobInsert = {
  id: string;
  owner_id?: string;
  status?: ExtractionJobRow['status'];
  phase?: ExtractionJobRow['phase'];
  input_tokens?: number | null;
  output_tokens?: number;
  message?: string | null;
  result?: Json | null;
  cancel_requested?: boolean;
  created_at?: string;
  updated_at?: string;
  ended_at?: string | null;
};

export type ExtractionJobUpdate = Partial<ExtractionJobInsert>;

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: ProjectRow;
        Insert: ProjectInsert;
        Update: ProjectUpdate;
        Relationships: [];
      };
      extraction_jobs: {
        Row: ExtractionJobRow;
        Insert: ExtractionJobInsert;
        Update: ExtractionJobUpdate;
        Relationships: [];
      };
      teams: {
        Row: TeamRow;
        Insert: TeamInsert;
        Update: Partial<TeamInsert>;
        Relationships: [];
      };
      team_members: {
        Row: TeamMemberRow;
        Insert: TeamMemberInsert;
        Update: Partial<TeamMemberInsert>;
        Relationships: [];
      };
      project_revisions: {
        Row: ProjectRevisionRow;
        /** Só o trigger grava; o cliente não insere (RLS). */
        Insert: Partial<ProjectRevisionRow>;
        Update: Partial<ProjectRevisionRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      add_team_member: {
        Args: { team: string; member_email: string; member_role?: TeamRole };
        Returns: AddTeamMemberResult;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
