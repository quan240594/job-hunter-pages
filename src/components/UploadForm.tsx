import { useState } from 'react';
import type { SubmitEvent } from 'react';
import type { DocumentKind, DocumentMeta } from '../api';
import { useApi } from '../auth/context';
import { useAction } from '../hooks/useAction';
import { ACCEPT_ATTRIBUTE, TEMPLATE_LIMIT, validateUpload } from '../lib/documents';
import { KINDS, KIND_LABELS } from '../lib/labels';
import { SelectField } from './Field';

const KIND_OPTIONS = KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }));

interface UploadFormProps {
  /** How many templates the user has (all of them count toward the limit). */
  templateCount: number;
  onUploaded: (doc: DocumentMeta) => void;
}

/** PDF or DOCX up to 10 MB as cv, letter or template; at most 3 templates per user. */
export function UploadForm({ templateCount, onUploaded }: Readonly<UploadFormProps>) {
  const api = useApi();
  const [kind, setKind] = useState<DocumentKind>('cv');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const full = kind === 'template' && templateCount >= TEMPLATE_LIMIT;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = file === null ? 'Choose a file to upload.' : validateUpload(file);
    setProblem(found);
    if (found !== null || file === null) return;
    void run(async () => {
      onUploaded(await api.documents.upload(file, { kind }));
      setFile(null);
      setFileKey((key) => key + 1);
    });
  };

  const shown = problem ?? error;
  return (
    <form className="form card" noValidate onSubmit={submit} aria-label="Upload a document">
      <h2>Upload a document</h2>
      <p className="counter">
        <output>
          Templates: {templateCount}/{TEMPLATE_LIMIT}
        </output>
      </p>
      <SelectField label="Type" value={kind} options={KIND_OPTIONS} onChange={setKind} />
      <label className="field">
        <span>File (PDF or DOCX, up to 10 MB)</span>
        <input
          key={fileKey}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          onChange={(event) => setFile(event.target.files?.item(0) ?? null)}
        />
      </label>
      {full ? (
        <p className="muted">You have {TEMPLATE_LIMIT} templates. Delete one to upload another template.</p>
      ) : null}
      {shown === null ? null : (
        <p role="alert" className="form-error">
          {shown}
        </p>
      )}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy || full}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </form>
  );
}
