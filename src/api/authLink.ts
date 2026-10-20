import type { SupabaseClient } from '@supabase/supabase-js';

const LINK_TYPES: ReadonlySet<string> = new Set(['invite', 'recovery']);

export interface AuthLinkEnv {
  href: () => string;
  replace: (url: string) => void;
}

export const browserAuthLinkEnv: AuthLinkEnv = {
  href: () => window.location.href,
  replace: (url) => window.history.replaceState(window.history.state, '', url),
};

/**
 * Invite and recovery emails link to `{SiteURL}/?token_hash=...&type=invite|recovery` (supabase/templates). The hash
 * belongs to HashRouter, so the token travels in the query string: verify it once at startup, then strip it.
 * A failed verification (expired or used link) just leaves the user signed out.
 */
export async function consumeAuthLink(client: Pick<SupabaseClient, 'auth'>, env: AuthLinkEnv): Promise<void> {
  const url = new URL(env.href());
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (tokenHash === null || type === null || !LINK_TYPES.has(type)) return;
  await client.auth.verifyOtp({ token_hash: tokenHash, type });
  url.searchParams.delete('token_hash');
  url.searchParams.delete('type');
  env.replace(url.toString());
}
