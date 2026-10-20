import { useState } from 'react';
import type { Application, Job } from '../api';
import { ApplicationsTable } from '../components/ApplicationsTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataState } from '../components/DataState';
import { EmptyState } from '../components/EmptyState';
import { TimeFilter } from '../components/TimeFilter';
import { useAction } from '../hooks/useAction';
import { useApplicationEditor } from '../hooks/useApplicationEditor';
import { useApplications, useDocuments, useJobs, useNow } from '../hooks/useData';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { timeFilterQuery } from '../lib/timeFilter';

const ALL_JOBS = {};

interface UndoDialogProps {
  application: Application;
  job: Job | undefined;
  onUndo: (application: Application) => Promise<void>;
  onClose: () => void;
}

function UndoApplicationDialog({ application, job, onUndo, onClose }: Readonly<UndoDialogProps>) {
  const { busy, error, run } = useAction();
  const subject = job === undefined ? 'this job' : `${job.title} at ${job.company}`;
  return (
    <ConfirmDialog
      title="Undo this application?"
      message={`Remove your application for ${subject}? The job goes back to New.`}
      confirmLabel="Undo application"
      busy={busy}
      error={error}
      onConfirm={() =>
        void run(async () => {
          await onUndo(application);
          onClose();
        })
      }
      onCancel={onClose}
    />
  );
}

export function AppliedPage() {
  const { time, setTime } = useUrlFilters();
  const now = useNow();
  const applications = useApplications(timeFilterQuery(time, now));
  const jobs = useJobs(ALL_JOBS);
  const documents = useDocuments();
  const editor = useApplicationEditor(applications);
  const [undoing, setUndoing] = useState<Application | null>(null);
  const [notice, setNotice] = useState('');

  const jobsById = new Map((jobs.data ?? []).map((job) => [job.id, job]));

  return (
    <section aria-labelledby="applied-heading">
      <h1 id="applied-heading">Applied</h1>
      <p className="muted">Your applications and where they stand.</p>
      <div className="filters">
        <TimeFilter basis="applied" value={time} onChange={setTime} />
      </div>
      <output className="notice">{notice}</output>
      {editor.error === null ? null : (
        <p role="alert" className="form-error">
          {editor.error}
        </p>
      )}
      <DataState state={jobs} loadingLabel="Loading applications…">
        {() => (
          <DataState state={documents} loadingLabel="Loading applications…">
            {(documentList) => (
              <DataState state={applications} loadingLabel="Loading applications…">
                {(items) =>
                  items.length === 0 ? (
                    <EmptyState title="No applications yet" hint="Applications you mark as applied show up here." />
                  ) : (
                    <ApplicationsTable
                      applications={items.toSorted((a, b) => Date.parse(b.appliedAt) - Date.parse(a.appliedAt))}
                      jobsById={jobsById}
                      documents={documentList}
                      now={now}
                      onPatch={editor.patch}
                      onUndo={setUndoing}
                    />
                  )
                }
              </DataState>
            )}
          </DataState>
        )}
      </DataState>
      {undoing === null ? null : (
        <UndoApplicationDialog
          application={undoing}
          job={jobsById.get(undoing.jobId)}
          onUndo={async (application) => {
            await editor.remove(application);
            setNotice('Application removed. The job is back in New.');
          }}
          onClose={() => setUndoing(null)}
        />
      )}
    </section>
  );
}
