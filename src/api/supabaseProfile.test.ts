import { createFakeSupabase, failure, ok, opArgs, opNames } from './__fixtures__/fakeSupabase';
import { PROFILE_ROW } from './__fixtures__/rows';
import { buildProfile } from './supabaseProfile';
import type { ProfileInput } from './types';

const INPUT: ProfileInput = {
  displayName: 'Alex Example',
  headline: 'Engineer',
  summary: 'Fictional.',
  cv: {
    contact: { name: 'Alex Example', email: 'alex@example.com', phone: '', location: 'Amsterdam' },
    experience: [],
    education: [],
    skills: { has: [], lacks: [] },
    languages: [],
    links: [],
  },
  searchSettings: { keywords: [], cities: ['Amsterdam'], remote: 'any', englishOnly: false, minSeniority: 'any' },
};

function setup() {
  const fake = createFakeSupabase();
  return { fake, profile: buildProfile(fake.client) };
}

describe('profile.get', () => {
  it('returns the mapped profile or null before the first save', async () => {
    const { fake, profile } = setup();
    fake.respond(ok(PROFILE_ROW), ok(null));
    await expect(profile.get()).resolves.toMatchObject({ userId: 'u1', displayName: 'Alex Example', updatedAt: '2026-05-04T00:00:00+00:00' });
    expect(opNames(fake.queries[0])).toEqual(['select', 'maybeSingle']);
    await expect(profile.get()).resolves.toBeNull();
  });

  it('maps errors', async () => {
    const { fake, profile } = setup();
    fake.respond(failure({ message: 'TypeError: Failed to fetch', code: '' }));
    await expect(profile.get()).rejects.toMatchObject({ code: 'network' });
  });
});

describe('profile.save', () => {
  it('upserts on user_id and returns the stored profile', async () => {
    const { fake, profile } = setup();
    fake.respond(ok(PROFILE_ROW));
    await expect(profile.save(INPUT)).resolves.toMatchObject({ userId: 'u1', headline: 'Engineer' });
    expect(fake.queries[0].table).toBe('profiles');
    expect(opNames(fake.queries[0])).toEqual(['upsert', 'select', 'single']);
    expect(opArgs(fake.queries[0], 'upsert')).toEqual([
      {
        user_id: 'u1',
        display_name: 'Alex Example',
        headline: 'Engineer',
        summary: 'Fictional.',
        cv: INPUT.cv,
        search_settings: INPUT.searchSettings,
      },
      { onConflict: 'user_id' },
    ]);
  });

  it('needs a session and maps database errors', async () => {
    const { fake, profile } = setup();
    fake.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(profile.save(INPUT)).rejects.toMatchObject({ code: 'unauthenticated' });
    fake.respond(failure({ code: '23514', message: 'check violation' }));
    await expect(profile.save(INPUT)).rejects.toMatchObject({ code: 'validation' });
  });
});
