// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { FAKE_SERVICE_KEY, FAKE_URL, fakeFetch, fakeIo, jsonResponse } from './__fixtures__/fakes.ts';
import { inviteUser, inviteUserMain, normalizeEmail, parseRole, setAdminRoleMain, setRole } from './userAdmin.ts';
import { SupabaseRequestError } from './supabaseAdmin.ts';
import type { AuthUser } from './supabaseAdmin.ts';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const EMAIL = 'alex@example.com';

function user(email: string, appMetadata: Record<string, unknown> = {}, id = USER_ID): AuthUser {
  return { id, email, appMetadata };
}

function fakeClient(pages: AuthUser[][]) {
  return {
    listAuthUsers: vi.fn((page: number) => Promise.resolve(pages[page - 1] ?? [])),
    updateAppMetadata: vi.fn(() => Promise.resolve()),
    inviteUser: vi.fn(() => Promise.resolve(user(EMAIL, { provider: 'email' }))),
  };
}

describe('normalizeEmail', () => {
  it('trims and lowercases a valid address', () => {
    expect(normalizeEmail('  Alex@Example.COM ')).toBe(EMAIL);
  });

  it.each(['', 'alex', 'alex@', '@example.com', 'a@b', 'a@.com', 'a@com.', 'a@b@example.com', 'a b@example.com', `${'a'.repeat(250)}@example.com`])(
    'rejects %j',
    (value) => {
      expect(() => normalizeEmail(value)).toThrow('not a valid email');
    },
  );
});

describe('parseRole', () => {
  it('defaults to user and accepts the two roles', () => {
    expect(parseRole(undefined)).toBe('user');
    expect(parseRole('  ')).toBe('user');
    expect(parseRole('Admin')).toBe('admin');
    expect(parseRole('user')).toBe('user');
  });

  it('rejects anything else', () => {
    expect(() => parseRole('root')).toThrow("'user' or 'admin'");
  });
});

describe('setRole', () => {
  it('sets the role and keeps the other app_metadata keys', async () => {
    const client = fakeClient([[user('other@example.com'), user(EMAIL, { provider: 'email' })]]);
    await setRole(client, ' ALEX@example.com ', 'admin');
    expect(client.updateAppMetadata).toHaveBeenCalledWith(USER_ID, { provider: 'email', role: 'admin' });
  });

  it('walks every page until the user is found', async () => {
    const full = Array.from({ length: 200 }, (_, index) => user(`u${index}@example.com`));
    const client = fakeClient([full, [user(EMAIL)]]);
    await setRole(client, EMAIL, 'admin');
    expect(client.listAuthUsers).toHaveBeenCalledTimes(2);
    expect(client.updateAppMetadata).toHaveBeenCalledOnce();
  });

  it('tells the operator to invite the user first when no account matches', async () => {
    const client = fakeClient([[user('someone@example.com'), { id: '3', email: undefined, appMetadata: {} }]]);
    await expect(setRole(client, EMAIL, 'admin')).rejects.toThrow('invite them first');
    expect(client.updateAppMetadata).not.toHaveBeenCalled();
  });
});

describe('inviteUser', () => {
  it('invites by email, flags the forced password change and sets the role', async () => {
    const client = fakeClient([]);
    await inviteUser(client, ' Alex@Example.com', 'admin');
    expect(client.inviteUser).toHaveBeenCalledWith(EMAIL, { must_change_password: true });
    expect(client.updateAppMetadata).toHaveBeenCalledWith(USER_ID, { provider: 'email', role: 'admin' });
  });

  it('reports an existing account without echoing the address', async () => {
    const client = fakeClient([]);
    client.inviteUser.mockRejectedValueOnce(new SupabaseRequestError('x', 422, 'email_exists'));
    const failure = inviteUser(client, EMAIL, 'user');
    await expect(failure).rejects.toThrow('already exists; nothing was changed');
    await expect(failure).rejects.not.toThrow(EMAIL);
    expect(client.updateAppMetadata).not.toHaveBeenCalled();
  });

  it('rethrows other failures', async () => {
    const client = fakeClient([]);
    client.inviteUser.mockRejectedValueOnce(new SupabaseRequestError('rate limited', 429, 'over_email_send_rate_limit'));
    await expect(inviteUser(client, EMAIL, 'user')).rejects.toThrow('rate limited');
    client.inviteUser.mockRejectedValueOnce(new Error('other'));
    await expect(inviteUser(client, EMAIL, 'user')).rejects.toThrow('other');
  });
});

describe('mains', () => {
  const env = { SUPABASE_URL: FAKE_URL, SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY, TARGET_EMAIL: EMAIL };

  it('require the three variables', async () => {
    const { io } = fakeIo({ env: { SUPABASE_URL: FAKE_URL } });
    await expect(setAdminRoleMain(io)).rejects.toThrow('SUPABASE_SERVICE_ROLE_KEY, TARGET_EMAIL');
    await expect(inviteUserMain(io)).rejects.toThrow('Missing required configuration');
  });

  it('set-admin-role grants the role through the admin API', async () => {
    const { fetchFn, calls } = fakeFetch((call) =>
      call.method === 'GET' ? jsonResponse(200, { users: [{ id: USER_ID, email: EMAIL }] }) : jsonResponse(200, {}),
    );
    const { io, logs } = fakeIo({ env, fetchFn });
    await setAdminRoleMain(io);
    expect(calls.map((call) => call.method)).toEqual(['GET', 'PUT']);
    expect(calls[1]?.body).toEqual({ app_metadata: { role: 'admin' } });
    expect(logs).toEqual(['Admin role granted.']);
  });

  it('invite-user invites with the requested role and prints no address or password', async () => {
    const { fetchFn, calls } = fakeFetch((call) => jsonResponse(200, call.method === 'POST' ? { id: USER_ID } : {}));
    const { io, logs } = fakeIo({ env: { ...env, TARGET_ROLE: 'admin' }, fetchFn });
    await inviteUserMain(io);
    expect(calls.map((call) => call.url.split('/').slice(-1)[0])).toEqual(['invite', USER_ID]);
    expect(logs).toEqual(['Invitation email sent (role: admin).']);
  });

  it('invite-user defaults to the user role', async () => {
    const { fetchFn } = fakeFetch((call) => jsonResponse(200, call.method === 'POST' ? { id: USER_ID } : {}));
    const { io, logs } = fakeIo({ env, fetchFn });
    await inviteUserMain(io);
    expect(logs).toEqual(['Invitation email sent (role: user).']);
  });
});
