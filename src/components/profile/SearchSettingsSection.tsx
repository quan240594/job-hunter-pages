import type { SearchSettings } from '../../api';
import { MIN_SENIORITY_LABELS, REMOTE_LABELS } from '../../lib/profile';
import { SelectField, TextAreaField } from '../Field';
import type { SectionProps } from './CvSections';

const REMOTE_OPTIONS = (Object.keys(REMOTE_LABELS) as SearchSettings['remote'][]).map((value) => ({
  value,
  label: REMOTE_LABELS[value],
}));
const SENIORITY_OPTIONS = (Object.keys(MIN_SENIORITY_LABELS) as SearchSettings['minSeniority'][]).map((value) => ({
  value,
  label: MIN_SENIORITY_LABELS[value],
}));

export function SearchSettingsSection({ draft, onChange }: Readonly<SectionProps>) {
  return (
    <fieldset className="form">
      <legend>Search settings</legend>
      <p className="muted">
        These preferences are stored for later. Automated job scraping per user comes in a later phase; for now they do not
        change which jobs you see. Add jobs manually in the meantime.
      </p>
      <TextAreaField
        label="Keywords (comma-separated)"
        rows={2}
        value={draft.keywords}
        onChange={(keywords) => onChange({ keywords })}
      />
      <TextAreaField label="Cities (comma-separated)" rows={2} value={draft.cities} onChange={(cities) => onChange({ cities })} />
      <SelectField
        label="Remote preference"
        value={draft.remote}
        options={REMOTE_OPTIONS}
        onChange={(remote) => onChange({ remote })}
      />
      <label className="check">
        <input type="checkbox" checked={draft.englishOnly} onChange={(event) => onChange({ englishOnly: event.target.checked })} />
        <span>English-language postings only</span>
      </label>
      <SelectField
        label="Minimum seniority"
        value={draft.minSeniority}
        options={SENIORITY_OPTIONS}
        onChange={(minSeniority) => onChange({ minSeniority })}
      />
    </fieldset>
  );
}
