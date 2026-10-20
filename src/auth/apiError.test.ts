import { describeError, errorCode } from './apiError';

describe('errorCode', () => {
  it.each(['unauthenticated', 'forbidden', 'not_found', 'validation', 'template_limit', 'conflict', 'network', 'unknown'])(
    'keeps the contract code %s',
    (code) => {
      expect(errorCode({ code, message: 'x' })).toBe(code);
    },
  );

  it.each([[new Error('boom')], [null], ['text'], [{ code: 42 }], [{ code: 'teapot' }]])(
    'treats %j as unknown',
    (thrown) => {
      expect(errorCode(thrown)).toBe('unknown');
    },
  );
});

describe('describeError', () => {
  it('uses friendly default text and never the raw message', () => {
    const text = describeError({ code: 'network', message: 'ECONNRESET at 10.0.0.1' });
    expect(text).toContain('Cannot reach the server');
    expect(text).not.toContain('ECONNRESET');
  });

  it.each(['unauthenticated', 'forbidden', 'not_found', 'validation', 'template_limit', 'conflict', 'unknown'])(
    'has default text for %s',
    (code) => {
      expect(describeError({ code, message: '' }).length).toBeGreaterThan(10);
    },
  );

  it('lets a screen override the wording per code', () => {
    expect(describeError({ code: 'conflict', message: '' }, { conflict: 'Already there.' })).toBe('Already there.');
    expect(describeError({ code: 'network', message: '' }, { conflict: 'Already there.' })).toContain('Cannot reach');
  });
});
