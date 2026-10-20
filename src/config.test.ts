import { loadConfig, parseConfig } from './config';

const URL_VALUE = 'https://abc.supabase.co';
const KEY_VALUE = 'public-anon-placeholder';

describe('parseConfig', () => {
  it('defaults to supabase mode and needs url and key', () => {
    const result = parseConfig({});
    expect(result).toEqual({
      ok: false,
      error: 'Supabase mode needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Set them at build time, or use VITE_DATA_MODE=mock.',
    });
  });

  it('treats a blank mode as supabase and reports only the missing variable', () => {
    const result = parseConfig({ VITE_DATA_MODE: '  ', VITE_SUPABASE_URL: URL_VALUE });
    expect(result).toEqual({
      ok: false,
      error: 'Supabase mode needs VITE_SUPABASE_ANON_KEY. Set them at build time, or use VITE_DATA_MODE=mock.',
    });
  });

  it('reports a missing url on its own', () => {
    const result = parseConfig({ VITE_DATA_MODE: 'supabase', VITE_SUPABASE_ANON_KEY: KEY_VALUE });
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toContain('needs VITE_SUPABASE_URL.');
  });

  it('accepts mock mode without any backend settings', () => {
    expect(parseConfig({ VITE_DATA_MODE: 'mock' })).toEqual({ ok: true, config: { dataMode: 'mock' } });
  });

  it('accepts a full supabase configuration and trims values', () => {
    const result = parseConfig({
      VITE_DATA_MODE: 'supabase',
      VITE_SUPABASE_URL: ` ${URL_VALUE} `,
      VITE_SUPABASE_ANON_KEY: ` ${KEY_VALUE} `,
    });
    expect(result).toEqual({
      ok: true,
      config: { dataMode: 'supabase', supabaseUrl: URL_VALUE, supabaseAnonKey: KEY_VALUE },
    });
  });

  it('accepts a loopback http url', () => {
    const result = parseConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: KEY_VALUE });
    expect(result.ok).toBe(true);
  });

  it.each(['http://example.com', 'ftp://localhost', 'not a url'])('rejects the url %s', (value) => {
    const result = parseConfig({ VITE_SUPABASE_URL: value, VITE_SUPABASE_ANON_KEY: KEY_VALUE });
    expect(result).toEqual({
      ok: false,
      error: 'VITE_SUPABASE_URL must be an https:// URL (http only for localhost).',
    });
  });

  it('rejects an unknown mode', () => {
    expect(parseConfig({ VITE_DATA_MODE: 'demo' })).toEqual({
      ok: false,
      error: "VITE_DATA_MODE must be 'mock' or 'supabase' (got 'demo').",
    });
  });
});

describe('loadConfig', () => {
  it('uses the given env', () => {
    expect(loadConfig({ VITE_DATA_MODE: 'mock' })).toEqual({ ok: true, config: { dataMode: 'mock' } });
  });

  it('defaults to import.meta.env', () => {
    vi.stubEnv('VITE_DATA_MODE', 'mock');
    expect(loadConfig()).toEqual({ ok: true, config: { dataMode: 'mock' } });
    vi.unstubAllEnvs();
  });
});
