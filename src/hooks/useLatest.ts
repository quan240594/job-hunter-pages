import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** A ref that always holds the latest value, so effects can call the newest callback without re-running. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
