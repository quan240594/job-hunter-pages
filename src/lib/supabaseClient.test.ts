import { createClient } from '@supabase/supabase-js';
import { createSupabaseClient } from './supabaseClient';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ marker: 'client' })) }));

describe('createSupabaseClient', () => {
  it('creates a persistent PKCE client from the url and anon key', () => {
    const client = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: 'anon-placeholder' });
    expect(client).toEqual({ marker: 'client' });
    expect(createClient).toHaveBeenCalledWith('https://abc.supabase.co', 'anon-placeholder', {
      auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce', detectSessionInUrl: true },
    });
  });
});
