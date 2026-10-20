import { useId, useState } from 'react';
import type { SubmitEvent } from 'react';
import type { Job, ManualJobInput } from '../api';
import { useApi } from '../auth/context';
import { useAction } from '../hooks/useAction';
import { isAbsoluteHttpUrl } from '../lib/errors';
import { Dialog } from './Dialog';
import { TextAreaField, TextField } from './Field';

interface AddJobDialogProps {
  onAdded: (job: Job) => void;
  onClose: () => void;
}

interface Draft {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
}

const EMPTY: Draft = { title: '', company: '', location: '', url: '', description: '' };

function problemOf(draft: Draft): string | null {
  if (draft.title.trim() === '' || draft.company.trim() === '' || draft.location.trim() === '') {
    return 'Title, company and location are required.';
  }
  const url = draft.url.trim();
  return url === '' || isAbsoluteHttpUrl(url) ? null : 'The link must start with http:// or https://.';
}

function toInput(draft: Draft): ManualJobInput {
  const url = draft.url.trim();
  return {
    title: draft.title.trim(),
    company: draft.company.trim(),
    location: draft.location.trim(),
    description: draft.description.trim(),
    ...(url === '' ? {} : { url }),
  };
}

/** Quick form to add a job the scraper did not find. The API rejects a duplicate with a 'conflict' message. */
export function AddJobDialog({ onAdded, onClose }: Readonly<AddJobDialogProps>) {
  const api = useApi();
  const formId = useId();
  const [draft, setDraft] = useState(EMPTY);
  const [problem, setProblem] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = problemOf(draft);
    setProblem(found);
    if (found === null) void run(async () => onAdded(await api.jobs.addManual(toInput(draft))));
  };

  const footer = (
    <>
      <button type="button" className="btn" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" form={formId} className="btn btn-primary" disabled={busy}>
        {busy ? 'Adding…' : 'Add job'}
      </button>
    </>
  );
  const shown = problem ?? error;

  return (
    <Dialog title="Add a job manually" onClose={onClose} footer={footer}>
      <form id={formId} className="form" noValidate onSubmit={submit}>
        <TextField label="Job title" value={draft.title} onChange={(title) => set({ title })} required dialogAutofocus />
        <TextField label="Company" value={draft.company} onChange={(company) => set({ company })} required />
        <TextField label="Location" value={draft.location} onChange={(location) => set({ location })} required />
        <TextField label="Link to the posting" type="url" value={draft.url} onChange={(url) => set({ url })} />
        <TextAreaField label="Description" rows={5} value={draft.description} onChange={(description) => set({ description })} />
        {shown === null ? null : (
          <p role="alert" className="form-error">
            {shown}
          </p>
        )}
      </form>
    </Dialog>
  );
}
