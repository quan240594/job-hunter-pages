export type DataMode = 'mock' | 'supabase';

export type AppConfig =
  | { dataMode: 'mock' }
  | { dataMode: 'supabase'; supabaseUrl: string; supabaseAnonKey: string };

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; error: string };

/** The subset of import.meta.env this app reads. */
export interface RawEnv {
  VITE_DATA_MODE?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

function isAllowedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
  } catch {
    return false;
  }
}

function parseDataMode(raw: string | undefined): DataMode | null {
  const value = raw?.trim() ?? '';
  if (value === '') return 'supabase';
  if (value === 'mock' || value === 'supabase') return value;
  return null;
}

/** Validates the build-time environment. 'supabase' is the default; it needs a URL and an anon key. */
export function parseConfig(env: RawEnv): ConfigResult {
  const dataMode = parseDataMode(env.VITE_DATA_MODE);
  if (dataMode === null) {
    return { ok: false, error: `VITE_DATA_MODE must be 'mock' or 'supabase' (got '${env.VITE_DATA_MODE}').` };
  }
  if (dataMode === 'mock') return { ok: true, config: { dataMode } };

  const supabaseUrl = env.VITE_SUPABASE_URL?.trim() ?? '';
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
  const missing = [
    ...(supabaseUrl === '' ? ['VITE_SUPABASE_URL'] : []),
    ...(supabaseAnonKey === '' ? ['VITE_SUPABASE_ANON_KEY'] : []),
  ];
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Supabase mode needs ${missing.join(' and ')}. Set them at build time, or use VITE_DATA_MODE=mock.`,
    };
  }
  if (!isAllowedUrl(supabaseUrl)) {
    return { ok: false, error: 'VITE_SUPABASE_URL must be an https:// URL (http only for localhost).' };
  }
  return { ok: true, config: { dataMode, supabaseUrl, supabaseAnonKey } };
}

export function loadConfig(env: RawEnv = import.meta.env): ConfigResult {
  return parseConfig(env);
}
