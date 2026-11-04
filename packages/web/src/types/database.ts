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
};

export type ProjectUpdate = Partial<ProjectInsert>;

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
