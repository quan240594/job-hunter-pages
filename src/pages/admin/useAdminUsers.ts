import { useCallback, useEffect, useState } from 'react';
import type { AdminUser, DataApi } from '../../api';
import { describeError } from '../../auth/apiError';

export type AdminApi = DataApi['admin'];

export type UsersState =
  | { status: 'loading' }
  | { status: 'error'; text: string }
  | { status: 'ready'; users: AdminUser[] };

const fetchUsers = (admin: AdminApi): Promise<UsersState> =>
  admin.listUsers().then(
    (users): UsersState => ({ status: 'ready', users }),
    (error_): UsersState => ({ status: 'error', text: describeError(error_) }),
  );

/** Loads the user list on mount; `reload` refetches (used after every admin action instead of patching locally). */
export function useAdminUsers(admin: AdminApi) {
  const [state, setState] = useState<UsersState>({ status: 'loading' });

  useEffect(() => {
    void fetchUsers(admin).then(setState);
  }, [admin]);

  const reload = useCallback(async () => setState(await fetchUsers(admin)), [admin]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    return reload();
  }, [reload]);

  return { state, reload, retry };
}
