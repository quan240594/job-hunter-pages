import { HOME_PATH, returnPathFrom } from './paths';

describe('returnPathFrom', () => {
  it('returns an in-app path from the router state', () => {
    expect(returnPathFrom({ from: '/applied?page=2' })).toBe('/applied?page=2');
  });

  it.each([
    [null],
    [undefined],
    ['/applied'],
    [{}],
    [{ from: 42 }],
    [{ from: 'https://example.com/' }],
    [{ from: '//example.com/' }],
    [{ from: '/\\example.com' }],
    [{ from: '/login' }],
    [{ from: '/login?x=1' }],
    [{ from: '/change-password' }],
  ])('falls back home for %j', (state) => {
    expect(returnPathFrom(state)).toBe(HOME_PATH);
  });

  it('does not mistake similar paths for the entry pages', () => {
    expect(returnPathFrom({ from: '/loginfo' })).toBe('/loginfo');
  });
});
