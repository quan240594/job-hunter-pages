import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseClientOptions {
  url: string;
  anonKey: string;
}

/**
 * The single browser client (anon key + the user's JWT; RLS does the authorisation).
 * PKCE keeps the auth callback in the query string (`?code=...`), so it cannot collide with the HashRouter route in the
 * URL hash; detectSessionInUrl is therefore safe to leave on (see docs/DESIGN.md, "Auth redirects and HashRouter").
 */
export function createSupabaseClient({ url, anonKey }: SupabaseClientOptions): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce', detectSessionInUrl: true },
  });
}
