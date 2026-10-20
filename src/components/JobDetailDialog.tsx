import { useState } from 'react';
import type { DocumentMeta, Job, JobStatus } from '../api';
import { useApi } from '../auth/context';
import { useAction } from '../hooks/useAction';
import { ApplyDialog } from './ApplyDialog';
import { StatusBadge } from './Badge';
import { Dialog } from './Dialog';
import { JobFacts, JobLink } from './JobFacts';

interface JobDetailDialogProps {
  job: Job;
  documents: readonly DocumentMeta[];
  /** Called after an action changed the job, so the list behind the dialog can reload. */
  onChanged: () => void;
  onClose: () => void;
}

export function JobDetailDialog({ job, documents, onChanged, onClose }: Readonly<JobDetailDialogProps>) {
  const api = useApi();
  const { busy, error, run } = useAction();
  const [applying, setApplying] = useState(false);

  const changeStatus = (status: JobStatus) =>
    void run(async () => {
      await api.jobs.setStatus(job.id, status);
      onChanged();
      onClose();
    });

  return (
    <Dialog title={job.title} onClose={onClose} wide>
      <p>
        <StatusBadge status={job.status} /> {job.company} · {job.location}
      </p>
      <JobFacts job={job} />
      <p>
        <JobLink url={job.url} />
      </p>
      <h4>Description</h4>
      {job.description === '' ? <p className="muted">No description.</p> : <p className="plain-text">{job.description}</p>}
      <div className="card-actions">
        {job.status === 'new' ? (
          <>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setApplying(true)}>
              Mark as applied
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => changeStatus('skipped')}>
              Skip
            </button>
          </>
        ) : null}
        {job.status === 'skipped' ? (
          <button type="button" className="btn" disabled={busy} onClick={() => changeStatus('new')}>
            Move back to New
          </button>
        ) : null}
        {job.status === 'applied' ? <p className="muted">Manage this application on the Applied page.</p> : null}
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
          onApplied={() => {
            setApplying(false);
            onChanged();
            onClose();
          }}
          onClose={() => setApplying(false)}
        />
      ) : null}
    </Dialog>
  );
}
