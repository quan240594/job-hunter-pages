import { FALLBACK_MESSAGE, errorMessage, isAbsoluteHttpUrl, safeHttpUrl } from './errors';

describe('errorMessage', () => {
  it('uses the message of an ApiError or Error', () => {
    expect(errorMessage({ code: 'conflict', message: 'Already exists' })).toBe('Already exists');
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it.each([undefined, null, 'text', { message: 3 }, { message: '' }, {}])('falls back for %j', (reason) => {
    expect(errorMessage(reason)).toBe(FALLBACK_MESSAGE);
  });
});

describe('safeHttpUrl', () => {
  it('keeps http(s) links and resolves relative ones against the page', () => {
    expect(safeHttpUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHttpUrl('http://localhost/a')).toBe('http://localhost/a');
    expect(safeHttpUrl('templates/cv.pdf')).toBe(new URL('templates/cv.pdf', document.baseURI).href);
  });

  it.each([null, '', 'javascript:alert(1)', 'data:text/html,x', 'https://['])('drops %s', (url) => {
    expect(safeHttpUrl(url)).toBeNull();
  });
});

describe('isAbsoluteHttpUrl', () => {
  it('accepts only absolute http(s) URLs', () => {
    expect(isAbsoluteHttpUrl('https://alex.example.com')).toBe(true);
    expect(isAbsoluteHttpUrl('http://alex.example.com')).toBe(true);
    expect(isAbsoluteHttpUrl('alex.example.com')).toBe(false);
    expect(isAbsoluteHttpUrl('ftp://alex.example.com')).toBe(false);
  });
});
