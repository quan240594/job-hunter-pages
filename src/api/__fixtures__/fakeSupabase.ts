// Hermetic stand-in for the supabase-js client used by the supabaseApi tests: records every PostgREST query and
// answers it from a FIFO queue; auth, storage and functions are plain vi.fn() mocks.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface QueryResult {
  data: unknown;
  error: unknown;
}

export interface RecordedOp {
  name: string;
  args: unknown[];
}

export interface RecordedQuery {
  table: string;
  ops: RecordedOp[];
}

const CHAIN_METHODS = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'gte', 'lte', 'or', 'order', 'single', 'maybeSingle'] as const;

export const ok = (data: unknown): QueryResult => ({ data, error: null });
export const failure = (error: unknown): QueryResult => ({ data: null, error });

export function createFakeSupabase() {
  const queue: QueryResult[] = [];
  const queries: RecordedQuery[] = [];

  const storageBucket = {
    upload: vi.fn(() => Promise.resolve({ data: { path: 'p' }, error: null as unknown })),
    createSignedUrl: vi.fn(() =>
      Promise.resolve({ data: { signedUrl: 'https://signed.example.com/doc' } as unknown, error: null as unknown }),
    ),
    remove: vi.fn(() => Promise.resolve({ data: [] as unknown, error: null as unknown })),
  };
  const unsubscribe = vi.fn();
  const auth = {
    getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'u1' } } as unknown }, error: null as unknown })),
    onAuthStateChange: vi.fn((_callback: (event: string, session: unknown) => void) => ({ data: { subscription: { unsubscribe } } })),
    signInWithPassword: vi.fn(() =>
      Promise.resolve({ data: { user: { id: 'u1', email: 'alex@example.com' } } as unknown, error: null as unknown }),
    ),
    signOut: vi.fn(() => Promise.resolve({ error: null as unknown })),
    updateUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } }, error: null as unknown })),
    verifyOtp: vi.fn(() => Promise.resolve({ data: {}, error: null as unknown })),
  };
  const storage = { from: vi.fn((_bucket: string) => storageBucket) };
  const functions = { invoke: vi.fn((_name: string, _options: unknown) => Promise.resolve({ data: null as unknown, error: null as unknown })) };

  function from(table: string) {
    const query: RecordedQuery = { table, ops: [] };
    queries.push(query);
    const builder: Record<string, unknown> = {
      then: (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(queue.shift() ?? failure({ message: 'unexpected query', code: 'TEST' })).then(resolve, reject),
    };
    for (const name of CHAIN_METHODS) {
      builder[name] = (...args: unknown[]) => {
        query.ops.push({ name, args });
        return builder;
      };
    }
    return builder;
  }

  return {
    client: { from, auth, storage, functions } as unknown as SupabaseClient,
    /** Answers the next awaited queries in order. */
    respond: (...results: QueryResult[]) => {
      queue.push(...results);
    },
    queries,
    auth,
    storage,
    storageBucket,
    functions,
    unsubscribe,
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

export function opNames(query: RecordedQuery): string[] {
  return query.ops.map((op) => op.name);
}

export function opArgs(query: RecordedQuery, name: string): unknown[] | undefined {
  return query.ops.find((op) => op.name === name)?.args;
}
