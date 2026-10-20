import { createContext, useContext } from 'react';
import type { ApiError, DataApi, Session } from '../api';

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; session: Session }
  | { status: 'error'; error: ApiError };

export interface AuthContextValue {
  state: AuthState;
  api: DataApi;
  signIn: (email: string, password: string) => Promise<Session>;
  signOut: () => Promise<void>;
  /** Re-reads the session (e.g. after the password change cleared mustChangePassword). Never rejects. */
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** The signed-in session; only for screens behind <RouteGuard>. */
export function useSession(): Session {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('useSession requires a signed-in user');
  return state.session;
}

/** The DataApi of the running app (mock or supabase). */
export function useApi(): DataApi {
  return useAuth().api;
}
