import type { ISODateTime } from '../api';
import { endOfDayIso, isDateInput, startOfDayIso } from './format';
import { withParams } from './params';

export type TimeRange = 'all' | '7d' | '30d' | '90d';
export type TimeFilterValue = { range: TimeRange | 'custom'; from: string; to: string };

export const CUSTOM = 'custom';
export const DEFAULT_TIME_FILTER: TimeFilterValue = { range: 'all', from: '', to: '' };

export const TIME_PRESETS: readonly { range: TimeRange; label: string }[] = [
  { range: 'all', label: 'All time' },
  { range: '7d', label: '7 days' },
  { range: '30d', label: '30 days' },
  { range: '90d', label: '90 days' },
];

const PRESET_DAYS: Record<Exclude<TimeRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };
const MS_PER_DAY = 86_400_000;
const PRESET_VALUES = new Set<string>(TIME_PRESETS.map((preset) => preset.range));

function validDate(value: string | null): string {
  return value !== null && isDateInput(value) ? value : '';
}

export function readTimeFilter(params: URLSearchParams): TimeFilterValue {
  const range = params.get('range');
  const from = validDate(params.get('from'));
  const to = validDate(params.get('to'));
  if (range === CUSTOM || (range === null && (from !== '' || to !== ''))) return { range: CUSTOM, from, to };
  if (range !== null && PRESET_VALUES.has(range)) return { range: range as TimeRange, from: '', to: '' };
  return DEFAULT_TIME_FILTER;
}

export function writeTimeFilter(params: URLSearchParams, value: TimeFilterValue): URLSearchParams {
  if (value.range === CUSTOM) return withParams(params, { range: CUSTOM, from: value.from, to: value.to });
  return withParams(params, { range: value.range === 'all' ? null : value.range, from: null, to: null });
}

export interface TimeQuery {
  since?: ISODateTime;
  until?: ISODateTime;
}

/** Converts the filter to API bounds; custom day boundaries use Europe/Amsterdam calendar days. */
export function timeFilterQuery(value: TimeFilterValue, now: Date): TimeQuery {
  if (value.range === CUSTOM) {
    return {
      since: value.from === '' ? undefined : startOfDayIso(value.from),
      until: value.to === '' ? undefined : endOfDayIso(value.to),
    };
  }
  if (value.range === 'all') return {};
  return { since: new Date(now.getTime() - PRESET_DAYS[value.range] * MS_PER_DAY).toISOString() };
}
