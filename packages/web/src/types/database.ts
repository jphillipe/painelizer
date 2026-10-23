/**
 * Tipos da base do Supabase (S22.0), escritos à mão a partir de `supabase/migrations/*.sql`. Mudou o SQL, muda
 * aqui. A forma é a que `SupabaseClient<Database>` espera (`supabase gen types` gera o mesmo esqueleto).
 */

import type { Json } from './json';

export interface ProjectRow {
  id: string;
  owner_id: string | null;
  owner_email: string | null;
  name: string;
  /** O `.panelizer.json` inteiro (lib/editor/project-file.ts). */
  data: Json;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectInsert {
  id?: string;
  owner_id?: string | null;
  owner_email?: string | null;
  name: string;
  data: Json;
  revision?: number;
  created_at?: string;
  updated_at?: string;
}

export type ProjectUpdate = Partial<ProjectInsert>;

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: ProjectRow;
        Insert: ProjectInsert;
        Update: ProjectUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
