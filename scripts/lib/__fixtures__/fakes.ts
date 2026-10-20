import type { CliIo } from '../cli.ts';

export interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export type Handler = (call: RecordedCall) => Response | Promise<Response>;

export const FAKE_URL = 'https://fake-project.example.test';
export const FAKE_SERVICE_KEY = 'fake-service-role-value';

export function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function urlOf(input: URL | RequestInfo): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function fakeFetch(handler: Handler): { fetchFn: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchFn = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const raw = typeof init?.body === 'string' ? init.body : undefined;
    const call: RecordedCall = {
      url: urlOf(input),
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers as Record<string, string> | undefined) },
      body: raw === undefined ? undefined : JSON.parse(raw),
    };
    calls.push(call);
    return handler(call);
  };
  return { fetchFn, calls };
}

export function fakeIo(overrides: Partial<CliIo> & { env?: CliIo['env'] } = {}) {
  const logs: string[] = [];
  const errors: string[] = [];
  const exitCodes: number[] = [];
  const io: CliIo = {
    env: {},
    args: [],
    fetchFn: () => Promise.reject(new Error('unexpected fetch')),
    log: (message) => logs.push(message),
    error: (message) => errors.push(message),
    setExitCode: (code) => exitCodes.push(code),
    ...overrides,
  };
  return { io, logs, errors, exitCodes };
}
