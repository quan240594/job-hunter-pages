import { useState } from 'react';
import { useApi } from '../auth/context';
import type { ApplicationListQuery, JobListQuery } from '../api';
import { useAsync } from './useAsync';

/** The moment the screen was opened; used for expiry countdowns so a render never reads the clock. */
export function useNow(): Date {
  const [now] = useState(() => new Date());
  return now;
}

/** Jobs of the signed-in user. `key` encodes the query, so a new query reloads. */
export function useJobs(query: JobListQuery) {
  const api = useApi();
  return useAsync(() => api.jobs.list(query), `jobs|${JSON.stringify(query)}`);
}

export function useApplications(query: ApplicationListQuery) {
  const api = useApi();
  return useAsync(() => api.applications.list(query), `applications|${JSON.stringify(query)}`);
}

export function useDocuments() {
  const api = useApi();
  return useAsync(() => api.documents.list(), 'documents');
}

export function useStandardTemplates() {
  const api = useApi();
  return useAsync(() => api.documents.standardTemplates(), 'standard-templates');
}

export function useProfile() {
  const api = useApi();
  return useAsync(() => api.profile.get(), 'profile');
}
