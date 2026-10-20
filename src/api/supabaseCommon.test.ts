import type { User } from '@supabase/supabase-js';
import { createFakeSupabase } from './__fixtures__/fakeSupabase';
import { currentUserId, foundOrThrow, guarded, orThrow, rowsOf, toSession } from './supabaseCommon';

describe('orThrow', () => {
  it('returns the data or throws the mapped error', () => {
    expect(orThrow({ data: [1], error: null })).toEqual([1]);
    expect(() => orThrow({ data: null, error: { code: '42501', message: 'rls' } })).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
  });
});

describe('rowsOf / foundOrThrow', () => {
  it('accepts arrays only', () => {
    expect(rowsOf([1, 2])).toEqual([1, 2]);
    expect(() => rowsOf(null)).toThrow(expect.objectContaining({ code: 'unknown' }));
    expect(() => rowsOf({})).toThrow(expect.objectContaining({ code: 'unknown' }));
  });

  it('turns null into not_found', () => {
    expect(foundOrThrow({ a: 1 }, 'Job')).toEqual({ a: 1 });
    expect(() => foundOrThrow(null, 'Job')).toThrow(expect.objectContaining({ code: 'not_found', message: 'Job not found.' }));
  });
});

describe('guarded', () => {
  it('passes results and ApiErrors through and maps everything else', async () => {
    await expect(guarded((a: number) => Promise.resolve(a + 1))(1)).resolves.toBe(2);
    await expect(guarded(() => Promise.reject({ code: 'conflict', message: 'x' }))()).rejects.toEqual({ code: 'conflict', message: 'x' });
    await expect(guarded(() => Promise.reject(new TypeError('Failed to fetch')))()).rejects.toEqual({ code: 'network', message: 'Failed to fetch' });
  });
});

describe('currentUserId', () => {
  it('returns the id of the stored session', async () => {
    const fake = createFakeSupabase();
    await expect(currentUserId(fake.client)).resolves.toBe('u1');
  });

  it('rejects without a session or on an auth error', async () => {
    const fake = createFakeSupabase();
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(currentUserId(fake.client)).rejects.toEqual({ code: 'unauthenticated', message: 'You are not signed in.' });
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: { status: 401, message: 'bad' } });
    await expect(currentUserId(fake.client)).rejects.toMatchObject({ code: 'unauthenticated', message: 'bad' });
  });
});

describe('toSession', () => {
  const user = (extra: Partial<User>): User => ({ id: 'u1', email: 'alex@example.com', ...extra }) as User;

  it('reads the role from app_metadata and the flag from user_metadata', () => {
    expect(toSession(user({ app_metadata: { role: 'admin' }, user_metadata: { must_change_password: true } }))).toEqual({
      userId: 'u1',
      email: 'alex@example.com',
      role: 'admin',
      mustChangePassword: true,
    });
  });

  it('defaults to a regular user without a flag', () => {
    expect(toSession(user({ app_metadata: { role: 'owner' }, user_metadata: { must_change_password: 'yes' } }))).toMatchObject({
      role: 'user',
      mustChangePassword: false,
    });
    expect(toSession(user({ email: undefined }))).toEqual({ userId: 'u1', email: '', role: 'user', mustChangePassword: false });
  });
});
