import { createFakeSupabase, ok } from './__fixtures__/fakeSupabase';
import { APPLICATION_ROW, DOCUMENT_ROW, JOB_ROW, PROFILE_ROW } from './__fixtures__/rows';
import { createSupabaseApi } from './supabaseApi';

const createSupabaseClient = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabaseClient', () => ({ createSupabaseClient }));

describe('createSupabaseApi', () => {
  it('builds the client from url and anon key unless one is injected', () => {
    const fake = createFakeSupabase();
    createSupabaseClient.mockReturnValueOnce(fake.client);
    const api = createSupabaseApi({ url: 'https://abc.supabase.co', anonKey: 'anon-placeholder' });
    expect(createSupabaseClient).toHaveBeenCalledWith({ url: 'https://abc.supabase.co', anonKey: 'anon-placeholder' });
    expect(Object.keys(api)).toEqual(['auth', 'jobs', 'applications', 'profile', 'documents', 'admin']);
  });

  it('consumes an invite link once, before the first getSession', async () => {
    const fake = createFakeSupabase();
    const replace = vi.fn();
    const api = createSupabaseApi({
      url: 'https://abc.supabase.co',
      anonKey: 'anon-placeholder',
      client: fake.client,
      authLinkEnv: { href: () => 'https://user.github.io/job-hunter-pages/?token_hash=h&type=invite#/login', replace },
    });
    await api.auth.getSession();
    await api.auth.getSession();
    expect(fake.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(fake.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'h', type: 'invite' });
    expect(replace).toHaveBeenCalledWith('https://user.github.io/job-hunter-pages/#/login');
  });

  it('uses the browser location and crypto.randomUUID by default', async () => {
    const fake = createFakeSupabase();
    const api = createSupabaseApi({ url: 'https://abc.supabase.co', anonKey: 'anon-placeholder', client: fake.client });
    await api.auth.getSession();
    expect(fake.auth.verifyOtp).not.toHaveBeenCalled();
    fake.respond(ok({ ...DOCUMENT_ROW }));
    await api.documents.upload(new File(['x'], 'cv.pdf', { type: 'application/pdf' }), { kind: 'cv' });
    const calls = fake.storageBucket.upload.mock.calls as unknown as [string][];
    expect(calls[0][0]).toMatch(/^u1\/[0-9a-f-]{36}\/cv\.pdf$/);
  });

  it('exports profile, jobs, applications and document metadata', async () => {
    const fake = createFakeSupabase();
    const api = createSupabaseApi({ url: 'https://abc.supabase.co', anonKey: 'anon-placeholder', client: fake.client, newId: () => 'id' });
    fake.respond(ok(PROFILE_ROW), ok([JOB_ROW]), ok([APPLICATION_ROW]), ok([DOCUMENT_ROW]));
    const data = JSON.parse(await (await api.auth.exportMyData()).text()) as Record<string, unknown>;
    expect(Object.keys(data)).toEqual(['profile', 'jobs', 'applications', 'documents']);
    expect(data.profile).toMatchObject({ userId: 'u1', displayName: 'Alex Example' });
    expect(data.jobs).toMatchObject([{ id: 'abcdef0123456789' }]);
    expect(data.applications).toMatchObject([{ id: 'a1' }]);
    expect(data.documents).toMatchObject([{ id: 'd1', storagePath: 'u1/d1/cv.pdf' }]);
  });
});
