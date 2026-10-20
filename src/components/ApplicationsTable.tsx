import { useState } from 'react';
import type { Application, ApplicationPatch, ApplicationStage, DocumentMeta, Job } from '../api';
import { formatDate } from '../lib/format';
import { STAGES, STAGE_LABELS } from '../lib/labels';
import { usedCv, usedLetter } from '../lib/documents';
import type { UsedDocument } from '../lib/documents';
import { Badge } from './Badge';

export type PatchHandler = (application: Application, change: ApplicationPatch) => Promise<boolean>;

function DocumentCell({ used }: Readonly<{ used: UsedDocument | null }>) {
  if (used === null) return <span className="muted">Not recorded</span>;
  return (
    <>
      <span className="doc-title">{used.label}</span>
      {used.expired ? <Badge tone="warn">document expired</Badge> : null}
    </>
  );
}

interface NotesCellProps {
  application: Application;
  label: string;
  onSave: PatchHandler;
}

function NotesCell({ application, label, onSave }: Readonly<NotesCellProps>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const save = async () => {
    if (await onSave(application, { notes: draft.trim() })) setEditing(false);
  };

  if (!editing) {
    return (
      <>
        <span className="cell-notes">{application.notes === '' ? '—' : application.notes}</span>
        <button
          type="button"
          className="btn btn-small"
          aria-label={`Edit notes for ${label}`}
          onClick={() => {
            setDraft(application.notes);
            setEditing(true);
          }}
        >
          Edit notes
        </button>
      </>
    );
  }
  return (
    <>
      <label className="field">
        <span className="visually-hidden">Notes for {label}</span>
        <textarea rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} ref={(node) => node?.focus()} />
      </label>
      <div className="doc-actions">
        <button type="button" className="btn btn-small btn-primary" onClick={() => void save()}>
          Save notes
        </button>
        <button type="button" className="btn btn-small" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </>
  );
}

interface ApplicationRowProps {
  application: Application;
  job: Job | undefined;
  documents: readonly DocumentMeta[];
  now: Date;
  onPatch: PatchHandler;
  onUndo: (application: Application) => void;
}

function ApplicationRow({ application, job, documents, now, onPatch, onUndo }: Readonly<ApplicationRowProps>) {
  const title = job?.title ?? 'Unknown job';
  const label = job === undefined ? title : `${title} at ${job.company}`;
  return (
    <tr>
      <td data-label="Applied">
        <time dateTime={application.appliedAt}>{formatDate(application.appliedAt)}</time>
      </td>
      <td data-label="Company">{job?.company ?? '—'}</td>
      <td data-label="Title">{title}</td>
      <td data-label="CV used">
        <DocumentCell used={usedCv(application, documents, now)} />
      </td>
      <td data-label="Letter used">
        <DocumentCell used={usedLetter(application, documents, now)} />
      </td>
      <td data-label="Stage">
        <select
          aria-label={`Stage for ${label}`}
          value={application.stage}
          onChange={(event) => void onPatch(application, { stage: event.target.value as ApplicationStage })}
        >
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_LABELS[stage]}
            </option>
          ))}
        </select>
      </td>
      <td data-label="Notes">
        <NotesCell application={application} label={label} onSave={onPatch} />
      </td>
      <td data-label="Actions">
        <button
          type="button"
          className="btn btn-small btn-danger"
          aria-label={`Undo application for ${label}`}
          onClick={() => onUndo(application)}
        >
          Undo
        </button>
      </td>
    </tr>
  );
}

const COLUMNS = ['Applied', 'Company', 'Title', 'CV used', 'Letter used', 'Stage', 'Notes', 'Actions'];

interface ApplicationsTableProps extends Omit<ApplicationRowProps, 'application' | 'job'> {
  applications: readonly Application[];
  jobsById: ReadonlyMap<string, Job>;
}

export function ApplicationsTable({ applications, jobsById, ...handlers }: Readonly<ApplicationsTableProps>) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption className="visually-hidden">Applications</caption>
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
          {applications.map((application) => (
            <ApplicationRow key={application.id} application={application} job={jobsById.get(application.jobId)} {...handlers} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
