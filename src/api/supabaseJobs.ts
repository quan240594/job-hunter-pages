import type { ApplicationsApi, JobsApi } from './dataApi';
import { prepareManualJob, MANUAL_SOURCE } from './manualJob';
import {
  applicationFromRow,
  applicationPatchToRow,
  applicationToInsertRow,
  jobFromRow,
  manualJobToRow,
  textColumn,
} from './mappers';
import { jobId } from './jobId';
import { currentUserId, foundOrThrow, guarded, orThrow, rowsOf, type Client } from './supabaseCommon';
import { mapError } from './supabaseErrors';
import type {
  Application,
  ApplicationListQuery,
  ApplicationPatch,
  ApplyInput,
  Job,
  JobListQuery,
  JobStatus,
  ManualJobInput,
} from './types';

const SEARCH_COLUMNS = ['title', 'company', 'location'] as const;

/**
 * A PostgREST `or` filter value for a case-insensitive substring match. The term is escaped for LIKE (\\ % _) and then
 * quoted for the filter grammar, so commas, dots and parentheses in user input cannot change the query.
 */
export function searchFilter(term: string): string {
  const likePattern = term.replaceAll('\\', String.raw`\\`).replaceAll('%', String.raw`\%`).replaceAll('_', String.raw`\_`);
  const quoted = likePattern.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`);
  return SEARCH_COLUMNS.map((column) => `${column}.ilike."%${quoted}%"`).join(',');
}

async function listJobs(client: Client, query: JobListQuery = {}): Promise<Job[]> {
  let request = client.from('jobs').select('*');
  if (query.status !== undefined) request = request.eq('status', query.status);
  if (query.since !== undefined) request = request.gte('first_seen_at', query.since);
  if (query.until !== undefined) request = request.lte('first_seen_at', query.until);
  const search = query.search?.trim() ?? '';
  if (search !== '') request = request.or(searchFilter(search));
  return rowsOf(orThrow(await request.order('first_seen_at', { ascending: false }))).map(jobFromRow);
}

async function getJob(client: Client, id: string): Promise<Job> {
  const row = orThrow(await client.from('jobs').select('*').eq('id', id).maybeSingle());
  return jobFromRow(foundOrThrow(row, 'Job'));
}

async function setJobStatus(client: Client, id: string, status: JobStatus): Promise<Job> {
  const row = orThrow(await client.from('jobs').update({ status }).eq('id', id).select('*').maybeSingle());
  return jobFromRow(foundOrThrow(row, 'Job'));
}

async function addManualJob(client: Client, input: ManualJobInput): Promise<Job> {
  const prepared = prepareManualJob(input);
  const userId = await currentUserId(client);
  const id = jobId(prepared.company, prepared.title, prepared.location);
  const row = manualJobToRow(userId, id, prepared, MANUAL_SOURCE);
  return jobFromRow(orThrow(await client.from('jobs').insert(row).select('*').single()));
}

export function buildJobs(client: Client): JobsApi {
  return {
    list: guarded((query?: JobListQuery) => listJobs(client, query)),
    get: guarded((id: string) => getJob(client, id)),
    setStatus: guarded((id: string, status: JobStatus) => setJobStatus(client, id, status)),
    addManual: guarded((input: ManualJobInput) => addManualJob(client, input)),
  };
}

// ------------------------------------------------------------------ applications

async function listApplications(client: Client, query: ApplicationListQuery = {}): Promise<Application[]> {
  let request = client.from('applications').select('*');
  if (query.since !== undefined) request = request.gte('applied_at', query.since);
  if (query.until !== undefined) request = request.lte('applied_at', query.until);
  return rowsOf(orThrow(await request.order('applied_at', { ascending: false }))).map(applicationFromRow);
}

// Two writes (application row, then job status). If the second fails the first is compensated, so a failure never
// leaves an application next to a job that still says 'new'.
async function applyToJob(client: Client, input: ApplyInput): Promise<Application> {
  const userId = await currentUserId(client);
  foundOrThrow(orThrow(await client.from('jobs').select('id').eq('id', input.jobId).maybeSingle()), 'Job');
  const application = applicationFromRow(
    orThrow(await client.from('applications').insert(applicationToInsertRow(userId, input)).select('*').single()),
  );
  const { error } = await client.from('jobs').update({ status: 'applied' }).eq('id', input.jobId);
  if (error) {
    await client.from('applications').delete().eq('id', application.id);
    throw mapError(error);
  }
  return application;
}

async function updateApplication(client: Client, id: string, patch: ApplicationPatch): Promise<Application> {
  const changes = applicationPatchToRow(patch);
  const table = client.from('applications');
  const request = Object.keys(changes).length === 0 ? table.select('*') : table.update(changes).select('*');
  const row = orThrow(await request.eq('id', id).maybeSingle());
  return applicationFromRow(foundOrThrow(row, 'Application'));
}

async function removeApplication(client: Client, id: string): Promise<void> {
  const found = orThrow(await client.from('applications').select('job_id').eq('id', id).maybeSingle());
  const jobIdOfApplication = textColumn(foundOrThrow(found, 'Application'), 'job_id');
  orThrow(await client.from('applications').delete().eq('id', id));
  orThrow(await client.from('jobs').update({ status: 'new' }).eq('id', jobIdOfApplication).eq('status', 'applied'));
}

export function buildApplications(client: Client): ApplicationsApi {
  return {
    list: guarded((query?: ApplicationListQuery) => listApplications(client, query)),
    apply: guarded((input: ApplyInput) => applyToJob(client, input)),
    update: guarded((id: string, patch: ApplicationPatch) => updateApplication(client, id, patch)),
    remove: guarded((id: string) => removeApplication(client, id)),
  };
}
