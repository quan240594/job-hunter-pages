import { mapError } from './supabaseErrors';

describe('mapError', () => {
  it('returns an ApiError unchanged', () => {
    const error = { code: 'conflict' as const, message: 'x' };
    expect(mapError(error)).toBe(error);
  });

  it.each([
    [{ code: '42501', message: 'new row violates row-level security policy for table "jobs"' }, 'forbidden'],
    [{ code: '23505', message: 'duplicate key value violates unique constraint' }, 'conflict'],
    [{ code: '23514', message: 'check violation' }, 'validation'],
    [{ code: '22P02', message: 'invalid input syntax' }, 'validation'],
    [{ code: '23503', message: 'foreign key violation' }, 'validation'],
    [{ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 'not_found'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'unauthenticated'],
    [{ code: 'P0001', message: 'template_limit' }, 'template_limit'],
    [{ code: 'P0001', message: 'Raised: TEMPLATE_LIMIT reached' }, 'template_limit'],
  ])('maps the Postgres error %j to %s', (error, code) => {
    expect(mapError(error)).toEqual({ code, message: error.message });
  });

  it.each([
    [{ name: 'AuthApiError', code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }, 'unauthenticated'],
    [{ name: 'AuthApiError', code: 'user_banned', status: 400, message: 'User is banned' }, 'forbidden'],
    [{ name: 'AuthWeakPasswordError', code: 'weak_password', status: 422, message: 'weak' }, 'validation'],
    [{ name: 'AuthApiError', code: 'same_password', status: 422, message: 'same' }, 'validation'],
    [{ name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' }, 'unauthenticated'],
    [{ name: 'AuthApiError', status: 401, message: 'bad token' }, 'unauthenticated'],
    [{ name: 'AuthApiError', status: 400, message: 'plain bad request' }, 'validation'],
    [{ name: 'AuthRetryableFetchError', status: 0, message: 'offline' }, 'network'],
  ])('maps the Auth error %j to %s', (error, code) => {
    expect(mapError(error).code).toBe(code);
  });

  it.each([
    [{ statusCode: '403', message: 'new row violates row-level security policy' }, 'forbidden'],
    [{ statusCode: '404', message: 'Object not found' }, 'not_found'],
    [{ statusCode: 413, message: 'The object exceeded the maximum allowed size' }, 'validation'],
    [{ statusCode: '409', message: 'The resource already exists' }, 'conflict'],
    [{ statusCode: ' ', message: 'blank status' }, 'unknown'],
  ])('maps the Storage error %j to %s', (error, code) => {
    expect(mapError(error).code).toBe(code);
  });

  it.each([
    [{ name: 'FunctionsHttpError', message: 'non-2xx', context: { status: 403 } }, 'forbidden'],
    [{ name: 'FunctionsHttpError', message: 'non-2xx', context: { status: 500 } }, 'unknown'],
    [{ name: 'FunctionsHttpError', message: 'non-2xx', context: 'x' }, 'unknown'],
    [{ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' }, 'network'],
  ])('maps the Functions error %j to %s', (error, code) => {
    expect(mapError(error).code).toBe(code);
  });

  it.each(['TypeError: Failed to fetch', 'fetch failed', 'NetworkError when attempting to fetch resource.', 'Network request failed', 'Load failed'])(
    'treats "%s" as a network failure',
    (message) => {
      expect(mapError({ code: '', message }).code).toBe('network');
      expect(mapError(new TypeError(message)).code).toBe('network');
    },
  );

  it('falls back to unknown with a safe message', () => {
    expect(mapError({ code: 'XX000', message: 'boom' })).toEqual({ code: 'unknown', message: 'boom' });
    expect(mapError({ code: 'constructor', message: 'proto' }).code).toBe('unknown');
    expect(mapError({ status: 418, message: 'teapot' }).code).toBe('unknown');
    expect(mapError(new Error('plain'))).toEqual({ code: 'unknown', message: 'plain' });
    expect(mapError({ message: '' })).toEqual({ code: 'unknown', message: 'Something went wrong.' });
    expect(mapError('text')).toEqual({ code: 'unknown', message: 'Something went wrong.' });
    expect(mapError(null)).toEqual({ code: 'unknown', message: 'Something went wrong.' });
    expect(mapError(undefined).code).toBe('unknown');
  });
});
