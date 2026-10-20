import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { readTimeFilter, writeTimeFilter } from '../lib/timeFilter';
import type { TimeFilterValue } from '../lib/timeFilter';

/** URL query string as view state: filters survive reloads and can be shared as links. */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams();
  const update = useCallback((next: URLSearchParams) => setParams(next, { replace: true }), [setParams]);
  const time = readTimeFilter(params);
  const setTime = (value: TimeFilterValue) => update(writeTimeFilter(params, value));
  return { params, update, time, setTime };
}
