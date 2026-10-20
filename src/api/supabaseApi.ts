// The real DataApi: supabase-js (Auth, PostgREST under RLS, private Storage bucket) plus the `admin-users` Edge Function.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '../lib/supabaseClient';
import { browserAuthLinkEnv, consumeAuthLink, type AuthLinkEnv } from './authLink';
import type { DataApi } from './dataApi';
import { buildAdmin } from './supabaseAdmin';
import { buildAuth } from './supabaseAuth';
import { buildDocuments } from './supabaseDocuments';
import { buildApplications, buildJobs } from './supabaseJobs';
import { buildProfile } from './supabaseProfile';

export interface SupabaseApiOptions {
  url: string;
  anonKey: string;
  /** Tests inject a fake client; defaults to the real one built from url + anonKey. */
  client?: SupabaseClient;
  /** Defaults to crypto.randomUUID. */
  newId?: () => string;
  /** Defaults to the browser location/history. */
  authLinkEnv?: AuthLinkEnv;
}

export function createSupabaseApi(options: SupabaseApiOptions): DataApi {
  const client = options.client ?? createSupabaseClient(options);
  const env = options.authLinkEnv ?? browserAuthLinkEnv;
  const newId = options.newId ?? (() => crypto.randomUUID());

  let linkConsumed: Promise<void> | undefined;
  const ready = () => (linkConsumed ??= consumeAuthLink(client, env));

  const jobs = buildJobs(client);
  const applications = buildApplications(client);
  const profile = buildProfile(client);
  const documents = buildDocuments(client, newId);

  const collectExport = async () => {
    const [profileData, jobList, applicationList, documentList] = await Promise.all([
      profile.get(),
      jobs.list(),
      applications.list(),
      documents.list(),
    ]);
    return { profile: profileData, jobs: jobList, applications: applicationList, documents: documentList };
  };

  return {
    auth: buildAuth(client, { ready, collectExport }),
    jobs,
    applications,
    profile,
    documents,
    admin: buildAdmin(client),
  };
}
