import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ForbiddenScreen } from './ForbiddenScreen';
import { describeError } from './apiError';
import { useAuth } from './context';
import { CHANGE_PASSWORD_PATH, LOGIN_PATH } from './paths';
import type { ReturnState } from './paths';

export { ACCOUNT_PATH, CHANGE_PASSWORD_PATH, HOME_PATH, LOGIN_PATH } from './paths';

interface Props {
  /** Only admins may see the page; other signed-in users get the forbidden screen. */
  requireAdmin?: boolean;
  children: ReactNode;
}

export function RouteGuard({ requireAdmin = false, children }: Readonly<Props>) {
  const { state } = useAuth();
  const { pathname, search } = useLocation();
  const returnState: ReturnState = { from: pathname + search };

  if (state.status === 'loading') return <p role="status">Loading…</p>;
  if (state.status === 'error') return <p role="alert">{describeError(state.error)}</p>;
  if (state.status === 'anonymous') return <Navigate to={LOGIN_PATH} replace state={returnState} />;

  const { session } = state;
  if (session.mustChangePassword && pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace state={returnState} />;
  }
  if (requireAdmin && session.role !== 'admin') return <ForbiddenScreen />;
  return <>{children}</>;
}
