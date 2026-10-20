import { useId, useState } from 'react';
import type { DocumentMeta, Job } from '../api';
import { useApi } from '../auth/context';
import { useAction } from '../hooks/useAction';
import { KIND_LABELS } from '../lib/labels';
import { truncate } from '../lib/format';
import { ApplyDialog } from './ApplyDialog';
import { Chip, ChipList } from './Chip';
import { JobFacts, JobLink } from './JobFacts';

const SUMMARY_LIMIT = 280;

function RecommendedDocuments({ job, documents }: Readonly<{ job: Job; documents: readonly DocumentMeta[] }>) {
  const recommended = documents.filter((doc) => job.recommendedDocumentIds.includes(doc.id));
  if (recommended.length === 0) return <p className="muted">No recommended documents for this job.</p>;
  return (
    <ChipList label="Recommended documents">
      {recommended.map((doc) => (
        <Chip key={doc.id} tone="info">
          {KIND_LABELS[doc.kind]}: {doc.filename}
        </Chip>
      ))}
    </ChipList>
  );
}

interface JobCardProps {
  job: Job;
  documents: readonly DocumentMeta[];
  /** Called after the job was skipped or marked as applied, so the list can drop it and announce `message`. */
  onResolved: (jobId: string, message: string) => void;
}

export function JobCard({ job, documents, onResolved }: Readonly<JobCardProps>) {
  const api = useApi();
  const titleId = useId();
  const [applying, setApplying] = useState(false);
  const { busy, error, run } = useAction();
  const skip = () =>
    void run(async () => {
      await api.jobs.setStatus(job.id, 'skipped');
      onResolved(job.id, `Skipped ${job.title} at ${job.company}.`);
    });

  return (
    <article className="card rec-card" aria-labelledby={titleId}>
      <header className="rec-head">
        <div>
          <h3 id={titleId}>{job.title}</h3>
          <p className="rec-company">{job.company}</p>
        </div>
      </header>
      {job.description === '' ? null : <p className="job-summary">{truncate(job.description, SUMMARY_LIMIT)}</p>}
      <JobFacts job={job} />
      <RecommendedDocuments job={job} documents={documents} />
      <div className="card-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setApplying(true)}>
          Mark applied
        </button>
        <button type="button" className="btn" disabled={busy} onClick={skip}>
          Skip
        </button>
        <JobLink url={job.url} />
      </div>
      {error === null ? null : (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {applying ? (
        <ApplyDialog
          job={job}
          documents={documents}
          onApplied={() => onResolved(job.id, `Marked ${job.title} at ${job.company} as applied.`)}
          onClose={() => setApplying(false)}
        />
      ) : null}
    </article>
  );
}
