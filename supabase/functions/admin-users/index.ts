// Thin Deno entry point: wires the real service-role client into the tested handler (no logic here).
import { createClient } from '@supabase/supabase-js';
import { createHandler, resolveAllowedOrigins } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(
  createHandler({
    admin,
    now: Date.now,
    allowedOrigins: resolveAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS')),
    logError: (message) => console.error(message),
  }),
);
