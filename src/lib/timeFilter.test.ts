import { CUSTOM, DEFAULT_TIME_FILTER, readTimeFilter, timeFilterQuery, writeTimeFilter } from './timeFilter';

const NOW = new Date('2026-10-20T10:00:00.000Z');

describe('readTimeFilter', () => {
  it('reads presets, custom ranges and defaults', () => {
    expect(readTimeFilter(new URLSearchParams('range=30d'))).toEqual({ range: '30d', from: '', to: '' });
    expect(readTimeFilter(new URLSearchParams('range=custom&from=2026-01-01&to=2026-02-01'))).toEqual({
      range: CUSTOM,
      from: '2026-01-01',
      to: '2026-02-01',
    });
    expect(readTimeFilter(new URLSearchParams('from=2026-01-01'))).toEqual({ range: CUSTOM, from: '2026-01-01', to: '' });
    expect(readTimeFilter(new URLSearchParams('range=custom&from=nope'))).toEqual({ range: CUSTOM, from: '', to: '' });
    expect(readTimeFilter(new URLSearchParams('range=bogus'))).toEqual(DEFAULT_TIME_FILTER);
    expect(readTimeFilter(new URLSearchParams(''))).toEqual(DEFAULT_TIME_FILTER);
  });
});

describe('writeTimeFilter', () => {
  it('writes presets without dates and drops the default', () => {
    const base = new URLSearchParams('range=custom&from=2026-01-01&to=2026-02-01&q=x&page=2');
    expect(writeTimeFilter(base, { range: '7d', from: '', to: '' }).toString()).toBe('range=7d&q=x');
    expect(writeTimeFilter(base, DEFAULT_TIME_FILTER).toString()).toBe('q=x');
  });

  it('writes a custom range', () => {
    expect(writeTimeFilter(new URLSearchParams(), { range: CUSTOM, from: '2026-01-01', to: '' }).toString()).toBe(
      'range=custom&from=2026-01-01',
    );
  });
});

describe('timeFilterQuery', () => {
  it('has no bounds for all time', () => {
    expect(timeFilterQuery(DEFAULT_TIME_FILTER, NOW)).toEqual({});
  });

  it('counts presets back from now', () => {
    expect(timeFilterQuery({ range: '7d', from: '', to: '' }, NOW)).toEqual({ since: '2026-10-13T10:00:00.000Z' });
    expect(timeFilterQuery({ range: '90d', from: '', to: '' }, NOW)).toEqual({ since: '2026-07-22T10:00:00.000Z' });
  });

  it('uses Amsterdam day boundaries for custom ranges', () => {
    expect(timeFilterQuery({ range: CUSTOM, from: '2026-01-15', to: '2026-01-16' }, NOW)).toEqual({
      since: '2026-01-14T23:00:00.000Z',
      until: '2026-01-16T22:59:59.999Z',
    });
    expect(timeFilterQuery({ range: CUSTOM, from: '', to: '' }, NOW)).toEqual({ since: undefined, until: undefined });
  });
});
