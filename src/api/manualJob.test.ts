import { prepareManualJob } from './manualJob';

const base = { title: ' Platform Engineer ', company: ' Acme ', location: ' Amsterdam ', description: 'd' };

describe('prepareManualJob', () => {
  it('applies the contract defaults and trims text', () => {
    expect(prepareManualJob(base)).toEqual({
      title: 'Platform Engineer',
      company: 'Acme',
      location: 'Amsterdam',
      url: null,
      description: 'd',
      fit: 0,
      category: 'C',
      hybrid: 'unclear',
      language: 'unknown',
    });
  });

  it('keeps the optional values that were given and leaves the others absent', () => {
    const job = prepareManualJob({
      ...base,
      url: ' https://jobs.example.com/1 ',
      postedAt: '2026-03-01T00:00:00.000Z',
      fit: 4,
      category: 'A',
      hybrid: 'quoted',
      hybridQuote: ' 3 days remote ',
      language: 'english',
    });
    expect(job).toMatchObject({
      url: 'https://jobs.example.com/1',
      postedAt: '2026-03-01T00:00:00.000Z',
      fit: 4,
      category: 'A',
      hybrid: 'quoted',
      hybridQuote: '3 days remote',
      language: 'english',
    });
    expect(Object.hasOwn(prepareManualJob(base), 'postedAt')).toBe(false);
    expect(Object.hasOwn(prepareManualJob(base), 'hybridQuote')).toBe(false);
  });

  it('uses Unknown for a blank location and treats blank optionals as absent', () => {
    const job = prepareManualJob({ ...base, location: '  ', url: ' ', postedAt: ' ', hybridQuote: ' ' });
    expect(job.location).toBe('Unknown');
    expect(job.url).toBeNull();
    expect(Object.hasOwn(job, 'postedAt')).toBe(false);
  });

  it.each([
    [{ title: ' ' }, 'Title is required.'],
    [{ company: '' }, 'Company is required.'],
    [{ url: 'javascript:alert(1)' }, 'The job URL must be an http(s) URL.'],
    [{ url: 'not a url' }, 'The job URL must be an http(s) URL.'],
    [{ postedAt: 'yesterday-ish' }, 'The posted date is not a valid date.'],
    [{ fit: 6 as never }, 'Fit must be a whole number from 0 to 5.'],
    [{ fit: 1.5 as never }, 'Fit must be a whole number from 0 to 5.'],
    [{ fit: -1 as never }, 'Fit must be a whole number from 0 to 5.'],
  ])('rejects invalid input %j with validation', (patch, message) => {
    expect(() => prepareManualJob({ ...base, ...patch })).toThrow(expect.objectContaining({ code: 'validation', message }));
  });
});
