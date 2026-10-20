import { createFakeSupabase } from './__fixtures__/fakeSupabase';
import { buildAuth } from './supabaseAuth';

function setup(overrides: { ready?: () => Promise<void>; collectExport?: () => Promise<unknown> } = {}) {
  const fake = createFakeSupabase();
  const ready = vi.fn(overrides.ready ?? (() => Promise.resolve()));
  const collectExport = vi.fn(overrides.collectExport ?? (() => Promise.resolve({ profile: null })));
  return { fake, ready, collectExport, auth: buildAuth(fake.client, { ready, collectExport }) };
}

const SESSION_USER = { id: 'u1', email: 'alex@example.com', app_metadata: { role: 'admin' }, user_metadata: { must_change_password: true } };

describe('auth.getSession', () => {
  it('waits for the invite/recovery link, then maps the stored session', async () => {
    const { fake, ready, auth } = setup();
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: { user: SESSION_USER } }, error: null });
    await expect(auth.getSession()).resolves.toEqual({ userId: 'u1', email: 'alex@example.com', role: 'admin', mustChangePassword: true });
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('is null when signed out and maps errors', async () => {
    const { fake, auth } = setup();
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(auth.getSession()).resolves.toBeNull();
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'offline' } });
    await expect(auth.getSession()).rejects.toEqual({ code: 'network', message: 'offline' });
  });
});

describe('auth.onAuthChange', () => {
  it('maps sessions for the callback and unsubscribes', () => {
    const { fake, auth } = setup();
    const callback = vi.fn();
    const unsubscribe = auth.onAuthChange(callback);
    const listener = fake.auth.onAuthStateChange.mock.calls[0][0];
    listener('SIGNED_IN', { user: { id: 'u1', email: 'alex@example.com' } });
    listener('SIGNED_OUT', null);
    expect(callback.mock.calls).toEqual([
      [{ userId: 'u1', email: 'alex@example.com', role: 'user', mustChangePassword: false }],
      [null],
    ]);
    unsubscribe();
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('auth.signIn / signOut', () => {
  it('signs in with email and password', async () => {
    const { fake, auth } = setup();
    await expect(auth.signIn('alex@example.com', 'pw')).resolves.toMatchObject({ userId: 'u1', role: 'user' });
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'alex@example.com', password: 'pw' });
  });

  it('maps bad credentials and banned users', async () => {
    const { fake, auth } = setup();
    fake.auth.signInWithPassword
      .mockResolvedValueOnce({ data: null, error: { name: 'AuthApiError', code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } })
      .mockResolvedValueOnce({ data: null, error: { name: 'AuthApiError', code: 'user_banned', status: 400, message: 'User is banned' } });
    await expect(auth.signIn('a@example.com', 'x')).rejects.toEqual({ code: 'unauthenticated', message: 'Invalid login credentials' });
    await expect(auth.signIn('a@example.com', 'x')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('signs out globally and maps failures', async () => {
    const { fake, auth } = setup();
    await expect(auth.signOut()).resolves.toBeUndefined();
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
    fake.auth.signOut.mockResolvedValueOnce({ error: { status: 500, message: 'boom' } });
    await expect(auth.signOut()).rejects.toMatchObject({ code: 'unknown', message: 'boom' });
  });
});

describe('auth.changePassword', () => {
  it('updates the password and clears must_change_password', async () => {
    const { fake, auth } = setup();
    await expect(auth.changePassword('a-new-value')).resolves.toBeUndefined();
    expect(fake.auth.updateUser).toHaveBeenCalledWith({ password: 'a-new-value', data: { must_change_password: false } });
  });

  it('maps weak and unchanged passwords', async () => {
    const { fake, auth } = setup();
    fake.auth.updateUser
      .mockResolvedValueOnce({ data: null as never, error: { code: 'weak_password', status: 422, message: 'weak' } })
      .mockResolvedValueOnce({ data: null as never, error: { code: 'same_password', status: 422, message: 'same' } });
    await expect(auth.changePassword('x')).rejects.toMatchObject({ code: 'validation' });
    await expect(auth.changePassword('x')).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('auth.deleteMyAccount', () => {
  it('calls deleteSelf, then drops only the local session', async () => {
    const { fake, auth } = setup();
    fake.functions.invoke.mockResolvedValueOnce({ data: { ok: true, data: null }, error: null });
    await expect(auth.deleteMyAccount()).resolves.toBeUndefined();
    expect(fake.functions.invoke).toHaveBeenCalledWith('admin-users', { body: { action: 'deleteSelf' } });
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('keeps the session when the function refuses', async () => {
    const { fake, auth } = setup();
    fake.functions.invoke.mockResolvedValueOnce({ data: { ok: false, error: { code: 'forbidden', message: 'last admin' } }, error: null });
    await expect(auth.deleteMyAccount()).rejects.toEqual({ code: 'forbidden', message: 'last admin' });
    expect(fake.auth.signOut).not.toHaveBeenCalled();
  });
});

describe('auth.exportMyData', () => {
  it('returns a JSON blob of the collected data', async () => {
    const { collectExport, auth } = setup({ collectExport: () => Promise.resolve({ profile: null, jobs: [{ id: 'j1' }] }) });
    const blob = await auth.exportMyData();
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toEqual({ profile: null, jobs: [{ id: 'j1' }] });
    expect(collectExport).toHaveBeenCalledTimes(1);
  });

  it('needs a session', async () => {
    const { fake, collectExport, auth } = setup();
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(auth.exportMyData()).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(collectExport).not.toHaveBeenCalled();
  });
});
