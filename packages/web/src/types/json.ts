/** JSON como o Postgres (`jsonb`) o devolve. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
