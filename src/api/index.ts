import type { AppConfig } from '../config';
import type { DataApi } from './dataApi';

export type { DataApi } from './dataApi';
export type * from './types';

/** Picks the implementation by config. Loaded lazily, so a production build never fetches the mock chunk. */
export async function createDataApi(config: AppConfig): Promise<DataApi> {
  if (config.dataMode === 'mock') {
    const { createMockApi } = await import('./mockApi');
    return createMockApi();
  }
  const { createSupabaseApi } = await import('./supabaseApi');
  return createSupabaseApi({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey });
}
