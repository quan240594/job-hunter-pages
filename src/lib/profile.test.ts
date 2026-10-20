import { makeProfile } from '../__fixtures__/uiFixtures';
import {
  DEFAULT_CITIES,
  draftFromProfile,
  draftToInput,
  emptyEducation,
  emptyExperience,
  emptyLanguage,
  emptyLink,
  looksLikeEmail,
  removeRow,
  splitList,
  updateRow,
  validateDraft,
} from './profile';
import type { ProfileDraft } from './profile';

function validDraft(): ProfileDraft {
  return draftFromProfile(makeProfile());
}

describe('draftFromProfile and draftToInput', () => {
  it('starts empty with the default cities', () => {
    const draft = draftFromProfile(null);
    expect(draft.displayName).toBe('');
    expect(draft.cities).toBe(DEFAULT_CITIES.join(', '));
    expect(draft.experience).toEqual([]);
    expect(draft.remote).toBe('hybrid-or-remote');
  });

  it('round-trips a stored profile', () => {
    const profile = makeProfile();
    expect(draftToInput(draftFromProfile(profile))).toEqual({
      displayName: profile.displayName,
      headline: profile.headline,
      summary: profile.summary,
      cv: profile.cv,
      searchSettings: profile.searchSettings,
    });
  });

  it('starts a stored education without an end date as current', () => {
    const profile = makeProfile();
    profile.cv.education[0].endDate = null;
    const draft = draftFromProfile(profile);
    expect(draft.education[0].endDate).toBe('');
    expect(draftToInput(draft).cv.education[0].endDate).toBeNull();
  });

  it('turns text lists into arrays, lower-cases skills and keeps a closed end date', () => {
    const draft = validDraft();
    draft.skillsHas = ' React, TypeScript ,react,, ';
    draft.keywords = 'Frontend,  Design Systems';
    draft.experience[0].endDate = '2023-05';
    draft.experience[0].bullets = 'One\n\n Two \nOne';
    const input = draftToInput(draft);
    expect(input.cv.skills.has).toEqual(['react', 'typescript']);
    expect(input.searchSettings.keywords).toEqual(['Frontend', 'Design Systems']);
    expect(input.cv.experience[0].endDate).toBe('2023-05');
    expect(input.cv.experience[0].bullets).toEqual(['One', 'Two']);
  });
});

describe('row helpers', () => {
  it('creates rows with unique keys', () => {
    const keys = [emptyExperience(), emptyEducation(), emptyLanguage(), emptyLink()].map((row) => row.key);
    expect(new Set(keys).size).toBe(4);
  });

  it('updates and removes a row by key', () => {
    const rows = [
      { key: 'a', name: 'one' },
      { key: 'b', name: 'two' },
    ];
    expect(updateRow(rows, 'b', { name: 'changed' })).toEqual([rows[0], { key: 'b', name: 'changed' }]);
    expect(removeRow(rows, 'a')).toEqual([rows[1]]);
  });

  it('splits lists', () => {
    expect(splitList('a, B ,a', ',', false)).toEqual(['a', 'B']);
  });
});

describe('looksLikeEmail', () => {
  it.each(['alex@example.com', 'a.b@mail.example.org'])('accepts %s', (value) => {
    expect(looksLikeEmail(value)).toBe(true);
  });

  it.each(['', 'alex', '@example.com', 'a@b@c.com', 'alex@example', 'alex@.com', 'alex@example.', 'a lex@example.com'])('rejects %j', (value) => {
    expect(looksLikeEmail(value)).toBe(false);
  });
});

describe('validateDraft', () => {
  it('accepts a complete profile', () => {
    expect(validateDraft(validDraft())).toEqual([]);
    expect(validateDraft(draftFromProfile(null))).toEqual(['Display name is required.', 'Contact name is required.']);
  });

  it('reports contact problems', () => {
    const draft = validDraft();
    draft.displayName = ' ';
    draft.contact.name = '';
    draft.contact.email = 'nope';
    expect(validateDraft(draft)).toEqual([
      'Display name is required.',
      'Contact name is required.',
      'Contact email is not a valid address.',
    ]);
  });

  it('reports experience and education problems', () => {
    const draft = validDraft();
    draft.experience = [{ ...emptyExperience(), startDate: '2021-13' }];
    draft.education = [{ ...emptyEducation(), startDate: '2020-05', endDate: '2019-01' }];
    expect(validateDraft(draft)).toEqual([
      'Experience 1: role is required.',
      'Experience 1: company is required.',
      'Experience 1: start date must look like 2021-03 or 2021-03-15.',
      'Education 1: degree is required.',
      'Education 1: school is required.',
      'Education 1: the end date is before the start date.',
    ]);
  });

  it('accepts full dates and flags a malformed end date', () => {
    const draft = validDraft();
    draft.experience[0].startDate = '2021-03-15';
    draft.experience[0].endDate = '2021-3';
    draft.education[0].endDate = '2018-06-30';
    expect(validateDraft(draft)).toEqual([
      'Experience 1: end date must look like 2021-03 or 2021-03-15 (leave empty if current).',
    ]);
  });

  it('does not compare an end date with an invalid start date', () => {
    const draft = validDraft();
    draft.experience[0].startDate = 'bad';
    draft.experience[0].endDate = '2000-01';
    expect(validateDraft(draft)).toEqual(['Experience 1: start date must look like 2021-03 or 2021-03-15.']);
  });

  it('reports language and link problems', () => {
    const draft = validDraft();
    draft.languages = [{ ...emptyLanguage(), name: ' ' }];
    draft.links = [{ ...emptyLink(), url: 'javascript:alert(1)' }];
    expect(validateDraft(draft)).toEqual([
      'Language 1: name is required.',
      'Link 1: label is required.',
      'Link 1: the URL must start with http:// or https://.',
    ]);
  });
});
