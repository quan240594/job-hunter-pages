import { apiError, isApiError, isApiErrorCode } from './errors';

describe('errors', () => {
  it('builds an ApiError', () => {
    expect(apiError('not_found', 'gone')).toEqual({ code: 'not_found', message: 'gone' });
  });

  it('recognises the closed set of codes', () => {
    expect(isApiErrorCode('template_limit')).toBe(true);
    expect(isApiErrorCode('23505')).toBe(false);
    expect(isApiErrorCode(42)).toBe(false);
  });

  it('recognises ApiError values only', () => {
    expect(isApiError({ code: 'conflict', message: 'x' })).toBe(true);
    expect(isApiError({ code: 'conflict' })).toBe(false);
    expect(isApiError({ code: '23505', message: 'x' })).toBe(false);
    expect(isApiError(null)).toBe(false);
    expect(isApiError('conflict')).toBe(false);
    expect(isApiError(new Error('x'))).toBe(false);
  });
});
