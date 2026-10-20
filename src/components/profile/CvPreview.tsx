import { safeHttpUrl } from '../../lib/errors';
import type { EducationDraft, ExperienceDraft, ProfileDraft } from '../../lib/profile';
import { splitList } from '../../lib/profile';

function dates(startDate: string, endDate: string): string {
  return `${startDate.trim()} – ${endDate.trim() === '' ? 'Present' : endDate.trim()}`;
}

function Experience({ entry }: Readonly<{ entry: ExperienceDraft }>) {
  return (
    <div className="cv-entry">
      <p className="cv-row">
        <strong>{entry.role}</strong>
        <span>{dates(entry.startDate, entry.endDate)}</span>
      </p>
      <p className="cv-row cv-muted">
        <span>{entry.company}</span>
        <span>{entry.location}</span>
      </p>
      <ul>
        {splitList(entry.bullets, '\n', false).map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
    </div>
  );
}

function Education({ entry }: Readonly<{ entry: EducationDraft }>) {
  return (
    <div className="cv-entry">
      <p className="cv-row">
        <strong>{entry.degree}</strong>
        <span>{dates(entry.startDate, entry.endDate)}</span>
      </p>
      <p className="cv-row cv-muted">
        <span>{entry.school}</span>
        <span>{entry.location}</span>
      </p>
    </div>
  );
}

function ProfileLink({ label, url }: Readonly<{ label: string; url: string }>) {
  const href = safeHttpUrl(url.trim());
  if (href === null) return <span>{label}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

/** Printable CV built from the form state, so it updates while you type. */
export function CvPreview({ draft }: Readonly<{ draft: ProfileDraft }>) {
  const { contact } = draft;
  const contactLine = [contact.email, contact.phone, contact.location].map((part) => part.trim()).filter((part) => part !== '');
  const skills = splitList(draft.skillsHas, ',', true);
  return (
    <article className="cv-page" aria-label="CV preview">
      <header className="cv-head">
        <h3 className="cv-name">{contact.name.trim() === '' ? draft.displayName : contact.name}</h3>
        <p className="cv-headline">{draft.headline}</p>
        <p className="cv-contact">{contactLine.join(' · ')}</p>
      </header>
      {draft.summary.trim() === '' ? null : (
        <section className="cv-section">
          <h4>Profile</h4>
          <p>{draft.summary}</p>
        </section>
      )}
      {draft.experience.length === 0 ? null : (
        <section className="cv-section">
          <h4>Experience</h4>
          {draft.experience.map((entry) => (
            <Experience key={entry.key} entry={entry} />
          ))}
        </section>
      )}
      {skills.length === 0 ? null : (
        <section className="cv-section">
          <h4>Skills</h4>
          <ul className="cv-skills">
            {skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        </section>
      )}
      {draft.education.length === 0 ? null : (
        <section className="cv-section">
          <h4>Education</h4>
          {draft.education.map((entry) => (
            <Education key={entry.key} entry={entry} />
          ))}
        </section>
      )}
      {draft.languages.length === 0 ? null : (
        <section className="cv-section">
          <h4>Languages</h4>
          <ul className="cv-skills">
            {draft.languages.map((entry) => (
              <li key={entry.key}>
                {entry.name} {entry.level === '' ? '' : `(${entry.level})`}
              </li>
            ))}
          </ul>
        </section>
      )}
      {draft.links.length === 0 ? null : (
        <section className="cv-section">
          <h4>Links</h4>
          <ul className="cv-skills">
            {draft.links.map((entry) => (
              <li key={entry.key}>
                <ProfileLink label={entry.label} url={entry.url} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
