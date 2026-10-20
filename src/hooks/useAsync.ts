import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../lib/errors';
import { useLatest } from './useLatest';

export interface AsyncState<T> {
  status: 'loading' | 'success' | 'error';
  data: T | undefined;
  /** Message of the ApiError of the last load; null unless status is 'error'. */
  error: string | null;
  /** True while a reload is running and the previous data is still shown. */
  refreshing: boolean;
  reload: () => void;
  /** Replaces the loaded data locally (optimistic updates, removing a handled row). */
  setData: (update: (current: T) => T) => void;
}

interface Settled<T> {
  requestKey: string;
  data: T | undefined;
  error: string | null;
}

/**
 * Runs `load` whenever `key` changes (or `reload` is called) and ignores results of superseded requests.
 * `key` must encode every input of `load`.
 */
export function useAsync<T>(load: () => Promise<T>, key: string): AsyncState<T> {
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ requestKey: '', data: undefined, error: null });
  const loadRef = useLatest(load);
  const requestKey = `${key}#${version}`;

  useEffect(() => {
    let active = true;
    loadRef.current().then(
      (data) => {
        if (active) setSettled({ requestKey, data, error: null });
      },
      (reason: unknown) => {
        if (active) setSettled({ requestKey, data: undefined, error: errorMessage(reason) });
      },
    );
    return () => {
      active = false;
    };
  }, [requestKey, loadRef]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const setData = useCallback((update: (current: T) => T) => {
    setSettled((previous) => (previous.data === undefined ? previous : { ...previous, data: update(previous.data) }));
  }, []);

  const pending = settled.requestKey !== requestKey;
  const failed = !pending && settled.error !== null;
  let status: AsyncState<T>['status'] = 'success';
  if (failed) status = 'error';
  else if (settled.data === undefined) status = 'loading';

  return { status, data: settled.data, error: failed ? settled.error : null, refreshing: pending, reload, setData };
}
