import type { AuthApi, DataApi } from '../api/dataApi';
import type { ApiError, Session } from '../api/types';

export const ALEX: Session = { userId: 'user-alex', email: 'alex@example.com', role: 'user', mustChangePassword: false };
export const ADMIN: Session = { userId: 'user-admin', email: 'admin@example.com', role: 'admin', mustChangePassword: false };

const UNAVAILABLE: ApiError = { code: 'unknown', message: 'not implemented' };
const unavailable = (): Promise<never> => Promise.reject(UNAVAILABLE);

/** Every method rejects with an ApiError; tests override what they need. */
function createUnavailableApi(): DataApi {
  return {
    auth: {
      getSession: unavailable,
      onAuthChange: () => () => undefined,
      signIn: unavailable,
      signOut: unavailable,
      changePassword: unavailable,
      deleteMyAccount: unavailable,
      exportMyData: unavailable,
    },
    jobs: { list: unavailable, get: unavailable, setStatus: unavailable, addManual: unavailable },
    applications: { list: unavailable, apply: unavailable, update: unavailable, remove: unavailable },
    profile: { get: unavailable, save: unavailable },
    documents: { list: unavailable, upload: unavailable, signedUrl: unavailable, remove: unavailable, standardTemplates: unavailable },
    admin: { listUsers: unavailable, createUser: unavailable, setRole: unavailable, setBanned: unavailable, deleteUser: unavailable },
  };
}

export interface FakeApi {
  api: DataApi;
  /** Pushes an auth change to every subscribed listener. */
  emit: (session: Session | null) => void;
  listenerCount: () => number;
}

export function createFakeApi(initial: Session | null, authOverrides: Partial<AuthApi> = {}): FakeApi {
  const listeners = new Set<(session: Session | null) => void>();
  const base = createUnavailableApi();
  const api: DataApi = {
    ...base,
    auth: {
      ...base.auth,
      getSession: () => Promise.resolve(initial),
      onAuthChange: (callback) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
      signIn: () => Promise.resolve(ALEX),
      signOut: () => Promise.resolve(),
      ...authOverrides,
    },
  };
  return { api, emit: (session) => listeners.forEach((listener) => listener(session)), listenerCount: () => listeners.size };
}
