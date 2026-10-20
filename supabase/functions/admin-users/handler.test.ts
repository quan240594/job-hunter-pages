// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import type { AdminAction as ContractAction, AdminResponse as ContractResponse } from '../../../src/api/types.ts';
import type { AdminAction, AdminResponse } from './contract.ts';
import { FakeAdmin, NOW, ORIGIN, makeUser, uuid } from './__fixtures__/fakeAdmin.ts';
import {
  DEFAULT_ALLOWED_ORIGINS,
  MIN_PASSWORD_LENGTH,
  createHandler,
  resolveAllowedOrigins,
  type AdminClient,
} from './handler.ts';

interface SendOptions {
  token?: string | null;
  method?: string;
  origin?: string;
  raw?: string;
  authorization?: string;
}

interface Reply {
  status: number;
  body: { ok: boolean; data?: unknown; error?: { code: string; message: string } };
  headers: Headers;
}

let fake: FakeAdmin;
let logs: string[];
let send: (body: unknown, options?: SendOptions) => Promise<Reply>;
let admin: ReturnType<typeof makeUser>;
let member: ReturnType<typeof makeUser>;

beforeEach(() => {
  fake = new FakeAdmin();
  logs = [];
  admin = fake.addUser(makeUser({ email: 'admin@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z' }), 'admin-token');
  member = fake.addUser(makeUser({ email: 'member@example.com', created_at: '2026-02-01T00:00:00Z' }), 'member-token');
  const handler = createHandler({
    admin: fake.client(),
    now: () => NOW,
    allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
    logError: (message) => logs.push(message),
  });
  send = async (body, options = {}) => {
    const { token = 'admin-token', method = 'POST', origin, raw, authorization } = options;
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (origin) {
      headers.set('Origin', origin);
    }
    if (authorization !== undefined) {
      headers.set('Authorization', authorization);
    } else if (token !== null) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const init: RequestInit = { method, headers };
    if (method === 'POST') {
      init.body = raw ?? JSON.stringify(body);
    }
    const response = await handler(new Request('http://localhost/functions/v1/admin-users', init));
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : {}, headers: response.headers };
  };
});

const failure = (reply: Reply) => ({ status: reply.status, code: reply.body.error?.code });

describe('contract compatibility (compile-time)', () => {
  it('mirrors the shared contract and accepts the real Supabase client', () => {
    expectTypeOf<AdminAction>().toExtend<ContractAction>();
    expectTypeOf<ContractAction>().toExtend<AdminAction>();
    expectTypeOf<AdminResponse<unknown>>().toExtend<ContractResponse<unknown>>();
    expectTypeOf<SupabaseClient>().toExtend<AdminClient>();
    expect(typeof createHandler).toBe('function');
  });
});

describe('transport', () => {
  it('answers preflight requests only for allowed origins', async () => {
    const allowed = await send(undefined, { method: 'OPTIONS', origin: ORIGIN, token: null });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(allowed.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    const denied = await send(undefined, { method: 'OPTIONS', origin: 'https://evil.example', token: null });
    expect(denied.status).toBe(204);
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    const none = await send(undefined, { method: 'OPTIONS', token: null });
    expect(none.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('adds CORS headers to responses of allowed origins and never uses a wildcard', async () => {
    const allowed = await send({ action: 'listUsers' }, { origin: 'http://localhost:5173' });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(allowed.headers.get('vary')).toBe('Origin');
    expect(allowed.headers.get('cache-control')).toBe('no-store');
    const denied = await send({ action: 'listUsers' }, { origin: 'https://evil.example' });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('only accepts POST', async () => {
    expect(failure(await send(undefined, { method: 'GET' }))).toEqual({ status: 400, code: 'validation' });
  });

  it.each([
    ['not valid JSON', '{nope'],
    ['a JSON array', '[]'],
    ['a JSON scalar', '7'],
    ['null', 'null'],
    ['too large', JSON.stringify({ action: 'listUsers', pad: 'x'.repeat(5000) })],
  ])('rejects a body that is %s', async (_label, raw) => {
    expect(failure(await send(undefined, { raw }))).toEqual({ status: 400, code: 'validation' });
  });

  it.each([{}, { action: 'explode' }, { action: 7 }])('rejects the unknown action %j', async (body) => {
    expect(failure(await send(body))).toEqual({ status: 400, code: 'validation' });
  });

  it('turns unexpected exceptions into a generic 500 without leaking details', async () => {
    fake.throwOn.set('getUser', new TypeError('connection string with secret'));
    const reply = await send({ action: 'listUsers' });
    expect(reply.status).toBe(500);
    expect(reply.body).toEqual({ ok: false, error: { code: 'unknown', message: 'Unexpected error' } });
    expect(logs).toEqual(['admin-users failed: TypeError']);
    fake.throwOn.set('getUser', 'plain string');
    await send({ action: 'listUsers' });
    expect(logs.at(-1)).toBe('admin-users failed: non-error thrown');
  });
});

describe('authentication', () => {
  it.each([
    ['no header', { token: null }],
    ['another scheme', { authorization: 'Basic abc' }],
    ['no token', { authorization: 'Bearer' }],
    ['extra parts', { authorization: 'Bearer a b' }],
    ['empty token', { authorization: 'Bearer ' }],
    ['an oversized token', { authorization: `Bearer ${'a'.repeat(9000)}` }],
    ['an unknown token', { token: 'nope' }],
  ])('rejects a request with %s', async (_label, options) => {
    expect(failure(await send({ action: 'listUsers' }, options))).toEqual({ status: 401, code: 'unauthenticated' });
  });

  it('accepts the bearer scheme in any case', async () => {
    expect((await send({ action: 'listUsers' }, { authorization: 'bearer admin-token' })).status).toBe(200);
  });

  it('rejects a token whose user record cannot be loaded', async () => {
    fake.nullUserFrom.set('getUser', 1);
    expect(failure(await send({ action: 'listUsers' }))).toEqual({ status: 401, code: 'unauthenticated' });
    fake.nullUserFrom.clear();
    fake.nullUserFrom.set('getUserById', 1);
    expect(failure(await send({ action: 'listUsers' }))).toEqual({ status: 401, code: 'unauthenticated' });
    fake.nullUserFrom.clear();
    fake.users.delete(admin.id);
    fake.tokens.set('stale-token', admin.id);
    expect(failure(await send({ action: 'listUsers' }, { token: 'stale-token' }))).toEqual({
      status: 401,
      code: 'unauthenticated',
    });
  });

  it('rejects a token whose user is deleted between verification and lookup', async () => {
    fake.users.set(admin.id, admin);
    fake.failures.set('getUserById', { code: 'user_not_found', message: 'gone' });
    expect(failure(await send({ action: 'listUsers' }))).toEqual({ status: 401, code: 'unauthenticated' });
  });

  it('refuses a banned caller even with a valid token', async () => {
    admin.banned_until = '2999-01-01T00:00:00Z';
    expect(failure(await send({ action: 'listUsers' }))).toEqual({ status: 403, code: 'forbidden' });
  });

  it('treats an expired ban as lifted', async () => {
    admin.banned_until = '2020-01-01T00:00:00Z';
    expect((await send({ action: 'listUsers' })).status).toBe(200);
  });

  it('re-reads the role from the user record, so a demoted admin loses access at once', async () => {
    admin.app_metadata = { role: 'user' };
    expect(failure(await send({ action: 'listUsers' }))).toEqual({ status: 403, code: 'forbidden' });
  });

  it.each([
    { action: 'listUsers' },
    { action: 'createUser', email: 'new@example.com', role: 'user' },
    { action: 'setRole', id: uuid(), role: 'admin' },
    { action: 'setBanned', id: uuid(), banned: true },
    { action: 'deleteUser', id: uuid() },
  ])('requires the admin role for %j', async (body) => {
    expect(failure(await send(body, { token: 'member-token' }))).toEqual({ status: 403, code: 'forbidden' });
    expect(fake.calls).not.toContain('createUser');
  });
});

describe('listUsers', () => {
  it('returns account metadata ordered by creation date', async () => {
    fake.addUser(
      makeUser({
        email: 'banned@example.com',
        banned_until: '2999-01-01T00:00:00Z',
        last_sign_in_at: '2026-03-01T00:00:00Z',
        created_at: '2026-03-01T00:00:00Z',
      }),
    );
    fake.addUser(makeUser({ email: undefined, created_at: '2025-12-01T00:00:00Z' }));
    const reply = await send({ action: 'listUsers' });
    expect(reply.status).toBe(200);
    const data = reply.body.data as { email: string; role: string; banned: boolean; lastSignInAt: string | null }[];
    expect(data.map((user) => user.email)).toEqual(['', 'admin@example.com', 'member@example.com', 'banned@example.com']);
    expect(data[1]).toMatchObject({ id: admin.id, role: 'admin', banned: false, lastSignInAt: null, createdAt: '2026-01-01T00:00:00Z' });
    expect(data[3]).toMatchObject({ role: 'user', banned: true, lastSignInAt: '2026-03-01T00:00:00Z' });
  });

  it('breaks ties on the id and reads every page', async () => {
    for (let i = 0; i < 1000; i++) {
      fake.addUser(makeUser({ created_at: '2026-06-01T00:00:00Z' }));
    }
    const reply = await send({ action: 'listUsers' });
    const data = reply.body.data as { id: string; createdAt: string }[];
    expect(data).toHaveLength(1002);
    expect(fake.listPages).toEqual([1, 2]);
    const tied = data.filter((user) => user.createdAt === '2026-06-01T00:00:00Z').map((user) => user.id);
    expect(tied).toEqual(tied.toSorted((a, b) => a.localeCompare(b)));
  });

  it('maps backend failures to a generic error', async () => {
    fake.failures.set('listUsers', { message: 'database is on fire' });
    expect(await send({ action: 'listUsers' })).toMatchObject({
      status: 500,
      body: { error: { code: 'unknown', message: 'The request could not be completed' } },
    });
  });
});

describe('createUser', () => {
  const password = 'a-long-enough-pass';

  it('creates a confirmed user that must change the password at first login', async () => {
    const reply = await send({ action: 'createUser', email: '  New@Example.com ', tempPassword: password, role: 'admin' });
    expect(reply.status).toBe(200);
    expect(reply.body.data).toMatchObject({ email: 'new@example.com', role: 'admin', banned: false, lastSignInAt: null });
    expect(fake.createdWith).toEqual([
      {
        email: 'new@example.com',
        password,
        email_confirm: true,
        app_metadata: { role: 'admin' },
        user_metadata: { must_change_password: true },
      },
    ]);
    expect(JSON.stringify(reply.body)).not.toContain(password);
    expect(logs).toEqual([]);
  });

  it('invites by email when there is no temporary password and stores the role in app_metadata', async () => {
    const reply = await send({ action: 'createUser', email: 'invitee@example.com', role: 'admin' });
    expect(reply.body.data).toMatchObject({ email: 'invitee@example.com', role: 'admin' });
    expect(fake.inviteMetadata).toEqual([{ data: { must_change_password: true } }]);
    expect(fake.updatedWith).toEqual([{ app_metadata: { role: 'admin' } }]);
    expect(fake.calls).not.toContain('createUser');
  });

  it('answers 409 for an existing email, for both flows', async () => {
    const withPassword = await send({ action: 'createUser', email: member.email, tempPassword: password, role: 'user' });
    expect(failure(withPassword)).toEqual({ status: 409, code: 'conflict' });
    const invite = await send({ action: 'createUser', email: member.email, role: 'user' });
    expect(failure(invite)).toEqual({ status: 409, code: 'conflict' });
  });

  it('passes weak-password rejections on as validation errors', async () => {
    fake.failures.set('createUser', { code: 'weak_password', message: 'Password is too weak' });
    const reply = await send({ action: 'createUser', email: 'x@example.com', tempPassword: password, role: 'user' });
    expect(reply.body.error).toEqual({ code: 'validation', message: 'Password is too weak' });
  });

  it('reports a missing user in the Auth answer as not_found', async () => {
    fake.nullUserFrom.set('createUser', 1);
    const reply = await send({ action: 'createUser', email: 'x@example.com', tempPassword: password, role: 'user' });
    expect(failure(reply)).toEqual({ status: 404, code: 'not_found' });
    fake.nullUserFrom.clear();
    fake.nullUserFrom.set('inviteUserByEmail', 1);
    expect(failure(await send({ action: 'createUser', email: 'y@example.com', role: 'user' }))).toEqual({
      status: 404,
      code: 'not_found',
    });
  });

  it('removes the half-created account when setting the role of an invitee fails', async () => {
    fake.failures.set('updateUserById', { message: 'boom' });
    const reply = await send({ action: 'createUser', email: 'half@example.com', role: 'admin' });
    expect(failure(reply)).toEqual({ status: 500, code: 'unknown' });
    expect(fake.calls).toContain('deleteUser');
    expect([...fake.users.values()].some((user) => user.email === 'half@example.com')).toBe(false);
  });

  it('removes the half-created account when the role update returns no user', async () => {
    fake.nullUserFrom.set('updateUserById', 1);
    const reply = await send({ action: 'createUser', email: 'half@example.com', role: 'user' });
    expect(reply.body.error).toEqual({ code: 'unknown', message: 'The invitation failed' });
    expect(fake.calls).toContain('deleteUser');
  });

  it.each([
    ['a missing email', { role: 'user' }],
    ['a non-string email', { email: 5, role: 'user' }],
    ['an email without @', { email: 'nobody', role: 'user' }],
    ['an email starting with @', { email: '@example.com', role: 'user' }],
    ['an email with two @', { email: 'a@b@example.com', role: 'user' }],
    ['an email with whitespace', { email: 'a b@example.com', role: 'user' }],
    ['a domain without a dot', { email: 'a@localhost', role: 'user' }],
    ['a domain starting with a dot', { email: 'a@.example.com', role: 'user' }],
    ['a domain ending with a dot', { email: 'a@example.com.', role: 'user' }],
    ['a domain with consecutive dots', { email: 'a@example..com', role: 'user' }],
    ['an over-long email', { email: `${'a'.repeat(250)}@example.com`, role: 'user' }],
    ['a missing role', { email: 'a@example.com' }],
    ['an unknown role', { email: 'a@example.com', role: 'owner' }],
    ['a null temporary password', { email: 'a@example.com', role: 'user', tempPassword: null }],
    ['a numeric temporary password', { email: 'a@example.com', role: 'user', tempPassword: 123456789012 }],
    ['a short temporary password', { email: 'a@example.com', role: 'user', tempPassword: 'x'.repeat(MIN_PASSWORD_LENGTH - 1) }],
    ['a too long temporary password', { email: 'a@example.com', role: 'user', tempPassword: 'x'.repeat(73) }],
  ])('rejects %s', async (_label, fields) => {
    const reply = await send({ action: 'createUser', ...fields });
    expect(failure(reply)).toEqual({ status: 400, code: 'validation' });
    expect(fake.calls).not.toContain('createUser');
    expect(fake.calls).not.toContain('inviteUserByEmail');
  });
});

describe('setRole', () => {
  it('promotes and demotes other users', async () => {
    const promoted = await send({ action: 'setRole', id: member.id, role: 'admin' });
    expect(promoted.body.data).toMatchObject({ id: member.id, role: 'admin' });
    expect(fake.updatedWith).toEqual([{ app_metadata: { role: 'admin' } }]);
    const demoted = await send({ action: 'setRole', id: member.id, role: 'user' });
    expect(demoted.body.data).toMatchObject({ role: 'user' });
  });

  it('refuses to demote the caller but accepts a no-op promotion', async () => {
    expect(failure(await send({ action: 'setRole', id: admin.id, role: 'user' }))).toEqual({ status: 403, code: 'forbidden' });
    expect((await send({ action: 'setRole', id: admin.id, role: 'admin' })).status).toBe(200);
  });

  it('can demote another admin, also when that admin is banned', async () => {
    const other = fake.addUser(makeUser({ role: 'admin' }));
    expect((await send({ action: 'setRole', id: other.id, role: 'user' })).status).toBe(200);
    const banned = fake.addUser(makeUser({ role: 'admin', banned_until: '2999-01-01T00:00:00Z' }));
    expect((await send({ action: 'setRole', id: banned.id, role: 'user' })).status).toBe(200);
  });

  it('answers 404 for unknown users and for an empty answer', async () => {
    expect(failure(await send({ action: 'setRole', id: uuid(), role: 'user' }))).toEqual({ status: 404, code: 'not_found' });
    fake.nullUserFrom.set('getUserById', 4);
    expect(failure(await send({ action: 'setRole', id: member.id, role: 'user' }))).toEqual({ status: 404, code: 'not_found' });
  });

  it.each([
    ['a malformed id', { id: 'not-a-uuid', role: 'user' }],
    ['a non-string id', { id: 7, role: 'user' }],
    ['a missing role', { id: uuid() }],
  ])('rejects %s', async (_label, fields) => {
    expect(failure(await send({ action: 'setRole', ...fields }))).toEqual({ status: 400, code: 'validation' });
  });
});

describe('setBanned', () => {
  it('bans for 876000 hours and lifts the ban with "none"', async () => {
    const banned = await send({ action: 'setBanned', id: member.id, banned: true });
    expect(banned.body.data).toMatchObject({ id: member.id, banned: true });
    const lifted = await send({ action: 'setBanned', id: member.id, banned: false });
    expect(lifted.body.data).toMatchObject({ banned: false });
    expect(fake.updatedWith).toEqual([{ ban_duration: '876000h' }, { ban_duration: 'none' }]);
  });

  it('refuses to ban the caller but allows lifting a ban on oneself', async () => {
    expect(failure(await send({ action: 'setBanned', id: admin.id, banned: true }))).toEqual({ status: 403, code: 'forbidden' });
    expect((await send({ action: 'setBanned', id: admin.id, banned: false })).status).toBe(200);
  });

  it('can ban another admin while the caller stays an active admin', async () => {
    const other = fake.addUser(makeUser({ role: 'admin' }));
    expect((await send({ action: 'setBanned', id: other.id, banned: true })).status).toBe(200);
  });

  it.each([
    ['a non-boolean flag', { id: uuid(), banned: 'yes' }],
    ['a missing id', { banned: true }],
  ])('rejects %s', async (_label, fields) => {
    expect(failure(await send({ action: 'setBanned', ...fields }))).toEqual({ status: 400, code: 'validation' });
  });
});

describe('deleteUser and deleteSelf', () => {
  it('removes the storage objects first, then the auth user, and leaves other users alone', async () => {
    fake.addObjects(`${member.id}/doc-1/cv.pdf`, `${member.id}/doc-2/letter.pdf`, `${member.id}/readme.pdf`, `${admin.id}/doc-9/cv.pdf`);
    const reply = await send({ action: 'deleteUser', id: member.id });
    expect(reply.body).toEqual({ ok: true, data: null });
    expect(fake.objects.map((o) => o.path)).toEqual([`${admin.id}/doc-9/cv.pdf`]);
    expect(fake.users.has(member.id)).toBe(false);
    expect(fake.calls.indexOf('remove')).toBeLessThan(fake.calls.indexOf('deleteUser'));
    expect(new Set(fake.buckets)).toEqual(new Set(['documents']));
  });

  it('pages through large folders and removes the objects in chunks', async () => {
    const paths = Array.from({ length: 250 }, (_, i) => `${member.id}/doc-${i}/file.pdf`);
    fake.addObjects(...paths);
    await send({ action: 'deleteUser', id: member.id });
    expect(fake.calls.filter((call) => call === 'remove')).toHaveLength(3);
    expect(fake.objects).toEqual([]);
  });

  it('skips the storage removal when there is nothing to remove', async () => {
    await send({ action: 'deleteUser', id: member.id });
    expect(fake.calls).not.toContain('remove');
    expect(fake.users.has(member.id)).toBe(false);
  });

  it('treats an empty listing answer as no objects', async () => {
    fake.nullUserFrom.set('list', 1);
    expect((await send({ action: 'deleteUser', id: member.id })).status).toBe(200);
  });

  it('keeps the account when the storage cleanup fails so the request can be retried', async () => {
    fake.addObjects(`${member.id}/doc-1/cv.pdf`);
    fake.failures.set('remove', { message: 'storage down' });
    expect(failure(await send({ action: 'deleteUser', id: member.id }))).toEqual({ status: 500, code: 'unknown' });
    fake.failures.delete('remove');
    fake.failures.set('list', { message: 'storage down' });
    expect(failure(await send({ action: 'deleteUser', id: member.id }))).toEqual({ status: 500, code: 'unknown' });
    expect(fake.users.has(member.id)).toBe(true);
  });

  it('reports a failing auth deletion', async () => {
    fake.failures.set('deleteUser', { message: 'nope' });
    expect(failure(await send({ action: 'deleteUser', id: member.id }))).toEqual({ status: 500, code: 'unknown' });
  });

  it('refuses to delete the caller through deleteUser and answers 404 for unknown ids', async () => {
    expect(failure(await send({ action: 'deleteUser', id: admin.id }))).toEqual({ status: 403, code: 'forbidden' });
    expect(failure(await send({ action: 'deleteUser', id: uuid() }))).toEqual({ status: 404, code: 'not_found' });
    expect(fake.users.has(admin.id)).toBe(true);
  });

  it('can delete another admin', async () => {
    const other = fake.addUser(makeUser({ role: 'admin' }));
    expect((await send({ action: 'deleteUser', id: other.id })).status).toBe(200);
  });

  it('lets any signed-in user delete their own account', async () => {
    fake.addObjects(`${member.id}/doc-1/cv.pdf`);
    const reply = await send({ action: 'deleteSelf' }, { token: 'member-token' });
    expect(reply.body).toEqual({ ok: true, data: null });
    expect(fake.users.has(member.id)).toBe(false);
    expect(fake.objects).toEqual([]);
  });

  it('lets an admin delete themselves while another active admin remains', async () => {
    fake.addUser(makeUser({ role: 'admin' }));
    expect((await send({ action: 'deleteSelf' })).status).toBe(200);
    expect(fake.users.has(admin.id)).toBe(false);
  });

  it('never deletes the last admin, banned admins do not count', async () => {
    fake.addUser(makeUser({ role: 'admin', banned_until: '2999-01-01T00:00:00Z' }));
    expect(failure(await send({ action: 'deleteSelf' }))).toEqual({ status: 403, code: 'forbidden' });
    expect(fake.users.has(admin.id)).toBe(true);
    expect(fake.calls).not.toContain('deleteUser');
  });

  it('rejects a malformed id', async () => {
    expect(failure(await send({ action: 'deleteUser', id: 'x' }))).toEqual({ status: 400, code: 'validation' });
  });
});

describe('resolveAllowedOrigins', () => {
  it('returns the defaults when there are no extras', () => {
    expect(resolveAllowedOrigins(undefined)).toEqual([...DEFAULT_ALLOWED_ORIGINS]);
  });

  it('adds normalised https origins and loopback http, dropping everything else', () => {
    const origins = resolveAllowedOrigins(
      ' https://jobs.example.com/app , http://example.com, *, not a url, http://localhost:3000, https://quan240594.github.io/x ',
    );
    expect(origins).toEqual([...DEFAULT_ALLOWED_ORIGINS, 'https://jobs.example.com', 'http://localhost:3000']);
  });
});
