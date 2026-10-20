import { useId, useState } from 'react';
import type { SubmitEvent } from 'react';
import type { Application, DocumentMeta, Job } from '../api';
import { useApi } from '../auth/context';
import { useAction } from '../hooks/useAction';
import { useNow } from '../hooks/useData';
import { buildApplyInput, documentsOfKind, isLive } from '../lib/documents';
import { Dialog } from './Dialog';
import { TextAreaField } from './Field';
import { DocumentSelect } from './DocumentSelect';

interface ApplyDialogProps {
  job: Job;
  /** All documents of the user; expired ones are left out of the pickers. */
  documents: readonly DocumentMeta[];
  onApplied: (application: Application) => void;
  onClose: () => void;
}

/** The first recommended document of a kind (recommendations come from the job), or none. */
function recommendedId(job: Job, documents: readonly DocumentMeta[]): string {
  return documents.find((doc) => job.recommendedDocumentIds.includes(doc.id))?.id ?? '';
}

export function ApplyDialog({ job, documents, onApplied, onClose }: Readonly<ApplyDialogProps>) {
  const api = useApi();
  const now = useNow();
  const formId = useId();
  const live = documents.filter((doc) => isLive(doc, now));
  const cvs = documentsOfKind(live, 'cv');
  const letters = documentsOfKind(live, 'letter');
  const [cvId, setCvId] = useState(() => recommendedId(job, cvs));
  const [letterId, setLetterId] = useState(() => recommendedId(job, letters));
  const [notes, setNotes] = useState('');
  const { busy, error, run } = useAction();

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => onApplied(await api.applications.apply(buildApplyInput(job.id, { cvId, letterId, notes }, live))));
  };

  const footer = (
    <>
      <button type="button" className="btn" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" form={formId} className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save application'}
      </button>
    </>
  );

  return (
    <Dialog title={`Mark as applied: ${job.title} at ${job.company}`} onClose={onClose} footer={footer}>
      <form id={formId} className="form" noValidate onSubmit={submit}>
        <DocumentSelect label="CV used" documents={cvs} value={cvId} onChange={setCvId} emptyLabel="No CV recorded" />
        <DocumentSelect
          label="Cover letter used"
          documents={letters}
          value={letterId}
          onChange={setLetterId}
          emptyLabel="No cover letter recorded"
        />
        <TextAreaField label="Notes" value={notes} onChange={setNotes} />
        {error === null ? null : (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
