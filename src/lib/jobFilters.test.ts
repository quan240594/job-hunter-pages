import { makeJob } from '../__fixtures__/uiFixtures';
import { DEFAULT_TIME_FILTER } from './timeFilter';
import { jobsQuery, pageOf, readJobFilters, sortJobs, writeJobFilters } from './jobFilters';

const NOW = new Date('2026-10-20T10:00:00.000Z');

describe('readJobFilters', () => {
  it('reads valid values', () => {
    expect(readJobFilters(new URLSearchParams('status=skipped&q=react&sort=fit&order=asc&page=2'))).toEqual({
      status: 'skipped',
      q: 'react',
      sort: 'fit',
      order: 'asc',
      page: 2,
    });
  });

  it('falls back to defaults for missing or invalid values', () => {
    expect(readJobFilters(new URLSearchParams('status=bogus&sort=bogus&order=sideways'))).toEqual({
      status: '',
      q: '',
      sort: 'firstSeen',
      order: 'desc',
      page: 1,
    });
  });
});

describe('writeJobFilters', () => {
  it('writes every field and omits defaults', () => {
    const written = writeJobFilters(new URLSearchParams(), { status: 'new', q: 'go', sort: 'posted', order: 'asc', page: 3 });
    expect(written.toString()).toBe('status=new&q=go&sort=posted&order=asc&page=3');
    const defaults = writeJobFilters(written, { sort: 'firstSeen', order: 'desc', page: 1, status: '', q: '' });
    expect(defaults.toString()).toBe('');
  });

  it('resets the page when another filter changes', () => {
    expect(writeJobFilters(new URLSearchParams('page=4'), { status: 'new' }).toString()).toBe('status=new');
  });
});

describe('jobsQuery', () => {
  it('maps filters to the API query', () => {
    const query = jobsQuery({ status: 'new', q: '  react ', sort: 'fit', order: 'desc', page: 1 }, { range: '7d', from: '', to: '' }, NOW);
    expect(query).toEqual({ since: '2026-10-13T10:00:00.000Z', status: 'new', search: 'react' });
  });

  it('leaves out empty status and search', () => {
    expect(jobsQuery({ status: '', q: '   ', sort: 'fit', order: 'desc', page: 1 }, DEFAULT_TIME_FILTER, NOW)).toEqual({
      status: undefined,
      search: undefined,
    });
  });
});

describe('sortJobs', () => {
  const old = makeJob({ id: 'old', firstSeenAt: '2026-10-01T00:00:00.000Z', postedAt: '2026-09-01T00:00:00.000Z', fit: 5 });
  const recent = makeJob({ id: 'recent', firstSeenAt: '2026-10-10T00:00:00.000Z', fit: 5 });
  const low = makeJob({ id: 'low', firstSeenAt: '2026-10-05T00:00:00.000Z', postedAt: '2026-10-04T00:00:00.000Z', fit: 2 });
  const jobs = [old, low, recent];

  it('sorts by fit with the newest first-seen as tie-break', () => {
    expect(sortJobs(jobs, 'fit', 'desc').map((job) => job.id)).toEqual(['recent', 'old', 'low']);
    expect(sortJobs(jobs, 'fit', 'asc').map((job) => job.id)).toEqual(['low', 'recent', 'old']);
  });

  it('sorts by first seen and by posted (falling back to first seen)', () => {
    expect(sortJobs(jobs, 'firstSeen', 'desc').map((job) => job.id)).toEqual(['recent', 'low', 'old']);
    expect(sortJobs(jobs, 'posted', 'asc').map((job) => job.id)).toEqual(['old', 'low', 'recent']);
  });

  it('does not mutate its input', () => {
    sortJobs(jobs, 'fit', 'asc');
    expect(jobs.map((job) => job.id)).toEqual(['old', 'low', 'recent']);
  });
});

describe('pageOf', () => {
  it('slices 50 per page', () => {
    const items = Array.from({ length: 120 }, (_, index) => index);
    expect(pageOf(items, 1)).toHaveLength(50);
    expect(pageOf(items, 3)).toEqual(items.slice(100));
  });
});
