import type { DocumentMeta } from '../api';

interface DocumentSelectProps {
  label: string;
  documents: readonly DocumentMeta[];
  value: string;
  onChange: (value: string) => void;
  emptyLabel: string;
}

export function DocumentSelect({ label, documents, value, onChange, emptyLabel }: Readonly<DocumentSelectProps>) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{emptyLabel}</option>
        {documents.map((doc) => (
          <option key={doc.id} value={doc.id}>
            {doc.filename}
          </option>
        ))}
      </select>
    </label>
  );
}
