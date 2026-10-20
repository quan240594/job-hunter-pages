import type { CvContact, ProfileInput, SearchSettings } from '../api';
import { isDateInput } from './format';
import { isAbsoluteHttpUrl } from './errors';

/** Form state of the profile editor: lists are edited as text, rows carry a stable key for React. */
export interface ExperienceDraft {
  key: string;
  role: string;
  company: string;
  location: string;
  startDate: string;
  /** Empty = current position. */
  endDate: string;
  /** One bullet per line. */
  bullets: string;
}
export interface EducationDraft {
  key: string;
  degree: string;
  school: string;
  location: string;
  startDate: string;
  endDate: string;
}
export interface LanguageDraft {
  key: string;
  name: string;
  level: string;
}
export interface LinkDraft {
  key: string;
  label: string;
  url: string;
}

export interface ProfileDraft {
  displayName: string;
  headline: string;
  summary: string;
  contact: CvContact;
  experience: ExperienceDraft[];
  education: EducationDraft[];
  /** Comma-separated. */
  skillsHas: string;
  skillsLacks: string;
  languages: LanguageDraft[];
  links: LinkDraft[];
  /** Comma-separated. */
  keywords: string;
  cities: string;
  remote: SearchSettings['remote'];
  englishOnly: boolean;
  minSeniority: SearchSettings['minSeniority'];
}

export const DEFAULT_CITIES = ['Amsterdam', 'Rotterdam', 'Den Haag'];
export const MIN_SENIORITY_LABELS: Record<SearchSettings['minSeniority'], string> = {
  any: 'Any level',
  mid: 'Mid-level',
  senior: 'Senior',
  staff: 'Staff',
};
export const REMOTE_LABELS: Record<SearchSettings['remote'], string> = {
  'hybrid-or-remote': 'Hybrid or remote only',
  any: 'Any (including office-first)',
};

let rowCounter = 0;
function nextKey(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

export const emptyExperience = (): ExperienceDraft => ({
  key: nextKey(),
  role: '',
  company: '',
  location: '',
  startDate: '',
  endDate: '',
  bullets: '',
});
export const emptyEducation = (): EducationDraft => ({
  key: nextKey(),
  degree: '',
  school: '',
  location: '',
  startDate: '',
  endDate: '',
});
export const emptyLanguage = (): LanguageDraft => ({ key: nextKey(), name: '', level: '' });
export const emptyLink = (): LinkDraft => ({ key: nextKey(), label: '', url: '' });

export function joinList(items: readonly string[]): string {
  return items.join(', ');
}

/** Trimmed, non-empty, de-duplicated items of a text list. */
export function splitList(text: string, separator: string, lowerCase: boolean): string[] {
  const items = text
    .split(separator)
    .map((item) => (lowerCase ? item.trim().toLowerCase() : item.trim()))
    .filter((item) => item !== '');
  return [...new Set(items)];
}

export function updateRow<T extends { key: string }>(rows: readonly T[], key: string, patch: Partial<T>): T[] {
  return rows.map((row) => (row.key === key ? { ...row, ...patch } : row));
}

export function removeRow<T extends { key: string }>(rows: readonly T[], key: string): T[] {
  return rows.filter((row) => row.key !== key);
}

export function draftFromProfile(profile: ProfileInput | null): ProfileDraft {
  if (profile === null) {
    return {
      displayName: '',
      headline: '',
      summary: '',
      contact: { name: '', email: '', phone: '', location: '' },
      experience: [],
      education: [],
      skillsHas: '',
      skillsLacks: '',
      languages: [],
      links: [],
      keywords: '',
      cities: joinList(DEFAULT_CITIES),
      remote: 'hybrid-or-remote',
      englishOnly: false,
      minSeniority: 'any',
    };
  }
  const { cv, searchSettings } = profile;
  return {
    displayName: profile.displayName,
    headline: profile.headline,
    summary: profile.summary,
    contact: { ...cv.contact },
    experience: cv.experience.map((entry) => ({
      ...entry,
      key: nextKey(),
      endDate: entry.endDate ?? '',
      bullets: entry.bullets.join('\n'),
    })),
    education: cv.education.map((entry) => ({ ...entry, key: nextKey(), endDate: entry.endDate ?? '' })),
    skillsHas: joinList(cv.skills.has),
    skillsLacks: joinList(cv.skills.lacks),
    languages: cv.languages.map((entry) => ({ ...entry, key: nextKey() })),
    links: cv.links.map((entry) => ({ ...entry, key: nextKey() })),
    keywords: joinList(searchSettings.keywords),
    cities: joinList(searchSettings.cities),
    remote: searchSettings.remote,
    englishOnly: searchSettings.englishOnly,
    minSeniority: searchSettings.minSeniority,
  };
}

const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** Converts a (validated) draft to what profile.save() takes. */
export function draftToInput(draft: ProfileDraft): ProfileInput {
  return {
    displayName: draft.displayName.trim(),
    headline: draft.headline.trim(),
    summary: draft.summary.trim(),
    cv: {
      contact: {
        name: draft.contact.name.trim(),
        email: draft.contact.email.trim(),
        phone: draft.contact.phone.trim(),
        location: draft.contact.location.trim(),
      },
      experience: draft.experience.map((entry) => ({
        role: entry.role.trim(),
        company: entry.company.trim(),
        location: entry.location.trim(),
        startDate: entry.startDate.trim(),
        endDate: orNull(entry.endDate),
        bullets: splitList(entry.bullets, '\n', false),
      })),
      education: draft.education.map((entry) => ({
        degree: entry.degree.trim(),
        school: entry.school.trim(),
        location: entry.location.trim(),
        startDate: entry.startDate.trim(),
        endDate: orNull(entry.endDate),
      })),
      skills: { has: splitList(draft.skillsHas, ',', true), lacks: splitList(draft.skillsLacks, ',', true) },
      languages: draft.languages.map((entry) => ({ name: entry.name.trim(), level: entry.level.trim() })),
      links: draft.links.map((entry) => ({ label: entry.label.trim(), url: entry.url.trim() })),
    },
    searchSettings: {
      keywords: splitList(draft.keywords, ',', false),
      cities: splitList(draft.cities, ',', false),
      remote: draft.remote,
      englishOnly: draft.englishOnly,
      minSeniority: draft.minSeniority,
    },
  };
}

/** YYYY-MM or YYYY-MM-DD. */
function isPartialDate(value: string): boolean {
  if (value.length === 7) return isDateInput(`${value}-01`);
  return value.length === 10 && isDateInput(value);
}

export function looksLikeEmail(value: string): boolean {
  const at = value.indexOf('@');
  if (at < 1 || at !== value.lastIndexOf('@') || /\s/.test(value)) return false;
  const domain = value.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

function dateProblems(label: string, startDate: string, endDate: string): string[] {
  const start = startDate.trim();
  const end = endDate.trim();
  const problems: string[] = [];
  if (!isPartialDate(start)) problems.push(`${label}: start date must look like 2021-03 or 2021-03-15.`);
  if (end !== '' && !isPartialDate(end)) problems.push(`${label}: end date must look like 2021-03 or 2021-03-15 (leave empty if current).`);
  else if (end !== '' && isPartialDate(start) && end.slice(0, 7) < start.slice(0, 7)) {
    problems.push(`${label}: the end date is before the start date.`);
  }
  return problems;
}

function requiredProblems(label: string, fields: Record<string, string>): string[] {
  return Object.entries(fields)
    .filter(([, value]) => value.trim() === '')
    .map(([name]) => `${label}: ${name} is required.`);
}

function basicProblems(draft: ProfileDraft): string[] {
  const problems: string[] = [];
  if (draft.displayName.trim() === '') problems.push('Display name is required.');
  if (draft.contact.name.trim() === '') problems.push('Contact name is required.');
  const email = draft.contact.email.trim();
  if (email !== '' && !looksLikeEmail(email)) problems.push('Contact email is not a valid address.');
  return problems;
}

function experienceProblems(entries: readonly ExperienceDraft[]): string[] {
  return entries.flatMap((entry, index) => {
    const label = `Experience ${index + 1}`;
    return [
      ...requiredProblems(label, { role: entry.role, company: entry.company }),
      ...dateProblems(label, entry.startDate, entry.endDate),
    ];
  });
}

function educationProblems(entries: readonly EducationDraft[]): string[] {
  return entries.flatMap((entry, index) => {
    const label = `Education ${index + 1}`;
    return [
      ...requiredProblems(label, { degree: entry.degree, school: entry.school }),
      ...dateProblems(label, entry.startDate, entry.endDate),
    ];
  });
}

function languageAndLinkProblems(draft: ProfileDraft): string[] {
  const languages = draft.languages.flatMap((entry, index) => requiredProblems(`Language ${index + 1}`, { name: entry.name }));
  const links = draft.links.flatMap((entry, index) => {
    const label = `Link ${index + 1}`;
    const problems = requiredProblems(label, { label: entry.label });
    return isAbsoluteHttpUrl(entry.url.trim()) ? problems : [...problems, `${label}: the URL must start with http:// or https://.`];
  });
  return [...languages, ...links];
}

/** Human-readable problems; an empty list means the draft can be saved. */
export function validateDraft(draft: ProfileDraft): string[] {
  return [
    ...basicProblems(draft),
    ...experienceProblems(draft.experience),
    ...educationProblems(draft.education),
    ...languageAndLinkProblems(draft),
  ];
}
