import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiError, DataApi, Session } from '../api';
import { AuthContext } from './context';
import type { AuthContextValue, AuthState } from './context';

interface Props {
  api: DataApi;
  children: ReactNode;
}

function toState(session: Session | null): AuthState {
  return session === null ? { status: 'anonymous' } : { status: 'authenticated', session };
}

export function AuthProvider({ api, children }: Readonly<Props>) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    const apply = (session: Session | null) => {
      if (active) setState(toState(session));
    };
    api.auth.getSession().then(apply, (error: ApiError) => {
      if (active) setState({ status: 'error', error });
    });
    const unsubscribe = api.auth.onAuthChange(apply);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session = await api.auth.signIn(email, password);
      setState(toState(session));
      return session;
    },
    [api],
  );

  const signOut = useCallback(async () => {
    await api.auth.signOut();
    setState(toState(null));
  }, [api]);

  const refresh = useCallback(
    () =>
      api.auth.getSession().then(
        (session) => setState(toState(session)),
        (error_: ApiError) => setState({ status: 'error', error: error_ }),
      ),
    [api],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ state, api, signIn, signOut, refresh }),
    [state, api, signIn, signOut, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
