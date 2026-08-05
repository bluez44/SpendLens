import { useCallback, useRef, useState, type MutableRefObject } from 'react';

/**
 * Pairs a piece of state with a ref that always reflects the latest value.
 * Callers can read the ref inside async handlers to avoid stale closures,
 * without paying the boilerplate of maintaining `xRef` + `setX` by hand.
 */
export function useSyncedState<T>(initial: T): readonly [T, MutableRefObject<T>, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const ref = useRef<T>(initial);
  const set = useCallback((v: T) => {
    ref.current = v;
    setValue(v);
  }, []);
  return [value, ref, set] as const;
}
