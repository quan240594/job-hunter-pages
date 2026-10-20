import { createFakeSupabase } from './__fixtures__/fakeSupabase';
import { buildAdmin, callAdmin } from './supabaseAdmin';

const USER = { id: 'u2', email: 'sam@example.com', role: 'user', createdAt: '2026-01-01T00:00:00Z', lastSignInAt: null, banned: false };
const TEMP_VALUE = 'temp-value';

function setup() {
  const fake = createFakeSupabase();
  return { fake, admin: buildAdmin(fake.client) };
}

const body = (data: unknown) => ({ data: { ok: true, data }, error: null as unknown });

function httpError(status: number, json: () => Promise<unknown>) {
  return { data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status, json } } };
}

describe('callAdmin', () => {
  it('posts the action to the admin-users function and unwraps data', async () => {
    const { fake } = setup();
    fake.functions.invoke.mockResolvedValueOnce(body([USER]));
    await expect(callAdmin(fake.client, { action: 'listUsers' })).resolves.toEqual([USER]);
    expect(fake.functions.invoke).toHaveBeenCalledWith('admin-users', { body: { action: 'listUsers' } });
  });

  it('throws the ApiError of an { ok: false } body, also from a non-2xx answer', async () => {
    const { fake } = setup();
    fake.functions.invoke
      .mockResolvedValueOnce({ data: { ok: false, error: { code: 'forbidden', message: 'Admins only' } }, error: null })
      .mockResolvedValueOnce(httpError(403, () => Promise.resolve({ ok: false, error: { code: 'conflict', message: 'exists' } })));
    await expect(callAdmin(fake.client, { action: 'listUsers' })).rejects.toEqual({ code: 'forbidden', message: 'Admins only' });
    await expect(callAdmin(fake.client, { action: 'listUsers' })).rejects.toEqual({ code: 'conflict', message: 'exists' });
  });

  it('falls back to the HTTP status when the error body is unusable', async () => {
    const { fake } = setup();
    fake.functions.invoke
      .mockResolvedValueOnce(httpError(403, () => Promise.resolve({ ok: true })))
      .mockResolvedValueOnce(httpError(404, () => Promise.reject(new SyntaxError('Unexpected end of JSON input'))))
      .mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', message: 'x', context: { status: 401 } } })
      .mockResolvedValueOnce({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } });
    await expect(callAdmin(fake.client, { action: 'listUsers' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(callAdmin(fake.client, { action: 'listUsers' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(callAdmin(fake.client, { action: 'listUsers' })).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(callAdmin(fake.client, { action: 'listUsers' })).rejects.toMatchObject({ code: 'network' });
  });

  it('rejects malformed bodies with unknown', async () => {
    const { fake } = setup();
    fake.functions.invoke
      .mockResolvedValueOnce({ data: { ok: false, error: { code: 'teapot', message: 'x' } }, error: null })
      .mockResolvedValueOnce({ data: { ok: false }, error: null })
      .mockResolvedValueOnce({ data: 'nope', error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    for (let attempt = 0; attempt < 4; attempt++) {
      await expect(callAdmin(fake.client, { action: 'listUsers' })).rejects.toMatchObject({ code: 'unknown' });
    }
  });
});

describe('admin API', () => {
  it('lists users', async () => {
    const { fake, admin } = setup();
    fake.functions.invoke.mockResolvedValueOnce(body([USER]));
    await expect(admin.listUsers()).resolves.toEqual([USER]);
    fake.functions.invoke.mockResolvedValueOnce(body({ not: 'an array' }));
    await expect(admin.listUsers()).rejects.toMatchObject({ code: 'unknown' });
    fake.functions.invoke.mockResolvedValueOnce(body([{ ...USER, banned: 'no' }]));
    await expect(admin.listUsers()).rejects.toMatchObject({ code: 'unknown' });
  });

  it('creates users with the contract payload', async () => {
    const { fake, admin } = setup();
    fake.functions.invoke.mockResolvedValue(body(USER));
    await expect(admin.createUser({ email: 'sam@example.com', tempPassword: TEMP_VALUE, role: 'user' })).resolves.toEqual(USER);
    await admin.createUser({ email: 'sam@example.com', role: 'admin' });
    expect(fake.functions.invoke.mock.calls.map((call) => call[1])).toEqual([
      { body: { action: 'createUser', email: 'sam@example.com', tempPassword: TEMP_VALUE, role: 'user' } },
      { body: { action: 'createUser', email: 'sam@example.com', role: 'admin' } },
    ]);
  });

  it('changes roles, bans and deletes', async () => {
    const { fake, admin } = setup();
    fake.functions.invoke.mockResolvedValueOnce(body({ ...USER, role: 'admin' }));
    await expect(admin.setRole('u2', 'admin')).resolves.toMatchObject({ role: 'admin' });
    fake.functions.invoke.mockResolvedValueOnce(body({ ...USER, banned: true }));
    await expect(admin.setBanned('u2', true)).resolves.toMatchObject({ banned: true });
    fake.functions.invoke.mockResolvedValueOnce(body(null));
    await expect(admin.deleteUser('u2')).resolves.toBeUndefined();
    expect(fake.functions.invoke.mock.calls.map((call) => call[1])).toEqual([
      { body: { action: 'setRole', id: 'u2', role: 'admin' } },
      { body: { action: 'setBanned', id: 'u2', banned: true } },
      { body: { action: 'deleteUser', id: 'u2' } },
    ]);
  });

  it('rejects with the ApiError of the function', async () => {
    const { fake, admin } = setup();
    fake.functions.invoke.mockResolvedValue({ data: { ok: false, error: { code: 'forbidden', message: 'Cannot demote yourself' } }, error: null });
    await expect(admin.setRole('u1', 'user')).rejects.toEqual({ code: 'forbidden', message: 'Cannot demote yourself' });
    await expect(admin.deleteUser('u1')).rejects.toMatchObject({ code: 'forbidden' });
  });
});
