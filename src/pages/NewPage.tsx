import { useState } from 'react';
import type { JobListQuery } from '../api';
import { AddJobDialog } from '../components/AddJobDialog';
import { DataState } from '../components/DataState';
import { EmptyState } from '../components/EmptyState';
import { JobCard } from '../components/JobCard';
import { useDocuments, useJobs } from '../hooks/useData';
import { sortJobs } from '../lib/jobFilters';

const NEW_QUERY: JobListQuery = { status: 'new' };

export function NewPage() {
  const jobs = useJobs(NEW_QUERY);
  const documents = useDocuments();
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(false);
  const { setData, reload } = jobs;

  const onResolved = (jobId: string, message: string) => {
    setData((current) => current.filter((job) => job.id !== jobId));
    setNotice(message);
  };

  return (
    <section aria-labelledby="new-heading">
      <h1 id="new-heading">New</h1>
      <p className="muted">Jobs waiting for a decision, best fit first.</p>
      <div className="toolbar">
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          Add job manually
        </button>
      </div>
      <output className="notice">{notice}</output>
      {documents.status === 'error' ? (
        <p role="alert" className="form-error">
          Could not load your documents, so recommendations are hidden: {documents.error}
        </p>
      ) : null}
      <DataState state={jobs} loadingLabel="Loading new jobs…">
        {(data) =>
          data.length === 0 ? (
            <EmptyState title="No new jobs" hint="Everything has been handled. New jobs appear here, or add one manually." />
          ) : (
            <>
              <p className="result-count">
                {data.length} new {data.length === 1 ? 'job' : 'jobs'}
              </p>
              <ul className="card-list">
                {sortJobs(data, 'fit', 'desc').map((job) => (
                  <li key={job.id}>
                    <JobCard job={job} documents={documents.data ?? []} onResolved={onResolved} />
                  </li>
                ))}
              </ul>
            </>
          )
        }
      </DataState>
      {adding ? (
        <AddJobDialog
          onAdded={(job) => {
            setAdding(false);
            setNotice(`Added ${job.title} at ${job.company}.`);
            reload();
          }}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </section>
  );
}
