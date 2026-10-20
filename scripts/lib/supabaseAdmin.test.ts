// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FAKE_SERVICE_KEY, FAKE_URL, fakeFetch, jsonResponse } from './__fixtures__/fakes.ts';
import { createAdminClient, SupabaseRequestError } from './supabaseAdmin.ts';
import type { Handler } from './__fixtures__/fakes.ts';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function clientWith(handler: Handler, url = FAKE_URL) {
  const { fetchFn, calls } = fakeFetch(handler);
  return { client: createAdminClient({ url, serviceRoleKey: FAKE_SERVICE_KEY, fetchFn }), calls };
}

async function failureOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected a rejection');
}

describe('createAdminClient', () => {
  it('accepts https and loopback http origins only', () => {
    const fetchFn = fakeFetch(() => jsonResponse(200)).fetchFn;
    const config = { serviceRoleKey: FAKE_SERVICE_KEY, fetchFn };
    expect(() => createAdminClient({ ...config, url: 'not a url' })).toThrow('not a valid URL');
    expect(() => createAdminClient({ ...config, url: 'http://example.test' })).toThrow('https://');
    expect(() => createAdminClient({ ...config, url: 'ftp://localhost' })).toThrow('https://');
    expect(() => createAdminClient({ ...config, url: 'http://localhost:54321' })).not.toThrow();
    expect(() => createAdminClient({ ...config, url: 'http://127.0.0.1:54321/' })).not.toThrow();
  });

  it('lists expired documents through the RPC with service credentials', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse(200, [{ id: DOC_ID, user_id: USER_ID, storage_path: `${USER_ID}/${DOC_ID}/cv.pdf` }]),
    );
    await expect(client.listExpiredDocuments()).resolves.toEqual([
      { id: DOC_ID, storagePath: `${USER_ID}/${DOC_ID}/cv.pdf` },
    ]);
    expect(calls[0]).toMatchObject({
      url: `${FAKE_URL}/rest/v1/rpc/expired_documents`,
      method: 'POST',
      body: {},
      headers: { apikey: FAKE_SERVICE_KEY, Authorization: `Bearer ${FAKE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
    });
  });

  it('rejects malformed RPC payloads', async () => {
    const notArray = clientWith(() => jsonResponse(200, { id: DOC_ID })).client;
    await expect(notArray.listExpiredDocuments()).rejects.toThrow('unexpected response');
    for (const row of [null, { id: 'not-a-uuid', storage_path: 'a/b' }, { id: DOC_ID, storage_path: '' }, { id: DOC_ID }]) {
      const bad = clientWith(() => jsonResponse(200, [row])).client;
      await expect(bad.listExpiredDocuments()).rejects.toThrow('unexpected response');
    }
  });

  it('removes storage objects with the prefixes body and counts the removed ones', async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, [{ name: 'a' }, { name: 'b' }]));
    await expect(client.removeStorageObjects(['a', 'b', 'c'])).resolves.toBe(2);
    expect(calls[0]).toMatchObject({
      url: `${FAKE_URL}/storage/v1/object/documents`,
      method: 'DELETE',
      body: { prefixes: ['a', 'b', 'c'] },
    });
    const empty = clientWith(() => jsonResponse(200)).client;
    await expect(empty.removeStorageObjects(['a'])).resolves.toBe(0);
  });

  it('deletes rows by id and counts the deleted ones', async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, [{ id: DOC_ID }]));
    await expect(client.deleteDocumentRows([DOC_ID, USER_ID])).resolves.toBe(1);
    expect(calls[0]?.url).toBe(`${FAKE_URL}/rest/v1/documents?id=in.(${DOC_ID},${USER_ID})&select=id`);
    expect(calls[0]?.headers.Prefer).toBe('return=representation');
    expect(calls[0]?.body).toBeUndefined();
    const none = clientWith(() => jsonResponse(204)).client;
    await expect(none.deleteDocumentRows([DOC_ID])).resolves.toBe(0);
  });

  it('refuses ids that are not uuids before sending anything', async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, []));
    await expect(client.deleteDocumentRows(['1),id=neq.(2'])).rejects.toThrow('invalid identifier');
    await expect(client.updateAppMetadata('../x', {})).rejects.toThrow('invalid identifier');
    expect(calls).toHaveLength(0);
  });

  it('lists auth users page by page', async () => {
    const { client, calls } = clientWith(() =>
      jsonResponse(200, { users: [{ id: USER_ID, email: 'alex@example.com', app_metadata: { role: 'user' } }, { id: DOC_ID }] }),
    );
    await expect(client.listAuthUsers(2, 50)).resolves.toEqual([
      { id: USER_ID, email: 'alex@example.com', appMetadata: { role: 'user' } },
      { id: DOC_ID, email: undefined, appMetadata: {} },
    ]);
    expect(calls[0]?.url).toBe(`${FAKE_URL}/auth/v1/admin/users?page=2&per_page=50`);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.headers['Content-Type']).toBeUndefined();
  });

  it('rejects malformed auth responses', async () => {
    const noUsers = clientWith(() => jsonResponse(200, {})).client;
    await expect(noUsers.listAuthUsers(1, 10)).rejects.toThrow('unexpected response');
    const badUser = clientWith(() => jsonResponse(200, { users: [{ email: 'x@example.com' }] })).client;
    await expect(badUser.listAuthUsers(1, 10)).rejects.toThrow('unexpected response');
    const emptyId = clientWith(() => jsonResponse(200, { id: '' })).client;
    await expect(emptyId.inviteUser('a@example.com', {})).rejects.toThrow('unexpected response');
  });

  it('updates app_metadata through the admin API', async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, { id: USER_ID }));
    await client.updateAppMetadata(USER_ID, { role: 'admin' });
    expect(calls[0]).toMatchObject({
      url: `${FAKE_URL}/auth/v1/admin/users/${USER_ID}`,
      method: 'PUT',
      body: { app_metadata: { role: 'admin' } },
    });
  });

  it('invites a user with user metadata', async () => {
    const { client, calls } = clientWith(() => jsonResponse(200, { id: USER_ID, email: 'a@example.com' }));
    await expect(client.inviteUser('a@example.com', { must_change_password: true })).resolves.toMatchObject({ id: USER_ID });
    expect(calls[0]).toMatchObject({
      url: `${FAKE_URL}/auth/v1/invite`,
      method: 'POST',
      body: { email: 'a@example.com', data: { must_change_password: true } },
    });
  });

  it('reports status and a safe error code, never the body', async () => {
    const withCode = clientWith(() => jsonResponse(422, { error_code: 'email_exists', msg: 'private@example.com exists' })).client;
    const error = await failureOf(withCode.inviteUser('private@example.com', {}));
    expect(error).toBeInstanceOf(SupabaseRequestError);
    expect(error.message).toBe('auth invite failed with HTTP 422 (email_exists)');
    expect(error).toMatchObject({ status: 422, code: 'email_exists' });
    expect(error.message).not.toContain('private@example.com');
  });

  it('falls back to code/error fields and ignores unsafe or missing codes', async () => {
    const pgrst = clientWith(() => jsonResponse(404, { code: 'PGRST202', message: 'detail' })).client;
    expect((await failureOf(pgrst.listExpiredDocuments())).message).toBe('expired_documents RPC failed with HTTP 404 (PGRST202)');
    const plain = clientWith(() => jsonResponse(400, { error: 'bad_request' })).client;
    expect((await failureOf(plain.listExpiredDocuments())).message).toContain('(bad_request)');
    const unsafe = clientWith(() => jsonResponse(400, { error: 'contains spaces and an address@example.com' })).client;
    expect((await failureOf(unsafe.listExpiredDocuments())).message).toBe('expired_documents RPC failed with HTTP 400');
    const notJson = clientWith(() => new Response('<html>', { status: 502 })).client;
    expect((await failureOf(notJson.listExpiredDocuments())).message).toBe('expired_documents RPC failed with HTTP 502');
    const arrayBody = clientWith(() => jsonResponse(500, [])).client;
    expect((await failureOf(arrayBody.listExpiredDocuments())).message).toBe('expired_documents RPC failed with HTTP 500');
  });

  it('wraps network failures without leaking the cause', async () => {
    const { client } = clientWith(() => Promise.reject(new Error('connect to fake-project.example.test failed')));
    const error = await failureOf(client.listExpiredDocuments());
    expect(error).toMatchObject({ message: 'expired_documents RPC: network error', status: 0 });
  });
});
