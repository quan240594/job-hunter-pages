import type { ProfileApi } from './dataApi';
import { profileFromRow, profileToRow } from './mappers';
import { currentUserId, guarded, orThrow, type Client } from './supabaseCommon';
import type { Profile, ProfileInput } from './types';

async function getProfile(client: Client): Promise<Profile | null> {
  const row = orThrow(await client.from('profiles').select('*').maybeSingle());
  return row === null ? null : profileFromRow(row);
}

async function saveProfile(client: Client, input: ProfileInput): Promise<Profile> {
  const userId = await currentUserId(client);
  const row = profileToRow(userId, input);
  return profileFromRow(orThrow(await client.from('profiles').upsert(row, { onConflict: 'user_id' }).select('*').single()));
}

export function buildProfile(client: Client): ProfileApi {
  return {
    get: guarded(() => getProfile(client)),
    save: guarded((input: ProfileInput) => saveProfile(client, input)),
  };
}
