import { SelectField } from './Field';
import { SearchBox } from './SearchBox';
import { TimeFilter } from './TimeFilter';
import type { JobStatus } from '../api';
import type { JobFilterPatch, JobFilters, SortKey, SortOrder } from '../lib/jobFilters';
import { STATUSES, STATUS_LABELS } from '../lib/labels';
import type { TimeFilterValue } from '../lib/timeFilter';

const STATUS_OPTIONS: { value: JobStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  ...STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
];
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'firstSeen', label: 'First seen' },
  { value: 'posted', label: 'Posted' },
  { value: 'fit', label: 'Fit' },
];
const ORDER_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'desc', label: 'Descending' },
  { value: 'asc', label: 'Ascending' },
];

interface JobFiltersBarProps {
  filters: JobFilters;
  time: TimeFilterValue;
  onChange: (patch: JobFilterPatch) => void;
  onTimeChange: (value: TimeFilterValue) => void;
}

export function JobFiltersBar({ filters, time, onChange, onTimeChange }: Readonly<JobFiltersBarProps>) {
  return (
    <div className="filters">
      <TimeFilter basis="first seen" value={time} onChange={onTimeChange} />
      <div className="field-row">
        <SelectField label="Status" value={filters.status} options={STATUS_OPTIONS} onChange={(status) => onChange({ status })} />
        <SearchBox value={filters.q} onCommit={(q) => onChange({ q })} />
        <SelectField label="Sort by" value={filters.sort} options={SORT_OPTIONS} onChange={(sort) => onChange({ sort })} />
        <SelectField label="Order" value={filters.order} options={ORDER_OPTIONS} onChange={(order) => onChange({ order })} />
      </div>
    </div>
  );
}
