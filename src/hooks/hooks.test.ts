import { act, renderHook, waitFor } from '@testing-library/react';
import { useAction } from './useAction';
import { useAsync } from './useAsync';
import { useLatest } from './useLatest';

describe('useAsync', () => {
  it('loads data and reports success', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve(['a']), 'k'));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(['a']);
    expect(result.current.error).toBeNull();
  });

  it('reports the ApiError message and retries on reload', async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: 'network', message: 'offline' })
      .mockResolvedValueOnce('back');
    const { result } = renderHook(() => useAsync(load, 'k'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('offline');
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toBe('back');
  });

  it('keeps the old data while a new key loads and ignores superseded results', async () => {
    const pending: { resolve?: (value: string) => void } = {};
    const load = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => new Promise((resolve) => (pending.resolve = resolve)))
      .mockResolvedValueOnce('second')
      .mockResolvedValue('third');
    const { result, rerender } = renderHook(({ key }) => useAsync(load, key), { initialProps: { key: 'one' } });
    rerender({ key: 'two' });
    await waitFor(() => expect(result.current.data).toBe('second'));
    act(() => pending.resolve?.('first'));
    expect(result.current.data).toBe('second');
    rerender({ key: 'three' });
    expect(result.current.refreshing).toBe(true);
    expect(result.current.status).toBe('success');
  });

  it('ignores a failure of a superseded request', async () => {
    const pending: { reject?: (reason: unknown) => void } = {};
    const load = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => (pending.reject = reject)))
      .mockResolvedValue('second');
    const { result, rerender } = renderHook(({ key }) => useAsync(load, key), { initialProps: { key: 'one' } });
    rerender({ key: 'two' });
    await waitFor(() => expect(result.current.data).toBe('second'));
    act(() => pending.reject?.({ code: 'network', message: 'late failure' }));
    expect(result.current.status).toBe('success');
    expect(result.current.error).toBeNull();
  });

  it('updates the loaded data locally, but not before there is any', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve([1, 2]), 'k'));
    act(() => result.current.setData((current) => [...current, 3]));
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.status).toBe('success'));
    act(() => result.current.setData((current) => [...current, 3]));
    expect(result.current.data).toEqual([1, 2, 3]);
  });
});

describe('useAction', () => {
  it('runs an action and reports success', async () => {
    const { result } = renderHook(() => useAction());
    let outcome = false;
    await act(async () => {
      outcome = await result.current.run(() => Promise.resolve());
    });
    expect(outcome).toBe(true);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('reports the message of a failure and clears it on the next run', async () => {
    const { result } = renderHook(() => useAction());
    let outcome = true;
    await act(async () => {
      outcome = await result.current.run(() => Promise.reject({ code: 'conflict', message: 'Already there' }));
    });
    expect(outcome).toBe(false);
    expect(result.current.error).toBe('Already there');
    await act(async () => {
      await result.current.run(() => Promise.resolve());
    });
    expect(result.current.error).toBeNull();
  });
});

describe('useLatest', () => {
  it('always holds the newest value', () => {
    const { result, rerender } = renderHook(({ value }) => useLatest(value), { initialProps: { value: 1 } });
    expect(result.current.current).toBe(1);
    rerender({ value: 2 });
    expect(result.current.current).toBe(2);
  });
});
