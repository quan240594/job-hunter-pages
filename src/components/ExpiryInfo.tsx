import type { DocumentMeta } from '../api';
import { formatDate } from '../lib/format';
import { RETENTION_MONTHS, expiryState } from '../lib/documents';
import { Badge } from './Badge';

/** Expiry line of a document: templates never expire, cv/letter get a warning under 30 days. */
export function ExpiryInfo({ doc, now }: Readonly<{ doc: DocumentMeta; now: Date }>) {
  const expiry = expiryState(doc, now);
  if (expiry.state === 'never') return <Badge tone="info">Never expires</Badge>;
  if (expiry.state === 'expired') return <Badge tone="bad">Expired, removed at the next cleanup</Badge>;
  const date = <time dateTime={doc.expiresAt as string}>{formatDate(doc.expiresAt as string)}</time>;
  const days = `in ${expiry.days} ${expiry.days === 1 ? 'day' : 'days'}`;
  if (expiry.state === 'soon') {
    return (
      <span>
        <Badge tone="warn">Expires {days}</Badge> on {date}
      </span>
    );
  }
  return (
    <span>
      Expires on {date} ({days})
    </span>
  );
}

export function RetentionNote() {
  return (
    <p className="muted">
      CVs and cover letters are deleted automatically {RETENTION_MONTHS} months after upload (applications keep the CV name).
      Templates never expire.
    </p>
  );
}
