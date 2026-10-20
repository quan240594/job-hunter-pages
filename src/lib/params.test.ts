import { readPage, withParams } from './params';

describe('withParams', () => {
  it('sets, removes and resets the page unless patched', () => {
    const base = new URLSearchParams('status=new&page=3&q=x');
    expect(withParams(base, { status: 'applied' }).toString()).toBe('status=applied&q=x');
    expect(withParams(base, { q: null }).toString()).toBe('status=new');
    expect(withParams(base, { q: '' }).toString()).toBe('status=new');
    expect(withParams(base, { page: '4' }).toString()).toBe('status=new&page=4&q=x');
    expect(base.toString()).toBe('status=new&page=3&q=x');
  });
});

describe('readPage', () => {
  it.each([
    ['', 1],
    ['page=3', 3],
    ['page=0', 1],
    ['page=-2', 1],
    ['page=abc', 1],
  ])('reads %j as %i', (query, page) => {
    expect(readPage(new URLSearchParams(query))).toBe(page);
  });
});
