import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { STANDARD_TEMPLATES, authValue, createStubApi, makeApplication, makeDocument, makeJob, makeProfile } from '../__fixtures__/uiFixtures';
import type { DataApi } from '../api';
import { AuthContext } from '../auth/context';
import { useApplicationEditor } from './useApplicationEditor';
import { useApplications, useDocuments, useJobs, useNow, useProfile, useStandardTemplates } from './useData';
import { useAsync } from './useAsync';
import { useUrlFilters } from './useUrlFilters';

function wrapperFor(api: DataApi, route = '/') {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <AuthContext.Provider value={authValue(api)}>{children}</AuthContext.Provider>
      </MemoryRouter>
    );
  };
}

describe('data hooks', () => {
  it('load jobs, applications, documents, templates and the profile from the api', async () => {
    const api = createStubApi({
      jobs: { list: vi.fn(() => Promise.resolve([makeJob()])) },
      applications: { list: vi.fn(() => Promise.resolve([makeApplication()])) },
      documents: {
        list: vi.fn(() => Promise.resolve([makeDocument()])),
        standardTemplates: vi.fn(() => Promise.resolve(STANDARD_TEMPLATES)),
      },
      profile: { get: vi.fn(() => Promise.resolve(makeProfile())) },
    });
    const { result } = renderHook(
      () => ({
        jobs: useJobs({ status: 'new' }),
        applications: useApplications({ since: '2026-01-01T00:00:00.000Z' }),
        documents: useDocuments(),
        templates: useStandardTemplates(),
        profile: useProfile(),
      }),
      { wrapper: wrapperFor(api) },
    );
    await waitFor(() => expect(result.current.profile.status).toBe('success'));
    await waitFor(() => expect(result.current.jobs.data).toHaveLength(1));
    expect(api.jobs.list).toHaveBeenCalledWith({ status: 'new' });
    expect(api.applications.list).toHaveBeenCalledWith({ since: '2026-01-01T00:00:00.000Z' });
    expect(result.current.documents.data).toHaveLength(1);
    expect(result.current.templates.data).toEqual(STANDARD_TEMPLATES);
  });

  it('useNow keeps one moment per mount', () => {
    const { result, rerender } = renderHook(() => useNow());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('useUrlFilters', () => {
  it('reads filters from the URL and writes time changes back', () => {
    const { result } = renderHook(() => useUrlFilters(), { wrapper: wrapperFor(createStubApi(), '/found?range=30d&q=x') });
    expect(result.current.time).toEqual({ range: '30d', from: '', to: '' });
    act(() => result.current.setTime({ range: '7d', from: '', to: '' }));
    expect(result.current.params.toString()).toBe('range=7d&q=x');
  });
});

describe('useApplicationEditor', () => {
  const first = makeApplication();
  const second = makeApplication({ id: 'app-2', jobId: 'job-2' });

  function setup(api: DataApi) {
    return renderHook(
      () => {
        const state = useAsync(() => Promise.resolve([first, second]), 'apps');
        return { state, editor: useApplicationEditor(state) };
      },
      { wrapper: wrapperFor(api) },
    );
  }

  it('applies a change optimistically and keeps the server answer', async () => {
    const pending: { resolve?: (value: ReturnType<typeof makeApplication>) => void } = {};
    const update = vi.fn(() => new Promise<ReturnType<typeof makeApplication>>((resolve) => (pending.resolve = resolve)));
    const { result } = setup(createStubApi({ applications: { update } }));
    await waitFor(() => expect(result.current.state.status).toBe('success'));
    let outcome: Promise<boolean> = Promise.resolve(false);
    act(() => {
      outcome = result.current.editor.patch(first, { stage: 'interview' });
    });
    expect(result.current.state.data?.[0].stage).toBe('interview');
    await act(async () => {
      pending.resolve?.({ ...first, stage: 'interview', notes: 'server' });
      await outcome;
    });
    expect(await outcome).toBe(true);
    expect(update).toHaveBeenCalledWith('app-1', { stage: 'interview' });
    expect(result.current.state.data?.[0].notes).toBe('server');
    expect(result.current.editor.error).toBeNull();
  });

  it('reverts and reports when the api refuses', async () => {
    const update = vi.fn(() => Promise.reject({ code: 'network', message: 'offline' }));
    const { result } = setup(createStubApi({ applications: { update } }));
    await waitFor(() => expect(result.current.state.status).toBe('success'));
    let outcome = true;
    await act(async () => {
      outcome = await result.current.editor.patch(first, { stage: 'offer' });
    });
    expect(outcome).toBe(false);
    expect(result.current.state.data?.[0].stage).toBe('applied');
    expect(result.current.editor.error).toBe('Could not save the change, it was reverted: offline');
  });

  it('removes an application from the list, and lets a refusal reach the caller', async () => {
    const remove = vi.fn().mockRejectedValueOnce({ code: 'network', message: 'offline' }).mockResolvedValueOnce(undefined);
    const { result } = setup(createStubApi({ applications: { remove } }));
    await waitFor(() => expect(result.current.state.status).toBe('success'));
    await act(async () => {
      await expect(result.current.editor.remove(first)).rejects.toEqual({ code: 'network', message: 'offline' });
    });
    expect(result.current.state.data).toHaveLength(2);
    await act(async () => {
      await result.current.editor.remove(first);
    });
    expect(result.current.state.data).toEqual([second]);
  });
});
