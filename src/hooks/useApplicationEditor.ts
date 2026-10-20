import { useCallback, useState } from 'react';
import { useApi } from '../auth/context';
import type { Application, ApplicationPatch } from '../api';
import { errorMessage } from '../lib/errors';
import type { AsyncState } from './useAsync';

/** Edits applications with optimistic updates: the list changes at once and rolls back when the API refuses. */
export function useApplicationEditor(state: AsyncState<Application[]>) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const { setData } = state;

  const replace = useCallback(
    (next: Application) => setData((current) => current.map((item) => (item.id === next.id ? next : item))),
    [setData],
  );

  const patch = async (application: Application, change: ApplicationPatch): Promise<boolean> => {
    setError(null);
    replace({ ...application, ...change });
    try {
      replace(await api.applications.update(application.id, change));
      return true;
    } catch (error_) {
      replace(application);
      setError(`Could not save the change, it was reverted: ${errorMessage(error_)}`);
      return false;
    }
  };

  /** Rejects with the ApiError so a confirm dialog can show it. */
  const remove = async (application: Application): Promise<void> => {
    await api.applications.remove(application.id);
    setData((current) => current.filter((item) => item.id !== application.id));
  };

  return { error, patch, remove };
}
