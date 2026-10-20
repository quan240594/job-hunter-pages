import { createDataApi } from './index';
import { createSupabaseApi } from './supabaseApi';

vi.mock('./supabaseApi', () => ({ createSupabaseApi: vi.fn(() => ({ marker: 'supabase' })) }));

describe('createDataApi', () => {
  it('returns the in-memory implementation in mock mode', async () => {
    const api = await createDataApi({ dataMode: 'mock' });
    await expect(api.auth.getSession()).resolves.toBeNull();
    await expect(api.auth.signIn('alex@example.com', 'any')).resolves.toMatchObject({ email: 'alex@example.com', role: 'user' });
    await expect(api.jobs.list()).resolves.not.toHaveLength(0);
    expect(createSupabaseApi).not.toHaveBeenCalled();
  });

  it('returns the supabase implementation in supabase mode', async () => {
    const api = await createDataApi({ dataMode: 'supabase', supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'anon-placeholder' });
    expect(api).toEqual({ marker: 'supabase' });
    expect(createSupabaseApi).toHaveBeenCalledWith({ url: 'https://abc.supabase.co', anonKey: 'anon-placeholder' });
  });
});
