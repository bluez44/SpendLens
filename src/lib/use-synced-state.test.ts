import { act, renderHook } from '@testing-library/react-native';

import { useSyncedState } from './use-synced-state';

describe('useSyncedState', () => {
  it('returns the initial value and a ref matching it', async () => {
    const { result } = await renderHook(() => useSyncedState('hello'));
    const [value, ref] = result.current;
    expect(value).toBe('hello');
    expect(ref.current).toBe('hello');
  });

  it('updates both state and ref when the setter is called', async () => {
    const { result } = await renderHook(() => useSyncedState(0));
    await act(async () => {
      const [, , set] = result.current;
      set(42);
    });
    const [value, ref] = result.current;
    expect(value).toBe(42);
    expect(ref.current).toBe(42);
  });

  it('ref reflects the latest value synchronously (no stale closure)', async () => {
    const { result } = await renderHook(() => useSyncedState('a'));
    const [, refBefore, set] = result.current;
    await act(async () => {
      set('b');
      // ref updates synchronously, before re-render
      expect(refBefore.current).toBe('b');
    });
    expect(result.current[0]).toBe('b');
  });

  it('setter identity is stable across renders', async () => {
    const { result, rerender } = await renderHook(() => useSyncedState(1));
    const firstSetter = result.current[2];
    await act(async () => rerender({}));
    expect(result.current[2]).toBe(firstSetter);
  });
});
