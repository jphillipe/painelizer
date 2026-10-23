import { describe, expect, it } from 'vitest';
import { hasSupabase, supabaseEnv } from './env';

describe('supabaseEnv (S22.0)', () => {
  it('URL e chave publicável, sem espaços', () => {
    expect(supabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: ' https://x.supabase.co ', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1 ' })).toEqual({ url: 'https://x.supabase.co', key: 'sb_publishable_1' });
  });

  it('aceita o nome antigo da chave (anon)', () => {
    expect(supabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJ' })).toEqual({ url: 'https://x.supabase.co', key: 'eyJ' });
  });

  it('faltando qualquer uma, não há Supabase', () => {
    expect(supabaseEnv({})).toBeUndefined();
    expect(supabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toBeUndefined();
    expect(supabaseEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k', NEXT_PUBLIC_SUPABASE_URL: '  ' })).toBeUndefined();
    expect(hasSupabase({})).toBe(false);
    expect(hasSupabase({ NEXT_PUBLIC_SUPABASE_URL: 'u', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBe(true);
  });
});
