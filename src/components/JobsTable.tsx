import type { Job } from '../api';
import { CategoryBadge, StatusBadge } from './Badge';
import { FitStars } from './FitStars';
import { formatDate } from '../lib/format';
import { ADZUNA_SOURCE } from '../lib/attribution';
import { AdzunaCredit } from './AdzunaCredit';
import { HYBRID_LABELS, LANGUAGE_LABELS } from '../lib/labels';

interface JobRowProps {
  job: Job;
  onOpen: (job: Job) => void;
}

function JobRow({ job, onOpen }: Readonly<JobRowProps>) {
  return (
    <tr className="row-clickable">
      <td data-label="Company">{job.company}</td>
      <td data-label="Title">
        <button type="button" className="row-link" aria-haspopup="dialog" onClick={() => onOpen(job)}>
          {job.title}
        </button>
      </td>
      <td data-label="Location">{job.location}</td>
      <td data-label="Category">
        <CategoryBadge category={job.category} />
      </td>
      <td data-label="Hybrid">{HYBRID_LABELS[job.hybrid]}</td>
      <td data-label="Language">{LANGUAGE_LABELS[job.language]}</td>
      <td data-label="Fit">
        <FitStars fit={job.fit} />
      </td>
      <td data-label="First seen">{formatDate(job.firstSeenAt)}</td>
      <td data-label="Status">
        <StatusBadge status={job.status} />
      </td>
    </tr>
  );
}

const COLUMNS = ['Company', 'Title', 'Location', 'Category', 'Hybrid', 'Language', 'Fit', 'First seen', 'Status'];

export function JobsTable({ jobs, onOpen }: Readonly<{ jobs: readonly Job[]; onOpen: (job: Job) => void }>) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption className="visually-hidden">Jobs found</caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
      {jobs.some((job) => job.source === ADZUNA_SOURCE) ? (
        <p className="table-credit">
          <AdzunaCredit />
        </p>
      ) : null}
    </div>
  );
}
