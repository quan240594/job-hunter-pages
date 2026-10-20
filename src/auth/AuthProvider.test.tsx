import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN, ALEX, createFakeApi } from '../__fixtures__/fakeApi';
import type { ApiError, Session } from '../api';
import { AuthProvider } from './AuthProvider';
import { useApi, useAuth, useSession } from './context';

function Probe() {
  const { state, signIn, signOut, refresh } = useAuth();
  const api = useApi();
  return (
    <div>
      <p data-testid="status">{state.status === 'authenticated' ? state.session.email : state.status}</p>
      <p data-testid="error">{state.status === 'error' ? state.error.message : ''}</p>
      <p data-testid="api">{typeof api.jobs.list}</p>
      <button onClick={() => void signIn('a@example.com', 'pw')}>in</button>
      <button onClick={() => void signOut()}>out</button>
      <button onClick={() => void refresh()}>refresh</button>
    </div>
  );
}

function SessionProbe() {
  return <p>{useSession().email}</p>;
}

function Gate() {
  const { state } = useAuth();
  return state.status === 'authenticated' ? <SessionProbe /> : null;
}

const renderProbe = (api: ReturnType<typeof createFakeApi>['api']) =>
  render(
    <AuthProvider api={api}>
      <Probe />
    </AuthProvider>,
  );

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: ApiError) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AuthProvider', () => {
  it('starts loading, then reports an anonymous visitor', async () => {
    renderProbe(createFakeApi(null).api);
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    expect(await screen.findByText('anonymous')).toBeInTheDocument();
    expect(screen.getByTestId('api')).toHaveTextContent('function');
  });

  it('reports the signed-in user and follows auth changes', async () => {
    const fake = createFakeApi(ALEX);
    renderProbe(fake.api);
    expect(await screen.findByText('alex@example.com')).toBeInTheDocument();
    act(() => fake.emit(ADMIN));
    expect(screen.getByTestId('status')).toHaveTextContent('admin@example.com');
    act(() => fake.emit(null));
    expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
  });

  it('reports an error when the session cannot be read', async () => {
    const fake = createFakeApi(null, { getSession: () => Promise.reject({ code: 'network', message: 'offline' }) });
    renderProbe(fake.api);
    expect(await screen.findByText('error')).toBeInTheDocument();
    expect(screen.getByTestId('error')).toHaveTextContent('offline');
  });

  it('signs in and out through the api', async () => {
    const user = userEvent.setup();
    renderProbe(createFakeApi(null).api);
    await screen.findByText('anonymous');
    await user.click(screen.getByRole('button', { name: 'in' }));
    expect(await screen.findByText('alex@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'out' }));
    expect(await screen.findByText('anonymous')).toBeInTheDocument();
  });

  it('unsubscribes on unmount and ignores late results', async () => {
    const pending = deferred<Session | null>();
    const fake = createFakeApi(null, { getSession: () => pending.promise });
    const view = renderProbe(fake.api);
    expect(fake.listenerCount()).toBe(1);
    view.unmount();
    expect(fake.listenerCount()).toBe(0);
    await act(async () => {
      pending.resolve(ALEX);
      await pending.promise;
    });
    expect(view.container).toBeEmptyDOMElement();
  });

  it('ignores a late failure after unmount', async () => {
    const pending = deferred<Session | null>();
    const fake = createFakeApi(null, { getSession: () => pending.promise });
    const view = renderProbe(fake.api);
    view.unmount();
    pending.reject({ code: 'network', message: 'late' });
    await act(async () => {
      await pending.promise.catch(() => undefined);
    });
    expect(view.container).toBeEmptyDOMElement();
  });

  it('ignores an auth change delivered after unmount', async () => {
    let captured: ((session: Session | null) => void) | undefined;
    const fake = createFakeApi(null, {
      onAuthChange: (callback) => {
        captured = callback;
        return () => undefined;
      },
    });
    const view = renderProbe(fake.api);
    view.unmount();
    captured?.(ALEX);
    expect(view.container).toBeEmptyDOMElement();
  });

  it('re-reads the session on refresh (the forced password change cleared the flag)', async () => {
    const user = userEvent.setup();
    let session: Session = { ...ALEX, mustChangePassword: true };
    const fake = createFakeApi(null, { getSession: () => Promise.resolve(session) });
    const spy = vi.spyOn(fake.api.auth, 'getSession');
    renderProbe(fake.api);
    expect(await screen.findByText('alex@example.com')).toBeInTheDocument();
    session = { ...ADMIN };
    await user.click(screen.getByRole('button', { name: 'refresh' }));
    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('turns a failed refresh into the error state instead of rejecting', async () => {
    const user = userEvent.setup();
    let fail = false;
    const fake = createFakeApi(null, {
      getSession: () => (fail ? Promise.reject({ code: 'network', message: 'offline' }) : Promise.resolve(ALEX)),
    });
    renderProbe(fake.api);
    await screen.findByText('alex@example.com');
    fail = true;
    await user.click(screen.getByRole('button', { name: 'refresh' }));
    expect(await screen.findByText('error')).toBeInTheDocument();
  });

  it('exposes the session to guarded screens', async () => {
    render(
      <AuthProvider api={createFakeApi(ALEX).api}>
        <Gate />
      </AuthProvider>,
    );
    expect(await screen.findByText('alex@example.com')).toBeInTheDocument();
  });

  it('refuses useSession without a signed-in user', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(
        <AuthProvider api={createFakeApi(null).api}>
          <SessionProbe />
        </AuthProvider>,
      ),
    ).toThrow('useSession requires a signed-in user');
    spy.mockRestore();
  });

  it('refuses to be used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow('useAuth must be used inside <AuthProvider>');
    spy.mockRestore();
  });
});
