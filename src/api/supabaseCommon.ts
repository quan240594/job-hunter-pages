import type { SupabaseClient, User } from '@supabase/supabase-js';
import { apiError } from './errors';
import { mapError } from './supabaseErrors';
import type { Role, Session } from './types';

export type Client = SupabaseClient;

/** supabase-js reports failures as `{ data, error }`; this unwraps `data` or throws the mapped ApiError. */
export function orThrow<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw mapError(result.error);
  return result.data;
}

export function rowsOf(data: unknown): unknown[] {
  if (!Array.isArray(data)) throw apiError('unknown', 'Unexpected response from the server.');
  return data;
}

/** A null row from `.maybeSingle()` means the row does not exist or RLS hides it: both are 'not_found'. */
export function foundOrThrow<T>(data: T | null, what: string): T {
  if (data === null) throw apiError('not_found', `${what} not found.`);
  return data;
}

/** Wraps a method so anything it throws (including unexpected runtime errors) rejects with an ApiError. */
export function guarded<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw mapError(error);
    }
  };
}

/** The signed-in user's id from the locally stored session (no network round trip). */
export async function currentUserId(client: Client): Promise<string> {
  const { data, error } = await client.auth.getSession();
  if (error) throw mapError(error);
  if (data.session === null) throw apiError('unauthenticated', 'You are not signed in.');
  return data.session.user.id;
}

/** Role from the JWT claim app_metadata.role (only the service role can write it); absent means 'user'. */
export function toSession(user: User): Session {
  const role: Role = user.app_metadata?.role === 'admin' ? 'admin' : 'user';
  return {
    userId: user.id,
    email: user.email ?? '',
    role,
    mustChangePassword: user.user_metadata?.must_change_password === true,
  };
}
