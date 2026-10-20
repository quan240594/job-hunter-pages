export const TIME_ZONE = 'Europe/Amsterdam';
const LOCALE = 'en-GB';
const MAX_FIT = 5;
const MS_PER_SECOND = 1000;
const MS_PER_DAY = 86_400_000;
const KB = 1024;

const DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });
const PARTS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/** Whole days from `now` until `iso` (rounded up; 0 or negative once it has passed). */
export function daysUntil(iso: string, now: Date): number {
  return Math.ceil((Date.parse(iso) - now.getTime()) / MS_PER_DAY);
}

export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${(bytes / (KB * KB)).toFixed(1)} MB`;
}

export function fitStars(fit: number): string {
  const filled = Math.min(Math.max(Math.round(fit), 0), MAX_FIT);
  return '★'.repeat(filled) + '☆'.repeat(MAX_FIT - filled);
}

export function fitText(fit: number): string {
  return fit === 0 ? 'not scored' : `${fit} out of ${MAX_FIT}`;
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(instant: Date): ZonedParts {
  const values: Record<string, number> = {};
  for (const part of PARTS_FORMAT.formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number.parseInt(part.value, 10);
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function pad(value: number, width = 2): string {
  return value.toString().padStart(width, '0');
}

/** Calendar date (YYYY-MM-DD) of an instant in Europe/Amsterdam, as used by `<input type="date">`. */
export function toDateInputValue(instant: Date): string {
  const { year, month, day } = zonedParts(instant);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function offsetMs(instant: Date): number {
  const p = zonedParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / MS_PER_SECOND) * MS_PER_SECOND;
}

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateInput(value: string): boolean {
  const match = DATE_INPUT.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

/** Instant for a wall-clock time in Europe/Amsterdam (handles daylight saving). */
function amsterdamInstant(date: string, hour: number, minute: number, second: number, ms: number): Date {
  const [year, month, day] = date.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const first = guess - offsetMs(new Date(guess));
  return new Date(guess - offsetMs(new Date(first)));
}

export function startOfDayIso(date: string): string {
  return amsterdamInstant(date, 0, 0, 0, 0).toISOString();
}

export function endOfDayIso(date: string): string {
  return amsterdamInstant(date, 23, 59, 59, 999).toISOString();
}
