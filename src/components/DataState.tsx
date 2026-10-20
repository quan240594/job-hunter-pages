import type { ReactNode } from 'react';
import type { AsyncState } from '../hooks/useAsync';
import { ErrorState } from './ErrorState';
import { Spinner } from './Spinner';

interface DataStateProps<T> {
  state: AsyncState<T>;
  children: (data: T) => ReactNode;
  loadingLabel?: string;
}

/** Renders the loading and error states of an async load; `children` renders the loaded data. */
export function DataState<T>({ state, children, loadingLabel = 'Loading…' }: Readonly<DataStateProps<T>>) {
  if (state.status === 'loading') return <Spinner label={loadingLabel} />;
  if (state.status === 'error') return <ErrorState message={state.error as string} onRetry={state.reload} />;
  return <div aria-busy={state.refreshing}>{children(state.data as T)}</div>;
}
