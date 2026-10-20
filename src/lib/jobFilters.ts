import type { Job, JobListQuery, JobStatus } from '../api';
import { PAGE_SIZE, STATUSES } from './labels';
import { readPage, withParams } from './params';
import { timeFilterQuery } from './timeFilter';
import type { TimeFilterValue } from './timeFilter';

export type SortKey = 'firstSeen' | 'posted' | 'fit';
export type SortOrder = 'asc' | 'desc';

export interface JobFilters {
  status: JobStatus | '';
  q: string;
  sort: SortKey;
  order: SortOrder;
  page: number;
}

export type JobFilterPatch = Partial<JobFilters>;

const STATUS_VALUES = new Set<string>(STATUSES);
const SORTS = new Set<string>(['firstSeen', 'posted', 'fit']);
const DEFAULT_SORT: SortKey = 'firstSeen';
const DEFAULT_ORDER: SortOrder = 'desc';

export function readJobFilters(params: URLSearchParams): JobFilters {
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? DEFAULT_SORT;
  return {
    status: STATUS_VALUES.has(status) ? (status as JobStatus) : '',
    q: params.get('q') ?? '',
    sort: SORTS.has(sort) ? (sort as SortKey) : DEFAULT_SORT,
    order: params.get('order') === 'asc' ? 'asc' : DEFAULT_ORDER,
    page: readPage(params),
  };
}

export function writeJobFilters(params: URLSearchParams, patch: JobFilterPatch): URLSearchParams {
  const entries: Record<string, string | null> = {};
  if (patch.status !== undefined) entries.status = patch.status;
  if (patch.q !== undefined) entries.q = patch.q;
  if (patch.sort !== undefined) entries.sort = patch.sort === DEFAULT_SORT ? null : patch.sort;
  if (patch.order !== undefined) entries.order = patch.order === DEFAULT_ORDER ? null : patch.order;
  if (patch.page !== undefined) entries.page = patch.page === 1 ? null : String(patch.page);
  return withParams(params, entries);
}

export function jobsQuery(filters: JobFilters, time: TimeFilterValue, now: Date): JobListQuery {
  const search = filters.q.trim();
  return {
    ...timeFilterQuery(time, now),
    status: filters.status === '' ? undefined : filters.status,
    search: search === '' ? undefined : search,
  };
}

function sortValue(job: Job, sort: SortKey): number {
  if (sort === 'fit') return job.fit;
  return Date.parse(sort === 'posted' ? (job.postedAt ?? job.firstSeenAt) : job.firstSeenAt);
}

/** Never mutates the input; ties fall back to the newest first-seen date. */
export function sortJobs(jobs: readonly Job[], sort: SortKey, order: SortOrder): Job[] {
  const direction = order === 'asc' ? 1 : -1;
  return jobs.toSorted(
    (a, b) =>
      direction * (sortValue(a, sort) - sortValue(b, sort)) || Date.parse(b.firstSeenAt) - Date.parse(a.firstSeenAt),
  );
}

export function pageOf<T>(items: readonly T[], page: number): T[] {
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}
