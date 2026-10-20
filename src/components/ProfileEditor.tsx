import { useState } from 'react';
import type { SubmitEvent } from 'react';
import type { Profile } from '../api';
import { useApi } from '../auth/context';
import { useAction } from '../hooks/useAction';
import { formatDate } from '../lib/format';
import { draftFromProfile, draftToInput, validateDraft } from '../lib/profile';
import type { ProfileDraft } from '../lib/profile';
import { CvPreview } from './profile/CvPreview';
import {
  EducationSection,
  ExperienceSection,
  LanguagesSection,
  LinksSection,
  PersonalSection,
  SkillsSection,
} from './profile/CvSections';
import { SearchSettingsSection } from './profile/SearchSettingsSection';

/** Edits the structured CV profile and search settings, with a live printable CV preview. */
export function ProfileEditor({ profile }: Readonly<{ profile: Profile | null }>) {
  const api = useApi();
  const [draft, setDraft] = useState(() => draftFromProfile(profile));
  const [problems, setProblems] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(profile?.updatedAt ?? null);
  const { busy, error, run } = useAction();
  const onChange = (patch: Partial<ProfileDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateDraft(draft);
    setProblems(found);
    if (found.length > 0) return;
    void run(async () => {
      const saved = await api.profile.save(draftToInput(draft));
      setSavedAt(saved.updatedAt);
    });
  };

  const sections = { draft, onChange };
  return (
    <div className="profile-layout">
      <form className="form no-print" noValidate onSubmit={submit} aria-label="Profile">
        <PersonalSection {...sections} />
        <ExperienceSection {...sections} />
        <EducationSection {...sections} />
        <SkillsSection {...sections} />
        <LanguagesSection {...sections} />
        <LinksSection {...sections} />
        <SearchSettingsSection {...sections} />
        {problems.length === 0 ? null : (
          <div role="alert" className="form-error">
            <p>Fix the following before saving:</p>
            <ul>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
        {error === null ? null : (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="card-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
          <output>{savedAt === null ? 'Not saved yet.' : `Last saved ${formatDate(savedAt)}.`}</output>
        </div>
      </form>
      <section aria-labelledby="cv-preview-heading" className="print-area">
        <div className="preview-head no-print">
          <h2 id="cv-preview-heading">CV preview</h2>
          <button type="button" className="btn btn-small" onClick={() => window.print()}>
            Print CV
          </button>
        </div>
        <CvPreview draft={draft} />
      </section>
    </div>
  );
}
