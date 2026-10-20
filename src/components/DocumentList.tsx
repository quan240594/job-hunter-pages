import type { DocumentMeta } from '../api';
import { formatBytes, formatDate } from '../lib/format';
import { KIND_LABELS } from '../lib/labels';
import { Badge } from './Badge';
import { ExpiryInfo } from './ExpiryInfo';

interface DocumentListProps {
  documents: readonly DocumentMeta[];
  now: Date;
  busy: boolean;
  onDownload: (doc: DocumentMeta) => void;
  onDelete: (doc: DocumentMeta) => void;
}

export function DocumentList({ documents, now, busy, onDownload, onDelete }: Readonly<DocumentListProps>) {
  return (
    <ul className="card-list" aria-label="Your documents">
      {documents.map((doc) => (
        <li key={doc.id} className="card">
          <h3 className="doc-name">{doc.filename}</h3>
          <p>
            <Badge tone={doc.kind === 'template' ? 'info' : 'neutral'}>{KIND_LABELS[doc.kind]}</Badge>{' '}
            <span className="muted">
              {formatBytes(doc.sizeBytes)} · uploaded {formatDate(doc.createdAt)}
            </span>
          </p>
          <p>
            <ExpiryInfo doc={doc} now={now} />
          </p>
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-small"
              disabled={busy}
              aria-label={`Download ${doc.filename}`}
              onClick={() => onDownload(doc)}
            >
              Download
            </button>
            <button
              type="button"
              className="btn btn-small btn-danger"
              disabled={busy}
              aria-label={`Delete ${doc.filename}`}
              onClick={() => onDelete(doc)}
            >
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
