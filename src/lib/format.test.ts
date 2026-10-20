import {
  daysUntil,
  endOfDayIso,
  fitStars,
  fitText,
  formatBytes,
  formatDate,
  isDateInput,
  startOfDayIso,
  toDateInputValue,
  truncate,
} from './format';

describe('format', () => {
  it('formats dates in Amsterdam time', () => {
    expect(formatDate('2026-10-20T10:00:00.000Z')).toBe('20 Oct 2026');
    expect(formatDate('2026-12-31T23:30:00.000Z')).toBe('1 Jan 2027');
  });

  it('counts days until a date, rounding up', () => {
    const now = new Date('2026-10-20T10:00:00.000Z');
    expect(daysUntil('2026-10-30T10:00:00.000Z', now)).toBe(10);
    expect(daysUntil('2026-10-30T11:00:00.000Z', now)).toBe(11);
    expect(daysUntil('2026-10-19T10:00:00.000Z', now)).toBe(-1);
  });

  it('formats file sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('renders fit as stars and text, clamped to 0-5', () => {
    expect(fitStars(3)).toBe('★★★☆☆');
    expect(fitStars(9)).toBe('★★★★★');
    expect(fitStars(-1)).toBe('☆☆☆☆☆');
    expect(fitText(4)).toBe('4 out of 5');
    expect(fitText(0)).toBe('not scored');
  });

  it('truncates long text', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('a long sentence here', 10)).toBe('a long se…');
  });

  it('reads the Amsterdam calendar day of an instant', () => {
    expect(toDateInputValue(new Date('2026-10-20T22:30:00.000Z'))).toBe('2026-10-21');
    expect(toDateInputValue(new Date('2026-01-05T10:00:00.000Z'))).toBe('2026-01-05');
  });

  it('validates calendar dates', () => {
    expect(isDateInput('2026-02-28')).toBe(true);
    expect(isDateInput('2026-02-30')).toBe(false);
    expect(isDateInput('2026-2-3')).toBe(false);
    expect(isDateInput('')).toBe(false);
  });

  it('converts day boundaries with daylight saving', () => {
    expect(startOfDayIso('2026-01-15')).toBe('2026-01-14T23:00:00.000Z');
    expect(endOfDayIso('2026-01-15')).toBe('2026-01-15T22:59:59.999Z');
    expect(startOfDayIso('2026-07-15')).toBe('2026-07-14T22:00:00.000Z');
    expect(endOfDayIso('2026-07-15')).toBe('2026-07-15T21:59:59.999Z');
  });
});
