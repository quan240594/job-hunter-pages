import type { AuthApi } from './dataApi';
import { callAdmin } from './supabaseAdmin';
import { currentUserId, guarded, toSession, type Client } from './supabaseCommon';
import { mapError } from './supabaseErrors';
import type { Session } from './types';

export interface AuthDeps {
  /** Resolves once a pending invite/recovery link in the URL has been consumed. */
  ready: () => Promise<void>;
  /** The caller's rows as the JSON export document (profile, jobs, applications, documents). */
  collectExport: () => Promise<unknown>;
}

async function getSession(client: Client, deps: AuthDeps): Promise<Session | null> {
  await deps.ready();
  const { data, error } = await client.auth.getSession();
  if (error) throw mapError(error);
  return data.session === null ? null : toSession(data.session.user);
}

async function signIn(client: Client, email: string, password: string): Promise<Session> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw mapError(error);
  return toSession(data.user);
}

async function signOut(client: Client, scope: 'global' | 'local' = 'global'): Promise<void> {
  const { error } = await client.auth.signOut({ scope });
  if (error) throw mapError(error);
}

// Clearing the flag in the same call keeps the forced first-login change a single step.
async function changePassword(client: Client, newPassword: string): Promise<void> {
  const { error } = await client.auth.updateUser({ password: newPassword, data: { must_change_password: false } });
  if (error) throw mapError(error);
}

// The auth user is gone after deleteSelf, so only the local session can still be dropped.
async function deleteMyAccount(client: Client): Promise<void> {
  await callAdmin(client, { action: 'deleteSelf' });
  await signOut(client, 'local');
}

async function exportMyData(client: Client, deps: AuthDeps): Promise<Blob> {
  await currentUserId(client);
  const data = await deps.collectExport();
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

export function buildAuth(client: Client, deps: AuthDeps): AuthApi {
  return {
    getSession: guarded(() => getSession(client, deps)),
    onAuthChange: (callback) => {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        callback(session === null ? null : toSession(session.user));
      });
      return () => data.subscription.unsubscribe();
    },
    signIn: guarded((email: string, password: string) => signIn(client, email, password)),
    signOut: guarded(() => signOut(client)),
    changePassword: guarded((newPassword: string) => changePassword(client, newPassword)),
    deleteMyAccount: guarded(() => deleteMyAccount(client)),
    exportMyData: guarded(() => exportMyData(client, deps)),
  };
}
