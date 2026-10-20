import type { EducationDraft, ExperienceDraft, ProfileDraft } from '../../lib/profile';
import {
  emptyEducation,
  emptyExperience,
  emptyLanguage,
  emptyLink,
  removeRow,
  updateRow,
} from '../../lib/profile';
import { TextAreaField, TextField } from '../Field';
import { RepeatableList } from './RepeatableList';

export interface SectionProps {
  draft: ProfileDraft;
  onChange: (patch: Partial<ProfileDraft>) => void;
}

interface DateRangeFieldsProps {
  startDate: string;
  endDate: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
}

function DateRangeFields({ startDate, endDate, onStart, onEnd }: Readonly<DateRangeFieldsProps>) {
  return (
    <>
      <TextField label="Start date" value={startDate} placeholder="YYYY-MM" onChange={onStart} required />
      <TextField label="End date (empty if current)" value={endDate} placeholder="YYYY-MM" onChange={onEnd} />
    </>
  );
}

export function PersonalSection({ draft, onChange }: Readonly<SectionProps>) {
  const setContact = (patch: Partial<ProfileDraft['contact']>) => onChange({ contact: { ...draft.contact, ...patch } });
  return (
    <fieldset className="form">
      <legend>About you</legend>
      <TextField label="Display name" value={draft.displayName} onChange={(displayName) => onChange({ displayName })} required />
      <TextField label="Headline" value={draft.headline} onChange={(headline) => onChange({ headline })} placeholder="e.g. Software engineer" />
      <TextAreaField label="Summary" rows={4} value={draft.summary} onChange={(summary) => onChange({ summary })} />
      <TextField label="Name on the CV" value={draft.contact.name} onChange={(name) => setContact({ name })} required />
      <TextField label="Email" type="email" value={draft.contact.email} onChange={(email) => setContact({ email })} />
      <TextField label="Phone" type="tel" value={draft.contact.phone} onChange={(phone) => setContact({ phone })} />
      <TextField label="Location" value={draft.contact.location} onChange={(location) => setContact({ location })} />
    </fieldset>
  );
}

export function ExperienceSection({ draft, onChange }: Readonly<SectionProps>) {
  const patchRow = (key: string, patch: Partial<ExperienceDraft>) => onChange({ experience: updateRow(draft.experience, key, patch) });
  return (
    <RepeatableList
      legend="Experience"
      itemLabel="Experience"
      items={draft.experience}
      addLabel="Add experience"
      onAdd={() => onChange({ experience: [...draft.experience, emptyExperience()] })}
      onRemove={(key) => onChange({ experience: removeRow(draft.experience, key) })}
    >
      {(entry) => (
        <>
          <TextField label="Role" value={entry.role} onChange={(role) => patchRow(entry.key, { role })} required />
          <TextField label="Company" value={entry.company} onChange={(company) => patchRow(entry.key, { company })} required />
          <TextField label="Location" value={entry.location} onChange={(location) => patchRow(entry.key, { location })} />
          <DateRangeFields
            startDate={entry.startDate}
            endDate={entry.endDate}
            onStart={(startDate) => patchRow(entry.key, { startDate })}
            onEnd={(endDate) => patchRow(entry.key, { endDate })}
          />
          <TextAreaField label="Highlights (one per line)" value={entry.bullets} onChange={(bullets) => patchRow(entry.key, { bullets })} />
        </>
      )}
    </RepeatableList>
  );
}

export function EducationSection({ draft, onChange }: Readonly<SectionProps>) {
  const patchRow = (key: string, patch: Partial<EducationDraft>) => onChange({ education: updateRow(draft.education, key, patch) });
  return (
    <RepeatableList
      legend="Education"
      itemLabel="Education"
      items={draft.education}
      addLabel="Add education"
      onAdd={() => onChange({ education: [...draft.education, emptyEducation()] })}
      onRemove={(key) => onChange({ education: removeRow(draft.education, key) })}
    >
      {(entry) => (
        <>
          <TextField label="Degree" value={entry.degree} onChange={(degree) => patchRow(entry.key, { degree })} required />
          <TextField label="School" value={entry.school} onChange={(school) => patchRow(entry.key, { school })} required />
          <TextField label="Location" value={entry.location} onChange={(location) => patchRow(entry.key, { location })} />
          <DateRangeFields
            startDate={entry.startDate}
            endDate={entry.endDate}
            onStart={(startDate) => patchRow(entry.key, { startDate })}
            onEnd={(endDate) => patchRow(entry.key, { endDate })}
          />
        </>
      )}
    </RepeatableList>
  );
}

export function SkillsSection({ draft, onChange }: Readonly<SectionProps>) {
  return (
    <fieldset className="form">
      <legend>Skills</legend>
      <TextAreaField
        label="Skills you have (comma-separated)"
        rows={2}
        value={draft.skillsHas}
        onChange={(skillsHas) => onChange({ skillsHas })}
      />
      <TextAreaField
        label="Skills you lack (comma-separated, used to warn about gaps)"
        rows={2}
        value={draft.skillsLacks}
        onChange={(skillsLacks) => onChange({ skillsLacks })}
      />
    </fieldset>
  );
}

export function LanguagesSection({ draft, onChange }: Readonly<SectionProps>) {
  return (
    <RepeatableList
      legend="Languages"
      itemLabel="Language"
      items={draft.languages}
      addLabel="Add language"
      onAdd={() => onChange({ languages: [...draft.languages, emptyLanguage()] })}
      onRemove={(key) => onChange({ languages: removeRow(draft.languages, key) })}
    >
      {(entry) => (
        <>
          <TextField
            label="Language"
            value={entry.name}
            onChange={(name) => onChange({ languages: updateRow(draft.languages, entry.key, { name }) })}
            required
          />
          <TextField
            label="Level"
            value={entry.level}
            placeholder="e.g. native, C1"
            onChange={(level) => onChange({ languages: updateRow(draft.languages, entry.key, { level }) })}
          />
        </>
      )}
    </RepeatableList>
  );
}

export function LinksSection({ draft, onChange }: Readonly<SectionProps>) {
  return (
    <RepeatableList
      legend="Links"
      itemLabel="Link"
      items={draft.links}
      addLabel="Add link"
      onAdd={() => onChange({ links: [...draft.links, emptyLink()] })}
      onRemove={(key) => onChange({ links: removeRow(draft.links, key) })}
    >
      {(entry) => (
        <>
          <TextField
            label="Label"
            value={entry.label}
            placeholder="e.g. Portfolio"
            onChange={(label) => onChange({ links: updateRow(draft.links, entry.key, { label }) })}
            required
          />
          <TextField
            label="URL"
            type="url"
            value={entry.url}
            placeholder="https://"
            onChange={(url) => onChange({ links: updateRow(draft.links, entry.key, { url }) })}
            required
          />
        </>
      )}
    </RepeatableList>
  );
}
